import { DurableObject } from 'cloudflare:workers';
import type { Presence, RealtimeMessage } from '../shared/types';
import { sessionByHash } from '../server/auth';
import type { Env } from '../server/env';
import { getRevision, ledgerById } from '../server/storage';

interface Attachment {
  householdId: string;
  tokenHash: string;
  presence: Presence;
}

export class HouseholdRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/notify' && request.method === 'POST') {
      const body = (await request.json()) as { revision: number };
      if (!Number.isSafeInteger(body.revision))
        return new Response('Invalid revision', { status: 400 });
      const connections = await this.authorizedConnections();
      for (const { socket } of connections)
        this.send(socket, { type: 'revision', revision: body.revision });
      return new Response('ok');
    }
    if (path === '/revoke' && request.method === 'POST') {
      const body = (await request.json()) as { tokenHash: string };
      for (const socket of this.ctx.getWebSockets()) {
        if (this.attachment(socket)?.tokenHash === body.tokenHash)
          socket.close(1008, 'Session ended');
      }
      await this.broadcastPresence();
      return new Response('ok');
    }
    if (path !== '/connect' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Not found', { status: 404 });
    }
    const tokenHash = request.headers.get('X-Budget-Session');
    const householdId = request.headers.get('X-Budget-Household');
    const session = tokenHash ? await sessionByHash(this.env.DB, tokenHash) : null;
    if (!session || session.householdId !== householdId)
      return new Response('Unauthorized', { status: 401 });
    const ledgerId = new URL(request.url).searchParams.get('ledgerId') ?? 'main';
    if (!(await ledgerById(this.env.DB, householdId, ledgerId)))
      return new Response('Unknown ledger', { status: 404 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      householdId: session.householdId,
      tokenHash: session.tokenHash,
      presence: {
        userId: session.user.id,
        name: session.user.name,
        color: session.user.color,
        ledgerId,
        transactionId: null,
        field: null,
      },
    } satisfies Attachment);
    this.send(server, { type: 'revision', revision: await getRevision(this.env.DB, householdId) });
    await this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > 4096) {
      socket.close(1009, 'Message too large');
      return;
    }
    const attachment = this.attachment(socket);
    const session = attachment ? await sessionByHash(this.env.DB, attachment.tokenHash) : null;
    if (!attachment || !session || session.householdId !== attachment.householdId) {
      socket.close(1008, 'Session ended');
      return;
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(message);
    } catch {
      this.send(socket, { type: 'error', message: '메시지 형식을 확인해 주세요.' });
      return;
    }
    if (!body || body.type !== 'presence') {
      this.send(socket, { type: 'error', message: '지원하지 않는 메시지입니다.' });
      return;
    }
    const ledgerId =
      typeof body.ledgerId === 'string' ? body.ledgerId : attachment.presence.ledgerId;
    if (!(await ledgerById(this.env.DB, attachment.householdId, ledgerId))) return;
    const transactionId =
      typeof body.transactionId === 'string' && body.transactionId.length <= 100
        ? body.transactionId
        : null;
    const field = typeof body.field === 'string' && body.field.length <= 80 ? body.field : null;
    if (transactionId) {
      const transaction = await this.env.DB.prepare(
        `SELECT ledger_id FROM transactions
        WHERE household_id = ? AND id = ? AND deleted_at IS NULL`,
      )
        .bind(attachment.householdId, transactionId)
        .first<{ ledger_id: string }>();
      if (!transaction || transaction.ledger_id !== ledgerId) {
        this.send(socket, {
          type: 'error',
          message: '원본 가계부에 속한 내역만 선택할 수 있습니다.',
        });
        return;
      }
    }
    attachment.presence = { ...attachment.presence, ledgerId, transactionId, field };
    socket.serializeAttachment(attachment);
    await this.broadcastPresence();
  }

  async webSocketClose(socket: WebSocket, code: number): Promise<void> {
    // 1005/1006/1015 can describe a received disconnect but cannot be sent.
    socket.close([1005, 1006, 1015].includes(code) ? 1000 : code);
    await this.broadcastPresence(socket);
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    socket.close(1011, 'Connection error');
    await this.broadcastPresence(socket);
  }

  private attachment(socket: WebSocket): Attachment | null {
    try {
      return socket.deserializeAttachment() as Attachment | null;
    } catch {
      return null;
    }
  }

  private send(socket: WebSocket, message: RealtimeMessage): void {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      /* The next connection snapshot omits closed sockets. */
    }
  }

  private async authorizedConnections(
    excluded?: WebSocket,
  ): Promise<{ socket: WebSocket; attachment: Attachment }[]> {
    const result: { socket: WebSocket; attachment: Attachment }[] = [];
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === excluded || socket.readyState !== WebSocket.OPEN) continue;
      const attachment = this.attachment(socket);
      let valid = false;
      if (attachment) {
        try {
          const session = await sessionByHash(this.env.DB, attachment.tokenHash);
          valid = session?.householdId === attachment.householdId;
        } catch {
          /* Fail closed if current authorization cannot be checked. */
        }
      }
      if (valid && attachment) result.push({ socket, attachment });
      else {
        this.send(socket, {
          type: 'error',
          message: '로그인 세션이 종료되었습니다. 다시 로그인해 주세요.',
        });
        socket.close(1008, 'Session ended');
      }
    }
    return result;
  }

  private async broadcastPresence(excluded?: WebSocket): Promise<void> {
    const connections = await this.authorizedConnections(excluded);
    for (const recipient of connections) {
      const peers = connections
        .filter(
          ({ socket, attachment }) =>
            socket !== recipient.socket &&
            attachment.presence.ledgerId === recipient.attachment.presence.ledgerId,
        )
        .map(({ attachment }) => attachment.presence);
      this.send(recipient.socket, { type: 'presence', peers });
    }
  }
}
