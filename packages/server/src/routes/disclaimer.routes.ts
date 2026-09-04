import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/session.js';
import { insertDisclaimerAcceptance } from '../db/disclaimerRepo.js';

export async function disclaimerRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/disclaimer/accept', { preHandler: [requireAuth, app.csrfProtection] }, async (request) => {
    insertDisclaimerAcceptance(request.session.userId!);
    return { ok: true };
  });
}
