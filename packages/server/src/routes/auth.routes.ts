import type { FastifyInstance } from 'fastify';
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  ProfileValidationError,
  changePassword,
  completeLogin,
  getPublicUser,
  login,
  register,
  updateProfile,
} from '../auth/AuthService.js';
import { requireAuth } from '../auth/session.js';
import { authRateLimit } from '../rateLimits.js';

interface RegisterBody {
  email: string;
  password: string;
  displayName?: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface ProfileBody {
  displayName: string;
}

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: RegisterBody }>(
    '/api/auth/register',
    { config: { rateLimit: authRateLimit(5, '15 minutes') } },
    async (request, reply) => {
      const { email, password, displayName } = request.body ?? ({} as RegisterBody);
      if (!email || !password || password.length < 8) {
        return reply
          .code(400)
          .send({ error: 'invalid_input', message: 'Email and an 8+ character password are required.' });
      }
      try {
        const user = await register(email, password, displayName ?? '');
        return reply.code(201).send({ user });
      } catch (err) {
        if (err instanceof EmailAlreadyRegisteredError) {
          return reply.code(409).send({ error: 'email_taken', message: err.message });
        }
        request.log.error({ err }, 'Registration failed');
        return reply.code(500).send({ error: 'internal_error', message: 'Could not create account.' });
      }
    },
  );

  app.post<{ Body: LoginBody }>(
    '/api/auth/login',
    { config: { rateLimit: authRateLimit(10, '15 minutes') } },
    async (request, reply) => {
      const { email, password } = request.body ?? ({} as LoginBody);
      if (!email || !password) {
        return reply.code(400).send({ error: 'invalid_input', message: 'Email and password are required.' });
      }
      try {
        const result = await login(email, password);
        if (result.mfaRequired) {
          request.session.mfaPendingUserId = result.user.id;
          return { mfaRequired: true };
        }
        request.session.userId = result.user.id;
        completeLogin(result.user.id);
        return { mfaRequired: false, user: result.user };
      } catch (err) {
        if (err instanceof InvalidCredentialsError) {
          return reply.code(401).send({ error: 'invalid_credentials', message: err.message });
        }
        request.log.error({ err }, 'Login failed');
        return reply.code(500).send({ error: 'internal_error', message: 'Could not log in.' });
      }
    },
  );

  app.post('/api/auth/logout', { preHandler: [requireAuth, app.csrfProtection] }, async (request, reply) => {
    await new Promise<void>((resolve, reject) => {
      request.session.destroy((err) => (err ? reject(err) : resolve()));
    });
    reply.clearCookie('sid');
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = getPublicUser(request.session.userId!);
    if (!user) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    return { user };
  });

  app.get('/api/auth/csrf-token', async (_request, reply) => {
    return { csrfToken: await reply.generateCsrf() };
  });

  app.put<{ Body: ProfileBody }>(
    '/api/auth/profile',
    { preHandler: [requireAuth, app.csrfProtection] },
    async (request, reply) => {
      try {
        const user = updateProfile(request.session.userId!, request.body?.displayName ?? '');
        return { user };
      } catch (err) {
        if (err instanceof ProfileValidationError) {
          return reply.code(400).send({ error: 'invalid_input', message: err.message });
        }
        throw err;
      }
    },
  );

  app.post<{ Body: ChangePasswordBody }>(
    '/api/auth/change-password',
    { preHandler: [requireAuth, app.csrfProtection] },
    async (request, reply) => {
      const { currentPassword, newPassword } = request.body ?? ({} as ChangePasswordBody);
      try {
        await changePassword(request.session.userId!, currentPassword ?? '', newPassword ?? '');
        return { ok: true };
      } catch (err) {
        if (err instanceof ProfileValidationError) {
          return reply.code(400).send({ error: 'invalid_input', message: err.message });
        }
        if (err instanceof InvalidCredentialsError) {
          return reply.code(401).send({ error: 'invalid_credentials', message: 'Current password is incorrect.' });
        }
        throw err;
      }
    },
  );
}
