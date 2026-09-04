export interface PublicUser {
  id: number;
  email: string;
  displayName: string;
  mfaEnabled: boolean;
}

export interface CdpTarget {
  targetId: string;
  title: string;
  url: string;
}

export interface PublicConfig {
  tabTargetId: string;
  tabDisplayName: string;
  intervalSeconds: number;
  namePattern: string;
  startTime: string;
  endTime: string;
  activeDays: string[];
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  botTokenMasked: string;
  channelId: string;
  captionLabel: string;
  captionTemplate: string;
  failureAlertThreshold: number;
  updatedAt: string;
}

export interface ConfigInput {
  tabTargetId: string;
  tabDisplayName: string;
  intervalSeconds: number;
  namePattern: string;
  startTime: string;
  endTime: string;
  activeDays: string[];
  scheduleStartDate?: string | null;
  scheduleEndDate?: string | null;
  botToken?: string;
  channelId: string;
  captionLabel: string;
  captionTemplate: string;
  failureAlertThreshold: number;
}

export interface CaptureStatus {
  running: boolean;
  lastCaptureAt: string | null;
  lastStatus: 'sent' | 'failed' | null;
  nextTickAt: string | null;
  paused: boolean;
  pauseReason: string | null;
}

export interface StorageSettings {
  thresholdMb: number;
  archivePath: string | null;
  usedMb: number;
  updatedAt: string | null;
}

export interface ArchiveEvent {
  id: number;
  archived_at: string;
  file_count: number;
  total_size_mb: number;
  destination_path: string;
}

export type LogCategory = 'error' | 'schedule_change' | 'telegram_send';

export interface LogEntry {
  id: string;
  category: LogCategory;
  summary: string;
  detail: string | null;
  filename: string | null;
  createdAt: string;
}

export interface WsLogMessage {
  id: number;
  filename: string;
  status: 'sending' | 'sent' | 'failed';
  capturedAt?: string;
  error?: string | null;
}
