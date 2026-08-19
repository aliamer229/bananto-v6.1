import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, Check, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/hub/utils/cn";

export type NotificationType = "info" | "success" | "warning" | "price";

export interface NotificationInput {
  title: string;
  message?: string;
  type?: NotificationType;
  /** Milliseconds before auto-dismiss. `0` keeps it until dismissed. */
  duration?: number;
}

interface NotificationItem extends Required<Omit<NotificationInput, "message">> {
  id: string;
  message?: string;
}

interface NotificationValue {
  notifications: NotificationItem[];
  addNotification: (input: NotificationInput) => string;
  dismiss: (id: string) => void;
}

const NotificationContext = createContext<NotificationValue | null>(null);

const ICONS: Record<NotificationType, typeof Info> = {
  info: Info,
  success: Check,
  warning: TriangleAlert,
  price: Bell,
};

const TONE: Record<NotificationType, string> = {
  info: "text-sky-300",
  success: "text-good",
  warning: "text-warn",
  price: "text-warn",
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setNotifications((current) => current.filter((n) => n.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const addNotification = useCallback(
    (input: NotificationInput) => {
      const id = `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const item: NotificationItem = {
        id,
        title: input.title,
        ...(input.message !== undefined ? { message: input.message } : {}),
        type: input.type ?? "info",
        duration: input.duration ?? 4200,
      };
      // Cap the stack so a burst of price updates cannot bury the page.
      setNotifications((current) => [item, ...current].slice(0, 4));
      if (item.duration > 0) {
        timers.current.set(
          id,
          window.setTimeout(() => dismiss(id), item.duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ notifications, addNotification, dismiss }),
    [notifications, addNotification, dismiss],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationViewport items={notifications} onDismiss={dismiss} />
    </NotificationContext.Provider>
  );
}

function NotificationViewport({
  items,
  onDismiss,
}: {
  items: NotificationItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:end-4 sm:top-4 sm:items-end sm:px-0"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const Icon = ICONS[item.type];
          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/10 bg-ink-850/95 p-3 backdrop-blur-xl shadow-lift"
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]",
                    TONE[item.type],
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-snug">{item.title}</p>
                  {item.message && (
                    <p className="mt-0.5 text-xs leading-relaxed muted">{item.message}</p>
                  )}
                </div>
                <button
                  onClick={() => onDismiss(item.id)}
                  className="-me-1 rounded-lg p-1 muted transition-colors hover:text-white"
                  aria-label="Close notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function useNotifications(): NotificationValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within <NotificationProvider>");
  return ctx;
}
