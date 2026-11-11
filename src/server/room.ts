import { DurableObject } from 'cloudflare:workers';
import type { Env } from './common';

/**
 * A shared ledger's room (docs/sync-plan.md §5): one Durable Object per ledger. It holds no data,
 * only the sockets of the members watching the ledger, each tagged with its user id. After a
 * change in the ledger the Worker sends the log's seq, which goes to every socket as a signal to
 * check the feed (poke). With `?kick=<user id>` that member's sockets then close with 4403: the
 * signal goes to them too, so they learn through the feed at once that the ledger is gone,
 * however long the close takes. The Worker decides who may connect and what changed; sockets
 * hibernate, and pings are answered without waking the object.
 */
export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request) {
    // Set by the Worker after the membership check, never taken from the client.
    const user = request.headers.get('X-User');
    if (user) {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server, [user]);
      return new Response(null, { status: 101, webSocket: client });
    }
    const signal = await request.text();
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(signal);
      } catch {
        // Its page went meanwhile: nothing to tell.
      }
    }
    const kick = new URL(request.url).searchParams.get('kick');
    if (kick) for (const socket of this.ctx.getWebSockets(kick)) socket.close(4403, 'removed');
    return new Response(null, { status: 204 });
  }

  // Clients send only pings, which the auto-response answers.
  webSocketMessage() {}

  // A page that closes its socket (leaving the room) waits for the close to be answered: without
  // this the runtime answers none, and the browser gives up after about 35 s.
  webSocketClose(socket: WebSocket) {
    try {
      socket.close(1000);
    } catch {
      // Closed already: the room closed it (kick), or the connection was lost.
    }
  }
}
