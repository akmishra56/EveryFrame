import { useEffect, useRef, useState } from 'react';
import type { WsLogMessage } from './types';

/** Live capture-log events over WS /ws/log, newest first. */
export function useLiveLog(enabled: boolean): WsLogMessage[] {
  const [messages, setMessages] = useState<WsLogMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/log`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WsLogMessage;
        setMessages((prev) => {
          const withoutStale = prev.filter((m) => m.id !== data.id);
          return [data, ...withoutStale].slice(0, 200);
        });
      } catch {
        // ignore malformed message
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [enabled]);

  return messages;
}
