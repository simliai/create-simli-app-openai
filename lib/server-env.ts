import "server-only";

/** Thrown when the server is missing configuration. The message is safe to show. */
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

/** JSON response that must never be cached (tokens are single-use and short-lived). */
export function noStoreJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
