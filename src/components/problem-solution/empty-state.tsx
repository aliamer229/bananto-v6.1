"use client";

import { Reveal } from "@/components/motion/reveal";

/** Shown when a search matches nothing. */
export function NoResultsState({ query, onReset }: { query: string; onReset: () => void }) {
  return (
    <Reveal className="mx-auto max-w-xl py-8 text-center">
      <SadBanana />
      <h2 className="mt-4 text-xl font-extrabold text-foreground sm:text-2xl">
        لم نجد حلًا مطابقًا تمامًا 😕
      </h2>
      <p className="mt-2 text-muted-foreground">
        ما لگينا نتيجة لـ «<span className="font-semibold text-muted-foreground">{query}</span>».
        جرّب البحث بكلمات أخرى، أو اختر من المشاكل الأكثر شيوعًا في الأسفل.
      </p>
      <button type="button" onClick={onReset} className="bn-btn bn-btn-ghost mt-5">
        <span aria-hidden>↺</span>
        مسح البحث
      </button>
    </Reveal>
  );
}

/** Shown when the catalogue itself has no published problems. */
export function NoProblemsState() {
  return (
    <Reveal className="mx-auto max-w-xl py-16 text-center">
      <span aria-hidden className="block animate-float-mid text-6xl">
        🍌
      </span>
      <h2 className="mt-5 text-2xl font-extrabold text-foreground">ماكو مشاكل مضافة حاليًا</h2>
      <p className="mt-2 text-muted-foreground">راح نضيف الحلول هنا قريبًا.</p>
    </Reveal>
  );
}

/** A banana that is having a bad day. */
function SadBanana() {
  return (
    <svg viewBox="0 0 120 120" className="mx-auto h-28 w-28" role="img" aria-label="رسم موزة حزينة">
      <circle cx="60" cy="60" r="52" fill="var(--color-primary-foreground)" />
      <g transform="translate(24 26) rotate(-8) scale(1.5)">
        <path
          d="M11 6c-1.6 0-2.8 1.3-2.7 2.9.5 8.3 3 14.6 7.4 19 4.6 4.6 11 6.8 19.2 6.8 2.2 0 3.5-2.4 2.3-4.2-1-1.5-2.6-2.2-4.3-2.3-5.6-.3-9.7-1.9-12.6-4.8-2.9-2.9-4.6-7.2-5.2-13.1C14.9 8.4 13.2 6 11 6Z"
          fill="var(--color-primary)"
          stroke="var(--color-foreground)"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      </g>
      <circle cx="52" cy="62" r="3.4" fill="var(--color-foreground)" />
      <circle cx="70" cy="66" r="3.4" fill="var(--color-foreground)" />
      <path
        d="M50 82c6-6 16-5 21 1"
        fill="none"
        stroke="var(--color-foreground)"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
