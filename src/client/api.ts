import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bootstrap, Presence, RealtimeMessage } from '../shared/types';

export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public current?: unknown,
  ) {
    super(message);
  }
}
export async function request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new RequestError(
      '연결을 확인한 뒤 다시 시도해 주세요. 입력 내용은 유지됩니다.',
      0,
      'NETWORK',
    );
  }
  const data: unknown = await response.json();
  if (!response.ok) {
    const detail = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    throw new RequestError(
      typeof detail.error === 'string' ? detail.error : '요청을 처리하지 못했어요.',
      response.status,
      typeof detail.code === 'string' ? detail.code : 'UNKNOWN',
      detail.current,
    );
  }
  return data as T;
}

export function useBudget(ledgerId: string) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [peers, setPeers] = useState<Presence[]>([]);
  const socket = useRef<WebSocket | null>(null);
  const epoch = useRef(0);
  const selected = useRef({ transactionId: null as string | null, field: null as string | null });
  const refresh = useCallback(async () => {
    const run = epoch.current;
    try {
      const next = await request<Bootstrap>('/api/bootstrap');
      if (run !== epoch.current) return;
      setData((previous) =>
        !previous || previous.user.id !== next.user.id || next.revision >= previous.revision
          ? next
          : previous,
      );
      setError('');
    } catch (e) {
      if (run !== epoch.current) return;
      if (e instanceof RequestError && e.status === 401) {
        setData(null);
        setError('');
      } else setError((e as Error).message);
    } finally {
      if (run === epoch.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const userId = data?.user.id;
  const revision = useRef(0);
  revision.current = data?.revision ?? 0;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    function connect() {
      if (cancelled || document.hidden) return;
      setConnection('connecting');
      const ws = new WebSocket(
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws?ledgerId=${encodeURIComponent(ledgerId)}`,
      );
      socket.current = ws;
      ws.onopen = () => {
        if (cancelled) return;
        delay = 1000;
        setConnection('live');
        ws.send(JSON.stringify({ type: 'presence', ledgerId, ...selected.current }));
        void refresh();
      };
      ws.onmessage = (event) => {
        if (cancelled || event.data === 'pong') return;
        let message: RealtimeMessage;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.type === 'presence')
          setPeers(message.peers.filter((peer) => peer.userId !== userId));
        if (message.type === 'revision' && message.revision > revision.current) void refresh();
        if (message.type === 'error') void refresh();
      };
      ws.onclose = () => {
        if (cancelled) return;
        setConnection('offline');
        setPeers([]);
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 15000);
      };
      ws.onerror = () => ws.close();
    }
    connect();
    const reconcile = async () => {
      if (document.hidden) return;
      try {
        const state = await request<{ revision: number }>('/api/revision');
        if (state.revision !== revision.current) await refresh();
      } catch (e) {
        if (e instanceof RequestError && e.status === 401) await refresh();
      }
      if (!socket.current || socket.current.readyState === WebSocket.CLOSED) {
        clearTimeout(retry);
        connect();
      }
    };
    const visibility = () => {
      if (!document.hidden) {
        void refresh();
        void reconcile();
      }
    };
    const timer = setInterval(() => void reconcile(), 60000);
    window.addEventListener('online', visibility);
    window.addEventListener('focus', visibility);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelled = true;
      clearTimeout(retry);
      clearInterval(timer);
      socket.current?.close();
      socket.current = null;
      setPeers([]);
      window.removeEventListener('online', visibility);
      window.removeEventListener('focus', visibility);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [userId, ledgerId, refresh]);
  const presence = useCallback(
    (transactionId: string | null, field: string | null) => {
      selected.current = { transactionId, field };
      if (socket.current?.readyState === WebSocket.OPEN)
        socket.current.send(JSON.stringify({ type: 'presence', ledgerId, transactionId, field }));
    },
    [ledgerId],
  );
  const login = async (id: 'u1' | 'u2') => {
    epoch.current++;
    await request('/api/auth/demo', 'POST', { userId: id });
    await refresh();
  };
  const logout = async () => {
    await request('/api/auth/logout', 'POST', {});
    epoch.current++;
    socket.current?.close();
    setData(null);
  };
  return { data, loading, error, refresh, login, logout, connection, peers, presence };
}
