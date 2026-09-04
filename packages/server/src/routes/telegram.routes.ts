import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/session.js';
import { captureAndSend } from '../capture/DeliveryService.js';
import { CdpConnectionError, TargetNotFoundError } from '../cdp/targets.js';
import { getRawForUser } from '../config/ConfigService.js';

export async function telegramRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/telegram/test', { preHandler: [requireAuth, app.csrfProtection] }, async (request, reply) => {
    const config = getRawForUser(request.session.userId!);
    if (!config) {
      return reply.code(400).send({ error: 'no_config', message: 'Save a configuration before testing.' });
    }

    try {
      const result = await captureAndSend(request.session.userId!, config);
      if (!result.ok) {
        return reply
          .code(502)
          .send({ error: 'telegram_error', message: result.errorDescription ?? 'Telegram delivery failed.' });
      }
      return { ok: true, filename: result.filename };
    } catch (err) {
      if (err instanceof TargetNotFoundError) {
        return reply.code(400).send({ error: 'target_not_found', message: err.message });
      }
      if (err instanceof CdpConnectionError) {
        return reply.code(503).send({ error: 'chrome_unreachable', message: err.message });
      }
      request.log.error({ err }, 'Test send failed');
      return reply.code(500).send({ error: 'internal_error', message: 'Could not send test frame.' });
    }
  });
}
