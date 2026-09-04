import type { FastifyInstance } from 'fastify';
import { completeLogin } from '../auth/AuthService.js';
import {
  buildEnrollmentQr,
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCode,
  verifyRecoveryCode,
  verifyTotpCode,
} from '../auth/MfaService.js';
import { verifyPassword } from '../auth/password.js';
import { requireAuth, requireMfaPending } from '../auth/session.js';
import { decryptSecret, encryptSecret } from '../crypto/secretBox.js';
import {
  clearRecoveryCodes,
  listUnusedRecoveryCodes,
  markRecoveryCodeUsed,
  replaceRecoveryCodes,
} from '../db/mfaRecoveryCodesRepo.js';
import { findById, setMfaEnabled, setMfaSecret } from '../db/usersRepo.js';

interface ConfirmBody {
  code: string;
}

interface VerifyBody {
  code?: string;
  recoveryCode?: string;
}

interface DisableBody {
  password: string;
}

export async function mfaRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/mfa/enroll', { preHandler: [requireAuth, app.csrfProtection] }, async (request, reply) => {
    const user = findById(request.session.userId!);
    if (!user) return reply.code(401).send({ error: 'not_authenticated' });

    const secret = generateSecret();
    setMfaSecret(user.id, encryptSecret(secret));
    const qrDataUrl = await buildEnrollmentQr(user.email, secret);
    return { qrDataUrl, secret };
  });

  app.post<{ Body: ConfirmBody }>(
    '/api/auth/mfa/confirm',
    { preHandler: [requireAuth, app.csrfProtection] },
    async (request, reply) => {
      const user = findById(request.session.userId!);
      if (!user) return reply.code(401).send({ error: 'not_authenticated' });
      if (!user.mfa_secret_encrypted) {
        return reply.code(400).send({ error: 'not_enrolled', message: 'Start enrollment before confirming.' });
      }
      const { code } = request.body ?? ({} as ConfirmBody);
      const secret = decryptSecret(user.mfa_secret_encrypted);
      if (!code || !(await verifyTotpCode(secret, code))) {
        return reply.code(401).send({ error: 'invalid_code', message: 'That code did not verify. Try again.' });
      }

      setMfaEnabled(user.id, true);
      const recoveryCodes = generateRecoveryCodes();
      const hashed = await Promise.all(recoveryCodes.map((c) => hashRecoveryCode(c)));
      replaceRecoveryCodes(user.id, hashed);

      return { ok: true, recoveryCodes };
    },
  );

  app.post<{ Body: VerifyBody }>(
    '/api/auth/mfa',
    { preHandler: [requireMfaPending, app.csrfProtection] },
    async (request, reply) => {
      const userId = request.session.mfaPendingUserId!;
      const user = findById(userId);
      if (!user || !user.mfa_secret_encrypted) {
        return reply.code(400).send({ error: 'no_mfa_pending', message: 'No pending MFA challenge for this session.' });
      }

      const { code, recoveryCode } = request.body ?? ({} as VerifyBody);
      let verified = false;

      if (code) {
        const secret = decryptSecret(user.mfa_secret_encrypted);
        verified = await verifyTotpCode(secret, code);
      } else if (recoveryCode) {
        const candidates = listUnusedRecoveryCodes(userId);
        for (const candidate of candidates) {
          if (await verifyRecoveryCode(candidate.code_hash, recoveryCode)) {
            markRecoveryCodeUsed(candidate.id);
            verified = true;
            break;
          }
        }
      } else {
        return reply.code(400).send({ error: 'invalid_input', message: 'Provide code or recoveryCode.' });
      }

      if (!verified) {
        return reply.code(401).send({ error: 'invalid_code', message: 'That code did not verify.' });
      }

      request.session.userId = userId;
      delete request.session.mfaPendingUserId;
      completeLogin(userId);
      return {
        user: { id: user.id, email: user.email, displayName: user.display_name, mfaEnabled: true },
      };
    },
  );

  app.post<{ Body: DisableBody }>(
    '/api/auth/mfa/disable',
    { preHandler: [requireAuth, app.csrfProtection] },
    async (request, reply) => {
      const user = findById(request.session.userId!);
      if (!user) return reply.code(401).send({ error: 'not_authenticated' });

      const { password } = request.body ?? ({} as DisableBody);
      if (!password || !(await verifyPassword(user.password_hash, password))) {
        return reply.code(401).send({ error: 'invalid_credentials', message: 'Re-enter your password to disable MFA.' });
      }

      setMfaEnabled(user.id, false);
      setMfaSecret(user.id, null);
      clearRecoveryCodes(user.id);
      return { ok: true };
    },
  );
}
