import type { WebSocket } from 'ws';

const subscribers = new Map<number, Set<WebSocket>>();

export function subscribe(userId: number, socket: WebSocket): void {
  let set = subscribers.get(userId);
  if (!set) {
    set = new Set();
    subscribers.set(userId, set);
  }
  set.add(socket);
  socket.on('close', () => {
    set!.delete(socket);
    if (set!.size === 0) subscribers.delete(userId);
  });
}

export function broadcastToUser(userId: number, payload: unknown): void {
  const set = subscribers.get(userId);
  if (!set || set.size === 0) return;
  const message = JSON.stringify(payload);
  for (const socket of set) {
    if (socket.readyState === socket.OPEN) socket.send(message);
  }
}
