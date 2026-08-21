import { createFileRoute } from "@tanstack/react-router";

import { body, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { purgeMemberActivity, type PurgeScope } from "@/lib/purge.server";

/**
 * Irreversible removal of member activity, for an administrator only.
 *
 * Deleting every order, conversation and wallet balance is not something to
 * trip over, so it takes an exact confirmation phrase and reports what it will
 * remove before it removes anything: POST without `apply` counts, POST with
 * `apply: true` performs it. Accounts and banana balances are never touched.
 */
const CONFIRMATION = "DELETE_ALL_MEMBER_ACTIVITY";
const ALL_SCOPES: PurgeScope[] = ["orders", "chats", "wallet"];

export const Route = createFileRoute("/api/admin/purge")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        guard(async () => {
          const admin = await requireAdmin(request);
          const input = await body<{
            confirmation?: string;
            apply?: boolean;
            scopes?: PurgeScope[];
          }>(request);

          const scopes =
            Array.isArray(input.scopes) && input.scopes.length > 0
              ? input.scopes.filter((scope): scope is PurgeScope => ALL_SCOPES.includes(scope))
              : ALL_SCOPES;

          const apply = input.apply === true;
          if (apply && input.confirmation !== CONFIRMATION) {
            return json(
              { error: "confirmation_required", expected: CONFIRMATION },
              { status: 400 },
            );
          }

          const report = await purgeMemberActivity(scopes, apply);
          if (apply) {
            console.warn(
              `[purge] ${admin.id} deleted member activity`,
              JSON.stringify({ scopes, counts: report.counts, wallets: report.walletsReset }),
            );
          }
          return json({ ...report, scopes, kept: ["users", "banana_balance", "catalogue"] });
        }),
    },
  },
});
