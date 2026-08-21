/**
 * Which uploaded files a member may reference in their own messages.
 *
 * `/api/upload` namespaces every file as `<folder>/<uploader id>/<name>`, and
 * the chat used to accept only the `chat/` folder. But the order chat uploads
 * payment receipts and account-registration proofs to `receipts/`, so attaching
 * one always failed with `invalid_image` — the exact step where a buyer proves
 * they registered the delivered account.
 *
 * Ownership is what actually matters here, not which folder the uploader picked,
 * so the check keeps the "must be your own file" rule and widens the folder set
 * to the ones members upload into.
 */
const MEMBER_UPLOAD_URL =
  /^\/api\/files\/(chat|uploads|orders|receipts|support|documents)\/(usr_[a-z0-9]+)\/[a-z0-9_-]{1,96}\.(?:png|jpe?g|webp|gif)$/i;

export function isOwnUploadUrl(url: string, userId: string): boolean {
  const match = MEMBER_UPLOAD_URL.exec(url);
  return Boolean(match && match[2] === userId);
}
