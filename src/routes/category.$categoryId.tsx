import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import { ProductCard } from "@/components/ProductCard";

export const Route = createFileRoute("/category/$categoryId")({
  component: CategoryPage,
});

function CategoryPage() {
  const { categoryId } = Route.useParams();
  const navigate = useNavigate();

  const { data: store, isLoading } = useQuery({
    queryKey: ["store"],
    queryFn: api.store,
  });

  const adminProducts = store?.products || [];

  const categoryInfo = getCategoryInfo(categoryId);
  const products = adminProducts.filter(
    (p: any) => p.category === categoryId || p.category === categoryInfo.title,
  );

  return (
    <AppShell currentView="store" onBack={() => navigate({ to: "/" })}>
      <div className="pb-12 bg-[var(--page)] min-h-screen">
        {/* Dynamic Category Header */}
        <div
          className={`relative pt-24 pb-12 px-4 flex flex-col items-center justify-center text-center ${categoryInfo.bgColor}`}
        >
          <div className="absolute inset-0 overflow-hidden">
            {categoryInfo.pattern && (
              <div className={`absolute inset-0 opacity-20 ${categoryInfo.pattern}`} />
            )}
          </div>
          <div className="relative z-10 text-white max-w-2xl mx-auto">
            {categoryInfo.icon && (
              <div className="mb-4 flex justify-center">{categoryInfo.icon}</div>
            )}
            <h1
              className="text-3xl font-black mb-2"
              style={{ textShadow: "0 2px 4px rgba(0,0,0,0.3)" }}
            >
              {categoryInfo.title}
            </h1>
            <p className="text-white/80 font-medium">{categoryInfo.description}</p>
          </div>
        </div>

        {/* Product Grid */}
        <div className="px-4 py-8 max-w-7xl mx-auto">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin w-8 h-8 border-4 border-[#EA8918] border-t-transparent rounded-full" />
            </div>
          ) : products.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {products.map((p: any) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              لا توجد منتجات في هذا القسم حالياً
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function getCategoryInfo(id: string) {
  switch (id) {
    case "hardware":
      return {
        title: "أجهزة الهاردوير وملحقاتها",
        description: "أحدث أجهزة نينتندو وملحقاتها الأصلية",
        bgColor: "bg-gradient-to-br from-[#E63946] to-[#9E2A2B]",
        pattern: "bg-[url('/pattern.png')] bg-repeat",
        icon: <span className="text-5xl">🎮</span>,
      };
    case "amiibo":
      return {
        title: "مجسمات amiibo",
        description: "شخصياتك المفضلة بلمسة سحرية",
        bgColor: "bg-gradient-to-br from-[#2A9D8F] to-[#217366]",
        pattern: "bg-[url('/pattern.png')] bg-repeat",
        icon: <span className="text-5xl">👾</span>,
      };
    case "accessories":
      return {
        title: "الإكسسوارات",
        description: "حقائب، حافظات، وكل ما يحتاجه جهازك",
        bgColor: "bg-gradient-to-br from-[#F4A261] to-[#E76F51]",
        pattern: "bg-[url('/pattern.png')] bg-repeat",
        icon: <span className="text-5xl">🎧</span>,
      };
    case "gift-cards":
      return {
        title: "كروت التعبئة",
        description: "بطاقات هدايا لمختلف المتاجر العالمية",
        bgColor: "bg-gradient-to-br from-[#4A88B4] to-[#1D3557]",
        pattern: "bg-[url('/pattern.png')] bg-repeat",
        icon: <span className="text-5xl">💳</span>,
      };
    case "used":
      return {
        title: "القطع والألعاب المستخدمة",
        description: "ألعاب وقطع بحالة ممتازة وبأسعار توفيرية",
        bgColor: "bg-gradient-to-br from-[#6A4C93] to-[#4B2275]",
        pattern: "bg-[url('/pattern.png')] bg-repeat",
        icon: <span className="text-5xl">♻️</span>,
      };
    default:
      return {
        title: "قسم المنتجات",
        description: "تصفح أحدث المنتجات",
        bgColor: "bg-gradient-to-br from-gray-700 to-gray-900",
        pattern: "",
        icon: null,
      };
  }
}
