import {
  BULLETIN_ORIGIN,
  SITEMAP_URL,
} from "@/lib/bulletin/constants";
import { CATALOG_SOURCES } from "@/lib/bulletin/sourceRegistry";

export type BulletinFetch = (url: string) => Promise<string>;

export class BulletinFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BulletinFetchError";
  }
}

function allowedRequestUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BulletinFetchError("The requested NYU Bulletin URL is not allowed.");
  }

  const isPublicBulletin =
    url.protocol === "https:" &&
    url.hostname === new URL(BULLETIN_ORIGIN).hostname &&
    url.port === "" &&
    url.username === "" &&
    url.password === "";
  const isAllowedPath =
    url.pathname === new URL(SITEMAP_URL).pathname ||
    CATALOG_SOURCES.some(
      (source) =>
        source.enabled &&
        url.pathname.startsWith(new URL(source.bulletinRoot).pathname),
    );

  if (!isPublicBulletin || !isAllowedPath) {
    throw new BulletinFetchError("The requested NYU Bulletin URL is not allowed.");
  }

  url.hash = "";
  url.search = "";
  return url.toString();
}

function validateOptions(options: {
  timeoutMs: number;
  retries: number;
  userAgent: string;
}) {
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new TypeError("Bulletin fetch timeout must be positive.");
  }
  if (!Number.isInteger(options.retries) || options.retries < 0) {
    throw new TypeError("Bulletin fetch retries must be a non-negative integer.");
  }
  if (options.userAgent.trim() === "") {
    throw new TypeError("Bulletin fetch user agent is required.");
  }
}

export function createBulletinFetch(options: {
  timeoutMs: number;
  retries: number;
  userAgent: string;
}): BulletinFetch {
  const { timeoutMs, retries, userAgent } = options;
  validateOptions({ timeoutMs, retries, userAgent });

  return async (value) => {
    const url = allowedRequestUrl(value);

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          headers: { "user-agent": userAgent },
          redirect: "error",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Bulletin request failed");
        }
        return await response.text();
      } catch {
        if (attempt === retries) {
          throw new BulletinFetchError(
            "Unable to fetch an allowed NYU Bulletin page.",
          );
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new BulletinFetchError(
      "Unable to fetch an allowed NYU Bulletin page.",
    );
  };
}
