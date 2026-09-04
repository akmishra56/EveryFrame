import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/session.js';
import { NoConfigError, getStatus, start, stop } from '../scheduler/SchedulerService.js';

export async function captureRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/capture/start', { preHandler: [requireAuth, app.csrfProtection] }, async (request, reply) => {
    try {
      start(request.session.userId!);
      return { status: getStatus(request.session.userId!) };
    } catch (err) {
      if (err instanceof NoConfigError) {
        return reply.code(400).send({ error: 'no_config', message: err.message });
      }
      throw err;
    }
  });

  app.post('/api/capture/stop', { preHandler: [requireAuth, app.csrfProtection] }, async (request) => {
    stop(request.session.userId!);
    return { status: getStatus(request.session.userId!) };
  });

  app.get('/api/capture/status', { preHandler: requireAuth }, async (request) => {
    return { status: getStatus(request.session.userId!) };
  });
}
