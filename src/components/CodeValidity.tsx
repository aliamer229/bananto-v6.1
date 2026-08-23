/**
 * Live "how long is this code good for" line, shown under a verification code.
 *
 * Derives everything from the server-stamped `expiresAt` instant rather than
 * counting down from mount, so refreshing the page shows the real remaining
 * time instead of restarting the clock — and a code that died while the tab was
 * closed comes back already marked expired.
 */
import { useEffect, useState } from "react";

import { describeCodeValidity } from "@/lib/delivery-otp";

export function CodeValidity({
  expiresAt,
  className = "",
}: {
  expiresAt?: string | null | undefined;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    // A minute is the display resolution, but tick faster near the end so the
    // switch to "expired" is not up to 30s late.
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const validity = describeCodeValidity(expiresAt, now);

  return (
    <div
      className={`text-[10px] text-center ${
        validity.valid ? "opacity-80" : "font-bold text-red-400 opacity-100"
      } ${className}`}
      title={expiresAt ? new Date(expiresAt).toLocaleString("ar") : undefined}
    >
      {validity.label}
    </div>
  );
}

export default CodeValidity;
