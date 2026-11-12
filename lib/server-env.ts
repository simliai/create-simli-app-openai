import "server-only";

export const isProduction = process.env.NODE_ENV === "production";

/** Hard cap for one conversation, in seconds. Applied to Simli (maxSessionLength) and OpenAI (server hang-up). */
export const SESSION_MAX_SECONDS = 600;
/** Simli ends the session after this many seconds without audio. */
export const SIMLI_MAX_IDLE_SECONDS = 180;
/** Timeout for every request this server makes to Simli or OpenAI. */
export const UPSTREAM_TIMEOUT_MS = 10_000;

/** Thrown when the server is missing configuration. Its message names the variable, so only show it in development. */
export class ConfigError extends Error {}

/** Reads a required environment variable, or throws a ConfigError that says how to fix it. */
export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ConfigError(
      `${name} is not set on the server. Copy .env.example to .env.local, set ${name}, and restart the dev server.`,
    );
  }
  if (/^["'].*["']$/.test(value)) {
    throw new ConfigError(`${name} looks wrapped in extra quotes. Remove them in .env.local.`);
  }
  return value;
}

/** Default face: the Trinity-2 preset "Anna". */
export const DEFAULT_SIMLI_FACE_ID = "bf13113a-355a-4d97-8b90-4edccd1da7b2";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function simliFaceId(): string {
  const faceId = process.env.SIMLI_FACE_ID?.trim() || DEFAULT_SIMLI_FACE_ID;
  if (!UUID.test(faceId)) {
    throw new ConfigError(
      `SIMLI_FACE_ID "${faceId}" is not a face ID (expected a UUID). Copy one from https://app.simli.com or https://docs.simli.com/api-reference/preset-faces.`,
    );
  }
  return faceId;
}

/** JSON response that must never be cached. */
export function noStoreJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Error response for the browser. In production only the short public message
 * is sent (details stay in the server log); in development the detail is
 * appended so setup problems are easy to fix.
 */
export function errorResponse(status: number, publicMessage: string, devDetail?: string): Response {
  const error = !isProduction && devDetail ? `${publicMessage} ${devDetail}` : publicMessage;
  return noStoreJson({ error }, status);
}

/** Maps a thrown error to a response; ConfigError details are shown in development only. */
export function configErrorResponse(err: unknown): Response {
  if (err instanceof ConfigError) {
    console.error(err.message);
    return errorResponse(500, "The server is not configured.", err.message);
  }
  throw err;
}

/**
 * Fail closed in production: session routes spend money, so they refuse to run
 * unauthenticated in production unless ALLOW_UNAUTHENTICATED_SESSIONS="true".
 * Returns a 403 response to send, or null to continue.
 *
 * TODO before deploying: replace this with your app's real auth check (signed-in
 * user, per-user/IP rate limit) and then remove ALLOW_UNAUTHENTICATED_SESSIONS.
 */
export function rejectUnlessSessionsAllowed(): Response | null {
  if (isProduction && process.env.ALLOW_UNAUTHENTICATED_SESSIONS !== "true") {
    console.error(
      "Session route refused: add auth/rate limiting (see README 'Before you deploy') or set ALLOW_UNAUTHENTICATED_SESSIONS=true.",
    );
    return noStoreJson(
      { error: "Sessions are disabled on this deployment until authentication is configured." },
      403,
    );
  }
  return null;
}
