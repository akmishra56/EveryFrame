import { type ArchiveEventRow, listArchiveEvents } from '../db/archiveEventsRepo.js';
import { getOrDefaultStorageSettings, type StorageSettingsRow, upsertStorageSettings } from '../db/storageSettingsRepo.js';
import { getUsageMb } from './ArchiveService.js';

export class StorageValidationError extends Error {}

export interface StorageSettingsInput {
  thresholdMb: number;
  archivePath?: string | null;
}

export interface PublicStorageSettings {
  thresholdMb: number;
  archivePath: string | null;
  usedMb: number;
  updatedAt: string | null;
}

export async function getSettings(userId: number): Promise<PublicStorageSettings> {
  const row = getOrDefaultStorageSettings(userId);
  const usedMb = await getUsageMb(userId);
  return {
    thresholdMb: row.threshold_mb,
    archivePath: row.archive_path,
    usedMb: Math.round(usedMb * 10) / 10,
    updatedAt: row.updated_at || null,
  };
}

export function saveSettings(userId: number, input: StorageSettingsInput): StorageSettingsRow {
  if (!Number.isInteger(input.thresholdMb) || input.thresholdMb < 1) {
    throw new StorageValidationError('thresholdMb must be a positive integer.');
  }
  return upsertStorageSettings(userId, input.thresholdMb, input.archivePath?.trim() || null);
}

export function getHistory(userId: number): ArchiveEventRow[] {
  return listArchiveEvents(userId);
}
