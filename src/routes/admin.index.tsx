import { checkAdminAccess } from "@/lib/admin-access.functions";
import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, lazy, Suspense } from "react";

const AdminDashboard = lazy(() => import("@/components/AdminDashboard"));
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/admin/")({
  /**
   * Server-side gate. Runs during SSR and before a client navigation resolves,
   * so a non-admin never receives the dashboard bundle at all — the client-side
   * `user.isAdmin` check below is now only a second line of defence.
   */
  beforeLoad: async () => {
    const { isAdmin, signedIn } = await checkAdminAccess();
    if (!isAdmin) {
      throw redirect({ to: signedIn ? "/" : "/auth" });
    }
  },
  head: () => ({
    meta: [
      { title: "لوحة الإدارة — بنانا ستور" },
      {
        name: "description",
        content:
          "إدارة المنتجات، البانرات، الطلبات، والمحادثات مع استخراج بيانات المنتج بالذكاء الاصطناعي.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "لوحة الإدارة — بنانا ستور" },
      { property: "og:description", content: "إدارة كامل المتجر من مكان واحد." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) void navigate({ to: "/auth" });
  }, [isLoading, user, navigate]);

  if (isLoading)
    return <div className="p-10 text-center text-sm text-muted-foreground">جاري التحميل...</div>;

  if (!user?.isAdmin) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--page)] px-4 text-center"
        dir="rtl"
      >
        <p className="text-foreground">هذه الصفحة للمدير فقط.</p>
        <Link
          to="/"
          className="rounded-xl bg-[var(--brand-red)] px-4 py-2 text-sm font-bold text-white"
        >
          الرجوع للمتجر
        </Link>
      </div>
    );
  }

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <p className="text-sm font-bold text-foreground">لوحة الإدارة — بنانتو</p>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/orders"
            className="rounded-lg bg-muted/60 hover:bg-muted border border-border px-3 py-1.5 text-xs font-bold text-foreground transition-colors"
          >
            إدارة الطلبات
          </Link>
          <Link
            to="/"
            className="rounded-lg bg-foreground text-background px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-90"
          >
            عرض المتجر
          </Link>
        </div>
      </div>
      <Suspense fallback={<div className="p-10 text-center text-sm text-muted-foreground animate-pulse">جاري تحميل لوحة الإدارة...</div>}>
        <AdminDashboard />
      </Suspense>
    </div>
  );
}
