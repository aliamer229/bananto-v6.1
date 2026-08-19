import { Reveal } from "@/components/motion/reveal";

/** Closing call to action for anyone whose problem was not covered. */
export function HelpCta() {
  return (
    <Reveal className="py-10">
      <div className="relative overflow-hidden rounded-card border border-primary/50 bg-[linear-gradient(135deg,var(--color-primary-foreground),var(--color-card)_55%,var(--color-primary-foreground))] px-6 py-10 text-center shadow-card sm:px-10 sm:py-14">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-45">
          <span className="absolute top-6 right-8 animate-float-slow text-3xl">🍌</span>
          <span className="absolute bottom-8 left-10 animate-float-mid text-2xl">🍌</span>
          <span className="absolute top-1/2 left-[22%] animate-twinkle text-xl">✨</span>
        </div>

        <div className="relative">
          <h2 className="text-2xl font-extrabold text-balance text-foreground sm:text-3xl">
            ما لگيت حل مشكلتك؟
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            اكتب لنا وصف المشكلة ورقم الطلب إن وُجد، وفريق الدعم راح يرجع لك بأسرع وقت.
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a href="mailto:support@banana.example" className="bn-btn bn-btn-primary">
              <span aria-hidden>💬</span>
              تواصل مع الدعم
            </a>
            <a href="#featured-title" className="bn-btn bn-btn-ghost">
              <span aria-hidden>🔝</span>
              ارجع للمشاكل الشائعة
            </a>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
