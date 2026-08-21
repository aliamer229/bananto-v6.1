import { createServerFn } from "@tanstack/react-start";

import { getSessionUser } from "./session.server";
import { findUserById } from "./db.server";

/**
 * Whether the current session belongs to an admin, decided on the server.
 *
 * The admin routes used to gate on the client-side `user.isAdmin` flag alone.
 * The APIs behind them are guarded independently, so that was never a data
 * leak — but it did mean the entire admin dashboard bundle, with its internal
 * field names, workflows and staff-only copy, was served to anyone who typed
 * /admin. Routes call this from `beforeLoad`, which runs during SSR and before
 * a client navigation resolves, so a non-admin is redirected before any of it
 * is sent.
 *
 * Deliberately returns a boolean rather than throwing: `beforeLoad` wants to
 * redirect, not surface an error page.
 */
export const checkAdminAccess = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getSessionUser();
  if (!session) return { isAdmin: false, signedIn: false };

  // Re-read from the database so revoking is_admin takes effect immediately,
  // even while an old session cookie is still valid.
  const current = await findUserById(session.id);
  return { isAdmin: Boolean(current?.isAdmin), signedIn: true };
});
