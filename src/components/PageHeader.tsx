import { useNavigate, useRouter } from "@tanstack/react-router";
import Header from "./Header";

const viewToPath: Record<string, string> = {
  home: "/",
  store: "/",
  market: "/banana_market",
  chats: "/chat",
  cart: "/cart",
  profile: "/profile",
  wallet: "/wallet",
  admin: "/admin",
};

/**
 * Floating back + profile menu for pages that are not wrapped in AppShell.
 * The header itself is pointer-events-none, so it never blocks page content.
 */
export default function PageHeader({ view = "page" }: { view?: string }) {
  const navigate = useNavigate();
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
      return;
    }
    void navigate({ to: "/" });
  };

  const handleNavigate = (target: string) => {
    if (target.startsWith("product/")) {
      const id = target.split("/")[1] ?? "";
      void navigate({ to: "/product/$productId", params: { productId: id } });
      return;
    }
    void navigate({ to: viewToPath[target] ?? "/" });
  };

  return <Header currentView={view} onBack={handleBack} onNavigate={handleNavigate} />;
}
