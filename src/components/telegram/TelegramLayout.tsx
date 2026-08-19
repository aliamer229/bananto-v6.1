import { useState } from "react";
import { ReactNode } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import mascot from "@/assets/bananto_logo.webp.asset.json";

export function TelegramLayout({
  children,
  title,
  showBack = true,
}: {
  children: ReactNode;
  title: string;
  showBack?: boolean;
}) {
  const navigate = useNavigate();
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <div
      className="min-h-screen bg-[var(--page)] text-[var(--ink-base)] flex flex-col items-center overflow-x-hidden font-sans rtl"
      dir="rtl"
    >
      {/* Header Bar */}
      <header className="w-full px-4 py-4 flex items-center justify-between bg-[var(--page)] border-b border-line-2 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {showBack && (
            <button
              onClick={() => navigate({ to: "/telegram" })}
              className="p-2 -ml-2 rounded-full hover:bg-surface-2 active:bg-surface-3 transition-colors text-[var(--ink-base)]"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
          <h1 className="text-lg font-black tracking-tight">{title}</h1>
        </div>

        <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center border-2 border-[var(--brand-red)]">
          {logoFailed ? (
            <span aria-label="بنانتو" role="img" className="text-xl">
              🍌
            </span>
          ) : (
            <img
              src={mascot.url}
              alt="شعار بنانتو"
              className="w-6 h-6 object-contain"
              onError={() => setLogoFailed(true)}
            />
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-md p-4 flex-1 flex flex-col">
        {children}

        {/* Branding Footer */}
        <div className="mt-auto py-8 opacity-40">
          <p className="text-[10px] text-[var(--ink-mute)] font-black text-center uppercase tracking-[0.3em]">
            Bananto Platform
          </p>
        </div>
      </main>
    </div>
  );
}
