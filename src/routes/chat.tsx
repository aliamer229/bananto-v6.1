import { createFileRoute, useNavigate } from "@tanstack/react-router";

import ChatView from "@/components/ChatView";

export const Route = createFileRoute("/chat")({
  // Returning the key unconditionally made it a *required* search param, so
  // every plain `navigate({ to: "/chat" })` in the app stopped type-checking.
  validateSearch: (search: Record<string, unknown>): { initialOrderId?: string } =>
    typeof search["initialOrderId"] === "string" && search["initialOrderId"]
      ? { initialOrderId: search["initialOrderId"] }
      : {},
  head: () => ({
    meta: [
      { title: "المحادثة والدعم — بنانا ستور" },
      {
        name: "description",
        content: "تحدث مع فريق بنانا ستور، أرسل منتجات وطلبات وعناوين، واستلم بيانات حسابك بأمان.",
      },
      { property: "og:title", content: "المحادثة والدعم — بنانا ستور" },
      { property: "og:description", content: "دعم مباشر لكل طلباتك في محادثة واحدة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  return (
    <div className="h-screen-dynamic w-full overflow-hidden">
      <ChatView onBack={() => void navigate({ to: "/" })} initialOrderId={search.initialOrderId} />
    </div>
  );
}
