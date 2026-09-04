import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface Session {
    userId?: number;
    mfaPendingUserId?: number;
  }
}

/** Fastify preHandler: rejects requests without a fully-authenticated session. */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.session.userId) {
    reply.code(401).send({ error: 'not_authenticated', message: 'Please log in.' });
  }
}

/** Fastify preHandler: rejects requests without a pending post-credentials MFA challenge. */
export async function requireMfaPending(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.session.mfaPendingUserId) {
    reply.code(400).send({ error: 'no_mfa_pending', message: 'No pending MFA challenge for this session.' });
  }
}
