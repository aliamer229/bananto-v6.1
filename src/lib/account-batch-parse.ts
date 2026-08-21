/**
 * Parser for the bulk-account textarea in the admin order panel.
 *
 * Staff prepare accounts in whatever tool they already use — a spreadsheet, a
 * notes app, the platform's own signup page — and paste the result in one go.
 * Every separator those tools produce is accepted so nobody has to reformat a
 * list by hand: colon, comma, pipe, tab or plain spaces.
 *
 * Kept free of React and of any server import so it can be unit tested and
 * bundled into the client without pulling the database in.
 */

export interface ParsedAccount {
  email: string;
  password?: string;
}

export interface ParsedAccountLine {
  line: number;
  raw: string;
  account?: ParsedAccount;
  error?: "missing_email" | "invalid_email";
}

export interface ParsedAccountBatch {
  accounts: ParsedAccount[];
  errors: ParsedAccountLine[];
  /** Emails that appear more than once in the paste, first occurrence kept. */
  duplicates: string[];
}

/** The server refuses anything larger, so the UI stops there too. */
export const MAX_BATCH_ACCOUNTS = 50;

const SEPARATORS = [":", ",", "|", "\t", " "];

function splitLine(raw: string): { email: string; password: string } {
  const trimmed = raw.trim();
  let cut = -1;
  for (const sep of SEPARATORS) {
    const idx = trimmed.indexOf(sep);
    // Index 0 counts: a line that opens with a separator has no identifier at
    // all, and must be reported rather than silently read as an email.
    if (idx >= 0 && (cut === -1 || idx < cut)) cut = idx;
  }
  if (cut === -1) return { email: trimmed, password: "" };
  return {
    email: trimmed.slice(0, cut).trim(),
    password: trimmed.slice(cut + 1).trim(),
  };
}

/**
 * An account identifier is either an email or a platform username, so this only
 * rejects what could never be either: empty values and values carrying spaces.
 */
function looksUsable(value: string): boolean {
  return value.length > 0 && value.length <= 190 && !/\s/.test(value);
}

export function parseAccountBatch(input: string): ParsedAccountBatch {
  const accounts: ParsedAccount[] = [];
  const errors: ParsedAccountLine[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  input.split(/\r?\n/).forEach((raw, index) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const { email, password } = splitLine(trimmed);
    if (!email) {
      errors.push({ line: index + 1, raw: trimmed, error: "missing_email" });
      return;
    }
    if (!looksUsable(email)) {
      errors.push({ line: index + 1, raw: trimmed, error: "invalid_email" });
      return;
    }

    const key = email.toLowerCase();
    if (seen.has(key)) {
      duplicates.push(email);
      return;
    }
    seen.add(key);
    accounts.push(password ? { email, password } : { email });
  });

  return { accounts, errors, duplicates };
}
