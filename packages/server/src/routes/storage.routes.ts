import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/session.js';
import { ArchiveDestinationError, runArchive } from '../storage/ArchiveService.js';
import {
  StorageValidationError,
  getHistory,
  getSettings,
  saveSettings,
  type StorageSettingsInput,
} from '../storage/StorageService.js';

export async function storageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/storage/settings', { preHandler: requireAuth }, async (request) => {
    const settings = await getSettings(request.session.userId!);
    return { settings };
  });

  app.put<{ Body: StorageSettingsInput }>(
    '/api/storage/settings',
    { preHandler: [requireAuth, app.csrfProtection] },
    async (request, reply) => {
      try {
        saveSettings(request.session.userId!, request.body);
        const settings = await getSettings(request.session.userId!);
        return { settings };
      } catch (err) {
        if (err instanceof StorageValidationError) {
          return reply.code(400).send({ error: 'invalid_input', message: err.message });
        }
        throw err;
      }
    },
  );

  app.post('/api/storage/archive', { preHandler: [requireAuth, app.csrfProtection] }, async (request, reply) => {
    try {
      const result = await runArchive(request.session.userId!);
      return { ran: Boolean(result), result };
    } catch (err) {
      if (err instanceof ArchiveDestinationError) {
        return reply.code(400).send({ error: 'archive_destination_unreachable', message: err.message });
      }
      request.log.error({ err }, 'Manual archive run failed');
      return reply.code(500).send({ error: 'internal_error', message: 'Archive run failed.' });
    }
  });

  app.get('/api/storage/history', { preHandler: requireAuth }, async (request) => {
    return { history: getHistory(request.session.userId!) };
  });
}
