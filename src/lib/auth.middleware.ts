import { createMiddleware } from "@tanstack/react-start";
import { getSessionUser } from "./session.server";
import { findUserById, logLogin } from "./db.server";

export const requireAppAuth = createMiddleware().server(async ({ next, request }) => {
  const user = await getSessionUser(request);
  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return next({
    context: {
      user,
      userId: user.id,
    },
  });
});

export const requireAdmin = createMiddleware().server(async ({ next, request }) => {
  const user = await getSessionUser(request);
  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Refetch user to ensure admin status is current from DB
  const dbUser = await findUserById(user.id);
  if (!dbUser?.isAdmin) {
    throw new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return next({
    context: {
      user: dbUser,
      userId: dbUser.id,
    },
  });
});
