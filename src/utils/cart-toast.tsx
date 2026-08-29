import { toast } from "sonner";
import { ShoppingCart } from "lucide-react";
import { playSound } from "./audio";

export interface CartToastOptions {
  title?: string;
  message?: string;
  product?: Record<string, unknown>;
  quantity?: number;
  navigate?: (opts: { to: string }) => void;
  playSoundEffect?: boolean;
}

export function showAddToCartToast(options: CartToastOptions): void {
  const {
    title = "أُضيف إلى السلة",
    message,
    navigate,
    playSoundEffect = true,
  } = options;

  if (playSoundEffect) {
    playSound("confirm", 0.6);
  }

  toast.custom((id) => (
    <div
      onClick={() => {
        toast.dismiss(id);
        if (navigate) {
          navigate({ to: "/cart" });
        }
      }}
      className="flex items-center gap-3 p-3 bg-neutral-900/95 text-white rounded-xl shadow-xl border border-neutral-700/60 cursor-pointer hover:bg-neutral-800 transition-all select-none min-w-[280px]"
    >
      <div className="w-10 h-10 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
        <ShoppingCart className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-neutral-300">{title}</p>
        {message && <p className="text-sm font-semibold truncate text-white">{message}</p>}
      </div>
      <div className="text-xs text-blue-400 font-medium px-2 py-1 bg-blue-500/10 rounded-md shrink-0">
        عرض السلة
      </div>
    </div>
  ), {
    duration: 3500,
  });
}
