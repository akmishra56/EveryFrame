import type { FastifyInstance } from 'fastify';
import { logError } from '../activity/ActivityLogService.js';
import { requireAuth } from '../auth/session.js';
import { CdpConnectionError, listTargets } from '../cdp/targets.js';

export async function cdpRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/cdp/targets', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const targets = await listTargets();
      return { targets };
    } catch (err) {
      if (err instanceof CdpConnectionError) {
        request.log.warn({ err }, 'CDP connection failed');
        logError(request.session.userId!, 'Chrome connection lost while listing tabs.');
        return reply.code(503).send({ error: 'chrome_unreachable', message: err.message });
      }
      request.log.error({ err }, 'Unexpected error listing CDP targets');
      logError(request.session.userId!, 'Unexpected error listing browser tabs.');
      return reply
        .code(500)
        .send({ error: 'internal_error', message: 'Something went wrong listing browser tabs.' });
    }
  });
}
