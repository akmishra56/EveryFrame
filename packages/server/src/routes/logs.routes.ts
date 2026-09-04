import type { FastifyInstance } from 'fastify';
import { getMergedLogs } from '../activity/LogsService.js';
import { requireAuth } from '../auth/session.js';

interface LogsQuery {
  category?: string;
}

const VALID_CATEGORIES = new Set(['error', 'schedule_change', 'telegram_send']);

export async function logsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: LogsQuery }>('/api/logs', { preHandler: requireAuth }, async (request, reply) => {
    const { category } = request.query;
    if (category !== undefined && !VALID_CATEGORIES.has(category)) {
      return reply.code(400).send({ error: 'invalid_input', message: 'Unknown category filter.' });
    }
    return { logs: getMergedLogs(request.session.userId!, category) };
  });
}
