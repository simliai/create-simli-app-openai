/** Adds an actionable hint to common Simli failures (see https://docs.simli.com). */
export function explainSimliError(raw: string): string {
  const m = raw.toUpperCase();
  if (m.includes("401") || m.includes("UNAUTHORIZED") || m.includes("INVALID API KEY"))
    return `${raw}: check SIMLI_API_KEY on the server.`;
  if (m.includes("INVALID_FACE_ID"))
    return `${raw}: the face ID doesn't exist. Use a preset or copy it from the Simli dashboard.`;
  if (m.includes("FACE_NOT_ALLOWED")) return `${raw}: that face belongs to another Simli account.`;
  if (m.includes("422")) return `${raw}: invalid video framing (must be 1:1, 16:9 or 9:16, each side >= 512).`;
  if (m.includes("429") || m.includes("RATE"))
    return `${raw}: too many Simli sessions running. Stop other sessions or upgrade the plan.`;
  if (m.includes("TOO MANY RETRY"))
    return `${raw}: the browser can't reach Simli's media servers (firewall or VPN?).`;
  return raw;
}
