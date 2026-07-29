/**
 * Retries a database operation that fails with a transient connection error —
 * common when talking to a remote/free-tier Postgres (e.g. Neon) that drops
 * idle or long connections. Non-connection errors are rethrown immediately.
 */
const TRANSIENT = /terminated|reset|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|Connection|timeout/i;

function isTransient(error: unknown): boolean {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const e = current as { message?: string; code?: string; cause?: unknown };
    if (e.message) parts.push(e.message);
    if (e.code) parts.push(e.code);
    current = e.cause;
  }
  return TRANSIENT.test(parts.join(" "));
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withDbRetry<T>(
  operation: () => Promise<T>,
  { attempts = 5, label = "database operation" }: { attempts?: number; label?: string } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !isTransient(error)) throw error;
      const wait = Math.min(1000 * 2 ** (attempt - 1), 8000);
      console.warn(
        `[retry] ${label} dropped the connection (attempt ${attempt}/${attempts}); retrying in ${wait / 1000}s…`,
      );
      await delay(wait);
    }
  }
}
