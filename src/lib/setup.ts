// Names of required server settings that are missing. Never their values.
const REQUIRED = ["DATABASE_URL", "LISTENER_MASTER_KEY", "LISTENER_ACCESS_CODE", "DEEPGRAM_API_KEY", "CRON_SECRET"] as const;

export function missingSettings(env: Record<string, string | undefined> = process.env): string[] {
  return REQUIRED.filter((name) => !env[name]);
}
