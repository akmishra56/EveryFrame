import {
  createUser,
  findByEmail,
  findById,
  touchLastLogin,
  updateDisplayName,
  updatePassword,
  type UserRow,
} from '../db/usersRepo.js';
import { hashPassword, verifyPassword } from './password.js';

export interface PublicUser {
  id: number;
  email: string;
  displayName: string;
  mfaEnabled: boolean;
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    mfaEnabled: Boolean(row.mfa_enabled),
  };
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password.');
  }
}

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('An account with this email already exists.');
  }
}

export async function register(email: string, password: string, displayName: string): Promise<PublicUser> {
  const normalizedEmail = email.trim().toLowerCase();
  if (findByEmail(normalizedEmail)) throw new EmailAlreadyRegisteredError();
  const passwordHash = await hashPassword(password);
  const row = createUser(normalizedEmail, passwordHash, displayName.trim() || normalizedEmail);
  return toPublicUser(row);
}

export interface LoginResult {
  user: PublicUser;
  mfaRequired: boolean;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const row = findByEmail(email.trim().toLowerCase());
  if (!row) throw new InvalidCredentialsError();
  const valid = await verifyPassword(row.password_hash, password);
  if (!valid) throw new InvalidCredentialsError();
  return { user: toPublicUser(row), mfaRequired: Boolean(row.mfa_enabled) };
}

/** Call once a session is actually established (immediately, or after MFA passes). */
export function completeLogin(userId: number): void {
  touchLastLogin(userId);
}

export function getPublicUser(id: number): PublicUser | undefined {
  const row = findById(id);
  return row ? toPublicUser(row) : undefined;
}

export class ProfileValidationError extends Error {}

export function updateProfile(userId: number, displayName: string): PublicUser {
  const trimmed = displayName.trim();
  if (!trimmed) throw new ProfileValidationError('Display name cannot be empty.');
  updateDisplayName(userId, trimmed);
  return getPublicUser(userId)!;
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) {
    throw new ProfileValidationError('New password must be at least 8 characters.');
  }
  const row = findById(userId);
  if (!row) throw new InvalidCredentialsError();
  const valid = await verifyPassword(row.password_hash, currentPassword);
  if (!valid) throw new InvalidCredentialsError();
  const hash = await hashPassword(newPassword);
  updatePassword(userId, hash);
}
