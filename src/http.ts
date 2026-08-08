export class HttpTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HttpTimeoutError";
  }
}

export function assertPositiveFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number.`);
  }
}

export function assertNonNegativeFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number.`);
  }
}

export function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function sleepWithFullJitter(
  retryIndex: number,
  baseDelayMs: number,
): Promise<void> {
  if (baseDelayMs <= 0) return;
  const maxDelayMs = Math.min(baseDelayMs * 2 ** retryIndex, 5_000);
  const delayMs = Math.floor(Math.random() * maxDelayMs);
  if (delayMs <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  assertPositiveFiniteNumber(timeoutMs, `${label} timeoutMs`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HttpTimeoutError(`${label} timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
