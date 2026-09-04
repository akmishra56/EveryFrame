import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/session.js';
import { ConfigValidationError, getForUser, upsert, type ConfigInput } from '../config/ConfigService.js';

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/config', { preHandler: requireAuth }, async (request, reply) => {
    const config = getForUser(request.session.userId!);
    if (!config) {
      return reply.code(404).send({ error: 'not_found', message: 'No capture configuration yet.' });
    }
    return { config };
  });

  app.put<{ Body: ConfigInput }>(
    '/api/config',
    { preHandler: [requireAuth, app.csrfProtection] },
    async (request, reply) => {
      try {
        const config = upsert(request.session.userId!, request.body);
        return { config };
      } catch (err) {
        if (err instanceof ConfigValidationError) {
          return reply.code(400).send({ error: 'invalid_input', message: err.message });
        }
        request.log.error({ err }, 'Config save failed');
        return reply.code(500).send({ error: 'internal_error', message: 'Could not save configuration.' });
      }
    },
  );
}
