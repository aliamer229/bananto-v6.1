/**
 * Platform marks printed on the case.
 *
 * ## Read this before changing anything here
 *
 * On a retail case the Nintendo lockup is **printed on the sleeve** — it is part
 * of the artwork file the publisher supplies (back │ spine │ front as one wrap).
 * When `GameCase3D` is given a real sleeve texture it uses that and never draws
 * a mark at all, which is always the correct path.
 *
 * These components exist only for the degraded case: store APIs return
 * front-only key art with no band, no logo and no spine, so there is nothing in
 * the texture to show. They render the Joy-Con symbol and nothing else — that
 * shape is geometrically accurate, whereas any wordmark we drew would not be.
 * A partial mark beats a wrong one.
 *
 * To ship this properly, supply licensed artwork and set the asset slots:
 *
 *   <GameCase3D sleeveUrl="…/dredge-wrap.png" … />        // best: real wrap
 *   MARK_ASSETS.switch = '/brand/nintendo-switch.svg';    // or official lockup
 *   MARK_ASSETS.switch2 = '/brand/nintendo-switch-2.svg';
 *
 * With a slot filled, the `<img>` path is taken and nothing below is drawn.
 * Everything is SVG geometry rather than HTML text, so it scales with the case
 * and never picks up a system font.
 */

export const MARK_ASSETS: { switch?: string; switch2?: string } = {
  // Intentionally empty. Point these at licensed files to replace the
  // placeholders below.
};

/** Joy-Con symbol. A simple geometric mark, faithful at any size. */
export function JoyConGlyph({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={style}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M43.7 18.5H35c-9.1 0-16.5 7.4-16.5 16.5v30c0 9.1 7.4 16.5 16.5 16.5h8.7V18.5zm-11.1 40c-3.1 0-5.6-2.5-5.6-5.6s2.5-5.6 5.6-5.6 5.6 2.5 5.6 5.6-2.5 5.6-5.6 5.6zM54 18.5v63c10.4 0 18.8-8.4 18.8-18.8v-25.5C72.8 26.8 64.4 18.5 54 18.5zm9 21.4c3.1 0 5.6 2.5 5.6 5.6s-2.5 5.6-5.6 5.6-5.6-2.5-5.6-5.6 2.5-5.6 5.6-5.6z" />
    </svg>
  );
}

/*
  There is deliberately no wordmark fallback.

  An earlier attempt drew the lettering as measured stroke rectangles. It read
  as redacted text — visually broken, and no more honest than setting it in a
  system font. The Joy-Con symbol below is genuinely accurate because it is a
  simple geometric shape, so the placeholder shows that alone. A partial mark is
  better than a wrong one; the full lockup arrives with a real asset or a real
  sleeve.
*/

/** Switch 1 corner block. */
export function SwitchMark({ scale, className }: { scale: number; className?: string }) {
  if (MARK_ASSETS.switch) {
    return (
      <img
        src={MARK_ASSETS.switch}
        alt=""
        aria-hidden
        className={className}
        style={{ width: 46 * scale, height: "auto" }}
      />
    );
  }
  return (
    <JoyConGlyph
      {...(className ? { className } : {})}
      style={{ width: 17 * scale, height: 17 * scale }}
    />
  );
}

/** Switch 2 header lockup: symbol plus the generation numeral. */
export function Switch2Mark({ scale, className }: { scale: number; className?: string }) {
  if (MARK_ASSETS.switch2) {
    return (
      <img
        src={MARK_ASSETS.switch2}
        alt=""
        aria-hidden
        className={className}
        style={{ width: 78 * scale, height: "auto" }}
      />
    );
  }
  return (
    <span className={className} style={{ display: "flex", alignItems: "center", gap: 2.6 * scale }}>
      <JoyConGlyph style={{ width: 16 * scale, height: 16 * scale }} />
      {/* The numeral is part of the retail mark; kept as vector geometry. */}
      <svg
        viewBox="0 0 22 30"
        style={{ width: 15 * scale, height: 20 * scale }}
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M1.5 30v-4.6l9-9.2c1.9-2 3.1-3.4 3.7-4.3.6-.9.9-1.9.9-3 0-1.3-.4-2.3-1.1-3-.7-.7-1.7-1.1-3-1.1-1.3 0-2.4.4-3.2 1.3-.8.9-1.2 2.1-1.3 3.7H1.2c.1-3.2 1.1-5.6 2.9-7.4C5.9.6 8.3-.3 11.3-.3c2.9 0 5.2.8 6.9 2.4 1.7 1.6 2.5 3.7 2.5 6.3 0 1.8-.5 3.5-1.4 5.1-.9 1.6-2.6 3.6-5 6l-5.2 5.3h11.8V30H1.5z" />
      </svg>
    </span>
  );
}
