import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { OrdersManagerView } from "@/components/admin/OrdersManagerView";
import { ArrowRight, MessageSquare, LayoutDashboard } from "lucide-react";

export const Route = createFileRoute("/admin/orders")({
  head: () => ({
    meta: [
      { title: "إدارة الطلبات والمبيعات — إدارة بنانا ستور" },
      {
        name: "description",
        content: "إدارة طلبات المتجر، تأكيد المدفوعات، ومتابعة تسليم الحسابات والمنتجات الرقمية.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "إدارة الطلبات والمبيعات" },
      { property: "og:description", content: "لوحة متكاملة لإدارة ومتابعة طلبات العملاء." },
    ],
  }),
  component: AdminOrdersPage,
});

function AdminOrdersPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return <div className="p-10 text-center text-sm text-muted-foreground">جاري التحميل...</div>;
  }

  if (!user?.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--page)]" dir="rtl">
        <p className="text-foreground">هذه الصفحة للمدير فقط.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--page)]" dir="rtl">
      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-30 border-b border-border bg-card px-4 py-3 shadow-2xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/admin"
              className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-muted"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              <span>لوحة الإدارة</span>
            </Link>
            <div className="h-4 w-px bg-border" />
            <span className="text-sm font-black text-foreground">إدارة الطلبات</span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/admin"
              search={{ tab: "messages" } as any}
              className="flex items-center gap-1.5 rounded-xl bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary/20"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>صندوق الدعم والمحادثات</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <OrdersManagerView
          onNavigateToChat={(threadId) => {
            void navigate({ to: "/admin", search: { tab: "messages", thread: threadId } as any });
          }}
        />
      </div>
    </div>
  );
}
