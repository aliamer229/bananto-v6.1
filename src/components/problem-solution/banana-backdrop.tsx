/**
 * Decorative page backdrop: soft gradient, abstract shapes, floating bananas
 * and a few sparkles.
 *
 * Sits behind everything at -z-10, is fully aria-hidden, and never intercepts
 * pointer events. Motion here is slow and low-amplitude, and stops entirely
 * under prefers-reduced-motion (handled globally in globals.css).
 */
export function BananaBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Warm gradient wash */}
      <div className="absolute inset-0 bg-[radial-gradient(80%_55%_at_78%_-5%,var(--color-primary-foreground),transparent_62%),radial-gradient(65%_45%_at_8%_4%,var(--color-primary-foreground),transparent_58%),radial-gradient(70%_40%_at_50%_100%,var(--color-primary-foreground),transparent_60%)]" />

      {/* Soft blobs */}
      <div className="absolute -top-24 right-[-10%] h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute top-[38%] left-[-12%] h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
      <div className="absolute bottom-[6%] right-[4%] h-64 w-64 rounded-full bg-green-100 dark:bg-green-900/60 blur-3xl" />

      {/* Floating bananas — three sizes, three rhythms */}
      <FloatingBanana className="top-[14%] left-[6%] h-14 w-14 animate-float-slow opacity-40" />
      <FloatingBanana className="top-[46%] right-[5%] h-20 w-20 animate-float-mid opacity-30 [animation-delay:1.5s]" />
      <FloatingBanana className="top-[72%] left-[10%] h-12 w-12 animate-float-slow opacity-35 [animation-delay:3s]" />
      <FloatingBanana className="top-[88%] right-[16%] h-16 w-16 animate-float-mid opacity-25 [animation-delay:2.2s]" />

      {/* Cartoon clouds */}
      <svg
        viewBox="0 0 200 80"
        className="absolute top-[8%] right-[22%] h-16 w-40 animate-drift text-background opacity-70"
        focusable="false"
      >
        <path
          d="M30 60h140a26 26 0 0 0 0-34 30 30 0 0 0-52-14 24 24 0 0 0-40 16 22 22 0 0 0-48 32z"
          fill="currentColor"
        />
      </svg>
      <svg
        viewBox="0 0 200 80"
        className="absolute top-[58%] left-[24%] h-12 w-32 animate-drift text-background opacity-60 [animation-delay:4s]"
        focusable="false"
      >
        <path
          d="M30 60h140a26 26 0 0 0 0-34 30 30 0 0 0-52-14 24 24 0 0 0-40 16 22 22 0 0 0-48 32z"
          fill="currentColor"
        />
      </svg>

      {/* Sparkles */}
      <Sparkle className="top-[22%] right-[34%] h-4 w-4 text-primary" />
      <Sparkle className="top-[52%] left-[38%] h-3 w-3 text-primary [animation-delay:1.2s]" />
      <Sparkle className="top-[78%] right-[42%] h-5 w-5 text-primary [animation-delay:2.4s]" />
      <Sparkle className="top-[34%] left-[18%] h-3 w-3 text-primary [animation-delay:3.1s]" />

      {/* Game-inspired decoration: a faint d-pad and two face buttons */}
      <svg
        viewBox="0 0 120 120"
        className="absolute top-[64%] right-[10%] h-16 w-16 text-muted-foreground/60 opacity-15"
        focusable="false"
      >
        <path
          d="M46 12h28v34h34v28H74v34H46V74H12V46h34z"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinejoin="round"
        />
      </svg>
      <svg
        viewBox="0 0 120 60"
        className="absolute top-[30%] left-[46%] h-10 w-20 text-muted-foreground/60 opacity-15"
        focusable="false"
      >
        <circle cx="30" cy="30" r="20" fill="none" stroke="currentColor" strokeWidth="7" />
        <circle cx="90" cy="30" r="20" fill="none" stroke="currentColor" strokeWidth="7" />
      </svg>
    </div>
  );
}

function FloatingBanana({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={`absolute ${className}`} focusable="false">
      <path
        d="M11 6c-1.6 0-2.8 1.3-2.7 2.9.5 8.3 3 14.6 7.4 19 4.6 4.6 11 6.8 19.2 6.8 2.2 0 3.5-2.4 2.3-4.2-1-1.5-2.6-2.2-4.3-2.3-5.6-.3-9.7-1.9-12.6-4.8-2.9-2.9-4.6-7.2-5.2-13.1C14.9 8.4 13.2 6 11 6Z"
        fill="var(--color-primary)"
        stroke="var(--color-muted-foreground)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`absolute animate-twinkle ${className}`} focusable="false">
      <path
        d="M12 0c1.2 7 3.8 10 12 12-8.2 2-10.8 5-12 12-1.2-7-3.8-10-12-12 8.2-2 10.8-5 12-12z"
        fill="currentColor"
      />
    </svg>
  );
}
