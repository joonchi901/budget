/**
 * This device's copy of the data, in IndexedDB `budget` (docs/sync-plan.md §4.1). The server holds
 * the truth: the copy may go at any time (§8.16) and comes again from the server. Every call fails
 * quietly; without IndexedDB (private browsing, say) the app keeps to memory as before.
 */
import type { Snapshot } from '../../shared/sync';

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
