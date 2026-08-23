import { createFileRoute } from "@tanstack/react-router";
import { d1All, getD1 } from "@/lib/d1.server";
import { json, guard } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";

export const Route = createFileRoute("/api/public/order-queue")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          // Verify admin session
          await requireAdmin(request);

          const db = getD1();
          if (!db) return json([], { status: 200 });

          // Fetch queue with joined order info
          const items = await d1All(
            `SELECT q.*, o.code as orderCode, u.name as userName 
             FROM order_queue q
             JOIN orders o ON q.order_id = o.id
             JOIN users u ON o.user_id = u.id
             WHERE q.status != 'completed'
               AND json_extract(o.doc, '$.status') NOT IN (
                 'awaiting_customer_confirmation', 'delivery_issue', 'completed', 'cancelled'
               )
             ORDER BY q.created_at ASC`,
          );

          return json(items);
        }),
    },
  },
});
