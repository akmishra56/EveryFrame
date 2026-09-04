import { randomBytes } from 'node:crypto';
import { generateSecret as generateOtpSecret, generateURI, verify as verifyOtp } from 'otplib';
import QRCode from 'qrcode';
import { hashPassword, verifyPassword } from './password.js';

const ISSUER = 'EveryFrame';

export function generateSecret(): string {
  return generateOtpSecret();
}

export async function verifyTotpCode(secret: string, code: string): Promise<boolean> {
  try {
    const result = await verifyOtp({ secret, token: code });
    return result.valid;
  } catch {
    return false;
  }
}

/** otpauth:// URI as a QR data: URL - works with Google Authenticator, Microsoft Authenticator, or any RFC 6238 app. */
export async function buildEnrollmentQr(email: string, secret: string): Promise<string> {
  const uri = generateURI({ issuer: ISSUER, label: email, secret });
  return QRCode.toDataURL(uri);
}

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(5).toString('hex'); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

export async function hashRecoveryCode(code: string): Promise<string> {
  return hashPassword(code);
}

export async function verifyRecoveryCode(hash: string, code: string): Promise<boolean> {
  return verifyPassword(hash, code);
}
