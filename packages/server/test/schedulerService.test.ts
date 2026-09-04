import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.EVERYFRAME_DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const captureFrameMock = vi.fn();
const deliverFrameMock = vi.fn();
vi.mock('../src/capture/DeliveryService.js', () => ({
  captureFrame: (...args: unknown[]) => captureFrameMock(...args),
  deliverFrame: (...args: unknown[]) => deliverFrameMock(...args),
}));

const sendMessageMock = vi.fn(async () => ({ ok: true }));
vi.mock('../src/telegram/TelegramClient.js', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
  sendPhoto: vi.fn(),
}));

const { start, stop, getStatus } = await import('../src/scheduler/SchedulerService.js');
const { upsert } = await import('../src/config/ConfigService.js');
const { createUser } = await import('../src/db/usersRepo.js');
const { hashPassword } = await import('../src/auth/password.js');
const { listActivityLog } = await import('../src/db/activityLogRepo.js');

async function makeUser(email: string): Promise<number> {
  return createUser(email, await hashPassword('correct-horse-battery-staple'), email).id;
}

function baseConfigInput(overrides: Record<string, unknown> = {}) {
  return {
    tabTargetId: 'FAKE-TARGET',
    tabDisplayName: 'Fake tab',
    intervalSeconds: 1,
    namePattern: 'fake-tab',
    startTime: '00:00',
    endTime: '23:59',
    activeDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    botToken: 'fake:token',
    channelId: '@fake',
    captionLabel: 'fake-tab',
    captionTemplate: '{label} generated at {time} on {date}',
    failureAlertThreshold: 2,
    ...overrides,
  };
}

describe('SchedulerService - auto-pause on consecutive failures', () => {
  afterEach(() => {
    vi.useRealTimers();
    captureFrameMock.mockReset();
    deliverFrameMock.mockReset();
    sendMessageMock.mockClear();
  });

  it('stops itself and sends one Telegram alert after N consecutive capture failures', async () => {
    const userId = await makeUser('scheduler-pause@example.com');
    upsert(userId, baseConfigInput());
    captureFrameMock.mockRejectedValue(new Error('tab closed'));

    vi.useFakeTimers();
    start(userId);
    expect(getStatus(userId).running).toBe(true);

    await vi.advanceTimersByTimeAsync(1000); // failure 1 - still running
    expect(getStatus(userId).running).toBe(true);
    expect(getStatus(userId).paused).toBe(false);

    await vi.advanceTimersByTimeAsync(1000); // failure 2 - threshold reached

    const status = getStatus(userId);
    expect(status.running).toBe(false);
    expect(status.paused).toBe(true);
    expect(status.pauseReason).toBeTruthy();
    expect(sendMessageMock).toHaveBeenCalledTimes(1);

    const logs = listActivityLog(userId, 'error');
    expect(logs.some((l) => l.summary.includes('auto-paused'))).toBe(true);
  });

  it('resets the failure count on a successful tick, never pausing', async () => {
    const userId = await makeUser('scheduler-ok@example.com');
    upsert(userId, baseConfigInput());
    captureFrameMock.mockResolvedValue({ filename: 'x.png', filePath: '/tmp/x.png' });
    deliverFrameMock.mockResolvedValue({ ok: true });

    vi.useFakeTimers();
    start(userId);
    await vi.advanceTimersByTimeAsync(5000); // 5 successful ticks

    const status = getStatus(userId);
    expect(status.running).toBe(true);
    expect(status.paused).toBe(false);
    expect(sendMessageMock).not.toHaveBeenCalled();
    stop(userId);
  });

  it('start() after an auto-pause clears the paused state and resumes', async () => {
    const userId = await makeUser('scheduler-resume@example.com');
    upsert(userId, baseConfigInput());
    captureFrameMock.mockRejectedValue(new Error('tab closed'));

    vi.useFakeTimers();
    start(userId);
    await vi.advanceTimersByTimeAsync(2000);
    expect(getStatus(userId).paused).toBe(true);

    captureFrameMock.mockResolvedValue({ filename: 'x.png', filePath: '/tmp/x.png' });
    deliverFrameMock.mockResolvedValue({ ok: true });
    start(userId);

    const status = getStatus(userId);
    expect(status.running).toBe(true);
    expect(status.paused).toBe(false);
    expect(status.pauseReason).toBe(null);
    stop(userId);
  });

  it('failureAlertThreshold: 0 disables auto-pause and the alert entirely', async () => {
    const userId = await makeUser('scheduler-disabled@example.com');
    upsert(userId, baseConfigInput({ failureAlertThreshold: 0 }));
    captureFrameMock.mockRejectedValue(new Error('tab closed'));

    vi.useFakeTimers();
    start(userId);
    await vi.advanceTimersByTimeAsync(10_000); // 10 consecutive failures - would have paused long ago at threshold 2

    expect(getStatus(userId).running).toBe(true);
    expect(getStatus(userId).paused).toBe(false);
    expect(sendMessageMock).not.toHaveBeenCalled();
    stop(userId);
  });
});
