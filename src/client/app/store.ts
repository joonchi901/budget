/**
 * This device's copy of the data and its outbox, in IndexedDB `budget` (docs/sync-plan.md §4.1).
 * The server holds the truth: the copy may go at any time (§8.16) and comes again from the
 * server. Every call fails quietly; without IndexedDB (private browsing, say) the app keeps to
 * memory as before.
 */
import type { Outgoing, Snapshot } from '../../shared/sync';

/** Raise it with any change to the stored data's shape: a device holding another starts afresh. */
export const SCHEMA = 1;

let opened: Promise<IDBDatabase> | undefined;
const open = () =>
  (opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('budget', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('state');
      request.result.createObjectStore('outbox', { keyPath: 'key', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));

/** One request in a transaction of its own, answered once the transaction is done. */
const run = <T>(
  name: 'state' | 'outbox',
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
) =>
  open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(name, mode);
        const request = work(transaction.objectStore(name));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
      }),
  );

/** Whether IndexedDB works here, for tabs to share the copy and the outbox. */
export const stored = () =>
  open().then(
    () => true,
    () => false,
  );

/** The stored copy, if one of this SCHEMA is there. */
export const readState = () =>
  run('state', 'readonly', (store) => store.get('current'))
    .then((value?: { schema: number; data: Snapshot }) =>
      value?.schema === SCHEMA ? value.data : undefined,
    )
    .catch(() => undefined);

let asked = false;
/**
 * Stores the copy; resolves whether it was. The browser is asked once to keep the storage
 * (refusing changes nothing).
 */
export const writeState = (data: Snapshot) => {
  // shortcut: whole state as one value; split into stores once it passes ~10MB.
  if (!asked) {
    asked = true;
    navigator.storage?.persist?.().catch(() => {});
  }
  return run('state', 'readwrite', (store) =>
    store.put({ schema: SCHEMA, seq: data.seq, data }, 'current'),
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
    // shortcut: one kept in memory goes after the stored ones; fine while IndexedDB fails as a whole.
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
