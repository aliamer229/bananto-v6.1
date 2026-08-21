import { createFileRoute, Navigate } from "@tanstack/react-router";

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
  
  // Redirect to the main chat interface, which will automatically 
  // select the thread associated with this order.
  return <Navigate to="/chat" search={{ initialOrderId: orderId }} />;
}

