import type { FastifyInstance } from 'fastify';
import { subscribe } from '../ws/log.js';

export async function wsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ws/log', { websocket: true }, (socket, request) => {
    const userId = request.session.userId;
    if (!userId) {
      socket.close(4001, 'not_authenticated');
      return;
    }
    subscribe(userId, socket);
  });
}
