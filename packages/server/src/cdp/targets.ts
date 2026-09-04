import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export interface CdpTarget {
  targetId: string;
  title: string;
  url: string;
}

export class CdpConnectionError extends Error {
  constructor(cause: unknown) {
    super('Could not connect to Chrome over CDP. Is it running with --remote-debugging-port?');
    this.cause = cause;
  }
}

export class TargetNotFoundError extends Error {
  constructor(targetId: string) {
    super(`No open tab found with target id ${targetId}. It may have been closed.`);
  }
}

const CDP_ENDPOINT = process.env.EVERYFRAME_CDP_ENDPOINT ?? 'http://localhost:9222';

let browserPromise: Promise<Browser> | null = null;

function connect(): Promise<Browser> {
  const promise = chromium
    .connectOverCDP(CDP_ENDPOINT)
    .then((browser) => {
      // Never call browser.close() on a CDP-attached browser - that can terminate
      // the user's real Chrome. Just drop our reference when the session ends.
      browser.on('disconnected', () => {
        if (browserPromise === promise) browserPromise = null;
      });
      return browser;
    })
    .catch((cause: unknown) => {
      if (browserPromise === promise) browserPromise = null;
      throw new CdpConnectionError(cause);
    });
  return promise;
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) browserPromise = connect();
  return browserPromise;
}

async function resolveTargetId(context: BrowserContext, page: Page): Promise<string> {
  const session = await context.newCDPSession(page);
  try {
    const { targetInfo } = await session.send('Target.getTargetInfo');
    return targetInfo.targetId;
  } finally {
    await session.detach().catch(() => {});
  }
}

export async function listTargets(): Promise<CdpTarget[]> {
  const browser = await getBrowser();
  const targets: CdpTarget[] = [];
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const targetId = await resolveTargetId(context, page);
      targets.push({ targetId, title: await page.title(), url: page.url() });
    }
  }
  return targets;
}

/** Re-locates a specific open tab by its CDP target id, for capture. */
export async function getPageByTargetId(targetId: string): Promise<Page> {
  const browser = await getBrowser();
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const id = await resolveTargetId(context, page);
      if (id === targetId) return page;
    }
  }
  throw new TargetNotFoundError(targetId);
}
