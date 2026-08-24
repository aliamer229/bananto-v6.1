/**
 * Is this cart line an **Offline account** purchase?
 *
 * ## Why this is not a string comparison
 *
 * The same choice is recorded under several names, because it was written by
 * several generations of the catalogue:
 *
 * - the import template standardises `option.1.id=offline_account` and
 *   `type.1.id=standard_offline` / `type.3.id=dlc_offline`;
 * - options added by hand in the editor get generated ids (`opt_17…`) and carry
 *   the meaning only in their name — "حساب أوفلاين", "Offline Account";
 * - a product's own `kind` may be `offline_account`.
 *
 * A coupon restricted to offline accounts has to recognise all of them, and
 * must never mistake the online option for one. So the decision is made once,
 * here, from the identifiers actually stored on the line — never from text
 * rendered in the interface.
 */

/** The selection as it is stored on a cart line, order item, or coupon item. */
export interface AccountSelection {
  optionId?: string | number | null;
  optionName?: string | null;
  typeId?: string | number | null;
  typeName?: string | null;
  /** The product's kind, which can itself be `offline_account`. */
  kind?: string | null;
  /** Which hub offer the line came from (account / lend / disc). */
  offerKind?: string | null;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/[_\-\s]+/g, " ")
    .trim();
}

/** Arabic spellings in use: أوفلاين / اوفلاين / أوف لاين. */
const OFFLINE_PATTERN = /(^|[^a-z])offline([^a-z]|$)|اوفلاين|اوف لاين/;
const ONLINE_PATTERN = /(^|[^a-z])online([^a-z]|$)|اونلاين|اون لاين/;

/** Every field that can name the selection, most specific first. */
function selectionFields(selection: AccountSelection): string[] {
  return [
    selection.optionId,
    selection.optionName,
    selection.typeId,
    selection.typeName,
    selection.kind,
    selection.offerKind,
  ]
    .map(normalize)
    .filter(Boolean);
}

/**
 * True only when something on the line says "offline" and nothing says
 * "online".
 *
 * The two are checked together on purpose: a line whose option is
 * `online_account` while its product kind is a generic `account` must not
 * qualify because of some unrelated field, and a line that names both is
 * ambiguous rather than eligible.
 */
export function isOfflineAccountSelection(selection: AccountSelection | null | undefined): boolean {
  if (!selection) return false;
  const fields = selectionFields(selection);
  if (fields.length === 0) return false;

  const saysOffline = fields.some((field) => OFFLINE_PATTERN.test(field));
  if (!saysOffline) return false;

  /*
    `offline` does not contain `online` as a substring, so a line matching both
    genuinely carries two conflicting labels — an option named "Offline" under a
    type named "Online", say. Refuse it rather than guess which one the member
    actually bought.
  */
  const saysOnline = fields.some((field) => ONLINE_PATTERN.test(field));
  return !saysOnline;
}

/** The mirror of the above, for surfaces that need to name the online option. */
export function isOnlineAccountSelection(selection: AccountSelection | null | undefined): boolean {
  if (!selection) return false;
  const fields = selectionFields(selection);
  const saysOnline = fields.some((field) => ONLINE_PATTERN.test(field));
  if (!saysOnline) return false;
  return !fields.some((field) => OFFLINE_PATTERN.test(field));
}
