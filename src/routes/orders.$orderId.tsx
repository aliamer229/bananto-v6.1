import { createFileRoute, useNavigate } from "@tanstack/react-router";

import AppShell from "@/components/AppShell";
import OrderChat from "@/components/OrderChat";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/orders/$orderId")({
  head: () => ({
    meta: [
      { title: "محادثة الطلب — بنانا ستور" },
      {
        name: "description",
        content: "تحدث مع الدعم، ارفع إيصال الدفع، واستلم بيانات الحساب بأمان.",
      },
      { property: "og:title", content: "محادثة الطلب — بنانا ستور" },
      { property: "og:description", content: "كل خطوات الطلب في محادثة واحدة." },
    ],
  }),
  component: OrderChatPage,
});

function OrderChatPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <AppShell currentView="orders" onBack={() => void navigate({ to: "/orders" })}>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <OrderChat orderId={orderId} isAdmin={Boolean(user?.isAdmin)} />
      </div>
    </AppShell>
  );
}
