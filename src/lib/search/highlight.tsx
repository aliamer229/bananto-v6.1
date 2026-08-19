import { Fragment, type ReactNode } from "react";
import { normalize, stem } from "./normalize";

/**
 * Wraps the words of `text` that matched the query in a <mark>.
 *
 * Splits on whitespace only, so the original spacing and punctuation survive
 * untouched — important for Arabic, where re-joining text can change how it
 * renders.
 */
export function highlight(text: string, tokens: string[]): ReactNode {
  if (tokens.length === 0) return text;

  const needles = tokens.filter((token) => token.length >= 2);
  if (needles.length === 0) return text;

  const parts = text.split(/(\s+)/);

  return parts.map((part, index) => {
    if (!part.trim()) return <Fragment key={index}>{part}</Fragment>;

    const normalized = normalize(part);
    const normalizedStem = stem(normalized);

    const isMatch = needles.some(
      (needle) =>
        normalized === needle ||
        normalizedStem === stem(needle) ||
        (needle.length >= 3 && normalized.includes(needle)),
    );

    return isMatch ? (
      <mark key={index} className="bn-mark">
        {part}
      </mark>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    );
  });
}
