/**
 * Server-side thread ownership rules.
 *
 * Store surface: a thread is visible only to its owner — an admin browsing the
 * store UI sees their personal conversations only.
 * Admin surface: only real admins, and only inside the admin dashboard inbox.
 */
export type ChatSurface = "store" | "admin";

export function canAccessThread(params: {
  viewerId: string | null | undefined;
  isAdmin: boolean;
  threadUserId: string | null | undefined;
  surface: ChatSurface;
}): boolean {
  const { viewerId, isAdmin, threadUserId, surface } = params;
  if (!viewerId) return false;
  // Admin role grants global access to view and reply to any support or order thread
  if (isAdmin === true) return true;
  if (surface === "admin") return false;
  return Boolean(threadUserId) && threadUserId === viewerId;
}

export function canAccessAdminInbox(isAdmin: boolean): boolean {
  return isAdmin === true;
}
