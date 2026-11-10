/**
 * This device's copy of the data and its outbox, in IndexedDB `budget` (docs/sync-plan.md §4.1).
 * The server holds the truth: the copy may go at any time (§8.16) and comes again from the
 * server. Every call fails quietly; without IndexedDB (private browsing, say) the app keeps to
 * memory as before.
 */
import { isSnapshot, type Outgoing, type Snapshot } from '../../shared/sync';

/**
 * Raise it with any change to the stored data's shape or the outbox patch's: a device holding
 * another starts afresh, and older patches are only sent (docs/sync-plan.md §4.1, §4.3).
 */
export const SCHEMA = 1;

let opened: Promise<IDBDatabase> | undefined;
/**
 * The connection, opened again on the next call after it failed or closed: another tab asking for
 * a newer version or deleting the database gets it at once, and a connection the browser lost
 * (iOS) comes back (§4.1).
 */
const open = () =>
  (opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('budget', 1);
    request.onupgradeneeded = ({ oldVersion }) => {
      if (oldVersion >= 1) return;
      request.result.createObjectStore('state');
      request.result.createObjectStore('outbox', { keyPath: 'key', autoIncrement: true });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = db.onclose = () => {
        db.close();
        opened = undefined;
      };
      resolve(db);
    };
    request.onerror = () => {
      opened = undefined;
      reject(request.error);
    };
  }));

/** One request in a transaction of its own, answered once the transaction is done. */
const run = <T>(
  name: 'state' | 'outbox',
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
) => {
  const connection = open();
  return connection
    .then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const transaction = db.transaction(name, mode);
          const request = work(transaction.objectStore(name));
          transaction.oncomplete = () => resolve(request.result);
          transaction.onerror = transaction.onabort = () => reject(transaction.error);
        }),
    )
    .catch((failure) => {
      // A connection lost without a close event opens afresh next time; this one is closed, so
      // failing writes (storage full) do not leave one open each.
      if (opened === connection) {
        opened = undefined;
        connection.then(
          (db) => db.close(),
          () => {},
        );
      }
      throw failure;
    });
};

/** Whether IndexedDB works here, for tabs to share the copy and the outbox. */
export const stored = () =>
  open().then(
    () => true,
    () => false,
  );

/**
 * The stored copy, if a whole one of this SCHEMA is there (a broken one counts as none and is
 * written over next), with the last refusal not yet made good by a snapshot (§4.2). The refusal
 * comes alone after the screen failed to draw the copy (§4.1).
 */
export const readState = () =>
  run('state', 'readonly', (store) => store.get('current'))
    .then((value?: { schema?: number; data?: unknown; refused?: string; userId?: string }) =>
      value?.schema === SCHEMA && isSnapshot(value.data)
        ? { data: value.data, refused: value.refused }
        : value?.refused
          ? { refused: value.refused, userId: value.userId }
          : undefined,
    )
    .catch(() => undefined);

let asked = false;
/**
 * Stores the copy, and `refused` while a refusal in it is not made good; resolves whether it was.
 * The browser is asked once to keep the storage (refusing changes nothing).
 */
export const writeState = (data: Snapshot, refused?: string) => {
  // shortcut: whole state as one value; split into stores once it passes ~10MB.
  if (!asked) {
    asked = true;
    navigator.storage?.persist?.().catch(() => {});
  }
  return run('state', 'readwrite', (store) =>
    store.put({ schema: SCHEMA, seq: data.seq, data, refused }, 'current'),
  ).then(
    () => true,
    () => false,
  );
};

/** Changes IndexedDB would not take: kept in memory, never lost while the page lives. */
let unstored: Outgoing[] = [];
let unstoredKey = 0;

/** Puts a change in the outbox; resolves its key. */
export const pushOutbox = (item: Omit<Outgoing, 'key'>) =>
  run('outbox', 'readwrite', (store) => store.add(item) as IDBRequest<number>).catch(() => {
    // shortcut: one kept in memory goes after the stored ones, and only from this tab once it
    // syncs; fine while IndexedDB fails as a whole (every tab then syncs for itself).
    const key = --unstoredKey; // below zero: never an IndexedDB key
    unstored.push({ ...item, key });
    return key;
  });

/** The changes waiting, oldest first. */
export const readOutbox = () =>
  run('outbox', 'readonly', (store) => store.getAll() as IDBRequest<Outgoing[]>)
    .catch(() => [])
    .then((queued) => [...queued, ...unstored]);

/** Takes a sent change out; one left by a failure goes again later, which writes allow. */
export const removeOutbox = (key: number) => {
  unstored = unstored.filter((item) => item.key !== key);
  return key < 0
    ? Promise.resolve()
    : run('outbox', 'readwrite', (store) => store.delete(key)).then(
        () => {},
        () => {},
      );
};

/**
 * Forgets the copy alone: after a 401 the outbox waits for the account to sign in again (§4.5).
 * With `keepRefusal` (the screen failed to draw it, §4.1) a refusal not yet told stays.
 */
export const clearCopy = (keepRefusal = false) =>
  run('state', 'readwrite', (store) => {
    const request = store.get('current');
    request.onsuccess = () => {
      const { refused, data, userId } = (keepRefusal && request.result) || {};
      // With its account, for it to be told to that account only; one kept before keeps its own.
      if (refused) store.put({ refused, userId: data?.user?.id ?? userId }, 'current');
      else store.delete('current');
    };
    return request;
  }).then(
    () => {},
    () => {},
  );

/**
 * Forgets what the outbox's changes did to the copy, with a copy the screen failed to draw, as
 * they may be what broke it: the changes themselves still go, only unshown until sent (§4.1).
 */
export const dropPatches = () => {
  unstored = unstored.map(({ patch, ...item }) => item);
  return run('outbox', 'readwrite', (store) => {
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const { patch, ...item } = cursor.value as Outgoing;
      cursor.update(item);
      cursor.continue();
    };
    return request;
  }).then(
    () => {},
    () => {},
  );
};

/** Forgets the copy and the outbox (docs/sync-plan.md §4.5, §8.16). */
export const clearState = () => {
  unstored = [];
  return Promise.all([
    run('state', 'readwrite', (store) => store.clear()),
    run('outbox', 'readwrite', (store) => store.clear()),
  ]).then(
    () => {},
    () => {},
  );
};
