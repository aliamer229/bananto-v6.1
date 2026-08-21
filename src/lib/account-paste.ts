/**
 * Extraction of account credentials from the lines suppliers actually send.
 *
 * Staff receive accounts as a line per account with Chinese labels around them:
 *
 *   ttxx7834 密码 a8dqq9sr 运动switch
 *   游戏 FC26 账号 e8yuh8S9@xiaohu666.com 密码 qw83150220
 *
 * Only three things in that line matter — the login, the password, and which
 * game it is — and only the first two are ever sent to a member. Everything
 * else is supplier packaging: labels, bundle notes, edition names. This reads
 * the line and returns just those, so staff paste and send instead of retyping
 * into fields, and nothing Chinese ever reaches the member.
 *
 * No model is involved: the markers are fixed words, so this is a parser.
 */

export interface ParsedAccountLine {
  /** Login: an email or a platform username. */
  username: string;
  password: string;
  /** Whatever names the game on that line, if anything did. Never sent as-is. */
  label?: string;
  /** The original line, kept so staff can see what a row came from. */
  raw: string;
}

/** Labels that introduce a value, in the forms suppliers use. */
const ACCOUNT_MARKERS = ["账号", "帐号", "账户", "用户名", "account", "user", "username", "id"];
const PASSWORD_MARKERS = ["密码", "密碼", "password", "pass", "pwd"];
const GAME_MARKERS = ["游戏", "遊戲", "game"];

/** A run of CJK characters — supplier packaging, never part of a credential. */
const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

function isCjk(token: string): boolean {
  return CJK.test(token);
}

function isMarker(token: string, markers: string[]): boolean {
  const lowered = token.toLowerCase().replace(/[:：=]+$/, "");
  return markers.some((marker) => lowered === marker.toLowerCase());
}

/**
 * A credential never contains CJK and is never a bare word of prose. Emails and
 * platform logins both pass; a Chinese game name does not.
 */
function looksLikeCredential(token: string): boolean {
  if (!token || token.length < 3 || token.length > 190) return false;
  if (isCjk(token)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._%+@-]*$/.test(token);
}

/** Split a line into tokens, treating the label separators as boundaries too. */
function tokenize(line: string): string[] {
  return line
    .replace(/[|,،;؛\t]+/g, " ")
    .replace(/([:：=])/g, " $1 ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^[:：=]$/.test(token));
}

/**
 * Parse one supplier line.
 *
 * A marked value wins over position — `账号 X 密码 Y` is unambiguous. When the
 * line carries no account marker, the first credential-shaped token before the
 * password marker is the login, which is the `ttxx7834 密码 a8dqq9sr` shape.
 */
export function parseAccountLine(line: string): ParsedAccountLine | null {
  const raw = line.trim();
  if (!raw || raw.startsWith("#")) return null;

  const tokens = tokenize(raw);
  if (tokens.length === 0) return null;

  let username = "";
  let password = "";
  const labelParts: string[] = [];
  let sawPasswordMarker = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    const next = tokens[i + 1];

    if (isMarker(token, PASSWORD_MARKERS)) {
      sawPasswordMarker = true;
      if (next && looksLikeCredential(next) && !password) {
        password = next;
        i += 1;
      }
      continue;
    }
    if (isMarker(token, ACCOUNT_MARKERS)) {
      if (next && looksLikeCredential(next) && !username) {
        username = next;
        i += 1;
      }
      continue;
    }
    if (isMarker(token, GAME_MARKERS)) {
      if (next && !isMarker(next, PASSWORD_MARKERS) && !isMarker(next, ACCOUNT_MARKERS)) {
        labelParts.push(next);
        i += 1;
      }
      continue;
    }

    if (looksLikeCredential(token)) {
      // Before the password marker an unlabelled credential is the login;
      // after it, it is the password.
      if (!sawPasswordMarker && !username) username = token;
      else if (sawPasswordMarker && !password) password = token;
      else labelParts.push(token);
      continue;
    }

    labelParts.push(token);
  }

  // A plain `login pass` / `login:pass` line carries no marker at all, which is
  // how staff paste accounts they typed themselves. Two credential-shaped
  // tokens and nothing else is unambiguous enough to read positionally.
  if (username && !password && !sawPasswordMarker) {
    const candidate = labelParts.find((part) => looksLikeCredential(part));
    if (candidate) {
      password = candidate;
      labelParts.splice(labelParts.indexOf(candidate), 1);
    }
  }

  if (!username || !password) return null;

  const label = labelParts.join(" ").trim();
  return {
    username,
    password,
    ...(label ? { label } : {}),
    raw,
  };
}

export interface ParsedAccountPaste {
  accounts: ParsedAccountLine[];
  /** Lines that carried something but no usable pair. */
  skipped: { line: number; raw: string }[];
  /** Logins that appeared more than once; the first occurrence is kept. */
  duplicates: string[];
}

/** Parse a whole paste — one account per line. */
export function parseAccountPaste(input: string): ParsedAccountPaste {
  const accounts: ParsedAccountLine[] = [];
  const skipped: { line: number; raw: string }[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  input.split(/\r?\n/).forEach((raw, index) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const parsed = parseAccountLine(trimmed);
    if (!parsed) {
      skipped.push({ line: index + 1, raw: trimmed });
      return;
    }
    const key = parsed.username.toLowerCase();
    if (seen.has(key)) {
      duplicates.push(parsed.username);
      return;
    }
    seen.add(key);
    accounts.push(parsed);
  });

  return { accounts, skipped, duplicates };
}
