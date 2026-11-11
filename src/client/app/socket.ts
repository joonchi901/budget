import type { Id } from '../../shared/ledger';

/** Waits before connecting again after the socket drops; the last repeats (docs/sync-plan.md §5.4). */
const AGAIN = [1000, 2000, 5000, 30000];
/**
 * A ping this often keeps the connection up and finds one gone without a close event (sleep, a
 * dead network): within PING + ANSWER, no later than P2's longest wait between checks (30 s).
 */
const PING = 25000;
/** How long a ping waits for an answer before the socket counts as gone. */
const ANSWER = 3000;

/**
 * Keeps a socket open to a shared ledger's room while it shows (docs/sync-plan.md §5.4). The room
 * sends only `{ seq }`, a signal that the ledger changed up to that point, for `poke`; the data
 * still comes through the feed. `open` says when the socket comes up and goes down: while it is
 * down the caller polls, and it connects again after AGAIN. The server closes it with 4403 for a
 * member who went: then `removed`, and no new connection. Returns what closes it for good.
 * Without WebSocket it never opens.
 */
export function watchRoom(
  ledgerId: Id,
  on: { poke(seq: number): void; open(up: boolean): void; removed(): void },
) {
  if (typeof WebSocket === 'undefined') return () => {};
  let socket: WebSocket | undefined;
  let tries = 0;
  let timer: number | undefined;
  let ping: number | undefined;
  /** Set while a ping waits for its answer. */
  let waiting: number | undefined;
  let done = false;
  const down = (code?: number) => {
    window.clearInterval(ping);
    window.clearTimeout(waiting);
    waiting = undefined;
    if (socket) socket.onclose = socket.onmessage = null;
    socket = undefined;
    if (done) return;
    on.open(false);
    if (code === 4403) return on.removed();
    timer = window.setTimeout(connect, AGAIN[Math.min(tries++, AGAIN.length - 1)]);
  };
  /** A ping now; without an answer in ANSWER the socket is taken for gone. */
  const probe = () => {
    if (socket?.readyState !== WebSocket.OPEN || waiting) return;
    socket.send('ping');
    waiting = window.setTimeout(() => {
      socket?.close();
      down();
    }, ANSWER);
  };
  // Back on the page or the network: a socket that died meanwhile is found at once.
  const awake = () => {
    if (document.visibilityState === 'visible') probe();
  };
  const connect = () => {
    const url = new URL(`/api/ledgers/${ledgerId}/socket`, location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = (socket = new WebSocket(url));
    ws.onopen = () => {
      tries = 0;
      on.open(true);
      ping = window.setInterval(probe, PING);
    };
    ws.onmessage = ({ data }) => {
      window.clearTimeout(waiting);
      waiting = undefined;
      const seq = data === 'pong' ? undefined : Number(JSON.parse(String(data)).seq);
      if (seq) on.poke(seq);
    };
    ws.onclose = ({ code }) => down(code);
  };
  document.addEventListener('visibilitychange', awake);
  window.addEventListener('online', awake);
  connect();
  return () => {
    done = true;
    document.removeEventListener('visibilitychange', awake);
    window.removeEventListener('online', awake);
    window.clearTimeout(timer);
    socket?.close();
    down();
  };
}
