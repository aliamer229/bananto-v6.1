export interface TelegramLaunchInput {
  initData?: string;
  initDataUnsafe?: { start_param?: unknown; startParam?: unknown };
  search?: string;
  hash?: string;
}

const REFERENCE = /^[A-Za-z0-9_-]{8,128}$/;

function validReference(value: unknown): string | null {
  return typeof value === "string" && REFERENCE.test(value) ? value : null;
}

/**
 * Resolve an ownership reference across Telegram client versions.
 *
 * Signed launch data is preferred. The explicit `session` parameter is used
 * by the bot's Web App button because some Android clients omit start_param
 * when a configured Main Mini App is opened.
 */
export function resolveTelegramVerificationReference(input: TelegramLaunchInput): string | null {
  const query = new URLSearchParams(input.search ?? "");
  const hash = new URLSearchParams((input.hash ?? "").replace(/^#/, ""));
  const signed = new URLSearchParams(input.initData ?? "");

  const launchData = query.get("tgWebAppData") || hash.get("tgWebAppData");
  const launchParams = launchData ? new URLSearchParams(launchData) : null;

  const candidates: unknown[] = [
    signed.get("start_param"),
    launchParams?.get("start_param"),
    input.initDataUnsafe?.start_param,
    input.initDataUnsafe?.startParam,
    query.get("tgWebAppStartParam"),
    hash.get("tgWebAppStartParam"),
    query.get("session"),
    hash.get("session"),
    query.get("verificationRef"),
    hash.get("verificationRef"),
    query.get("token"),
    hash.get("token"),
    query.get("startapp"),
    hash.get("startapp"),
  ];

  for (const candidate of candidates) {
    const reference = validReference(candidate);
    if (reference) return reference;
  }
  return null;
}
