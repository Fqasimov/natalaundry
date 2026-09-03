/**
 * Turns anything thrown into text a human can act on.
 *
 * Why this exists: `e instanceof Error ? e.message : String(e)` was copied
 * into ten screens, and it is wrong for the errors this app actually throws.
 * supabase-js rejects with a **PostgrestError**, which is a plain object
 * (`{ message, details, hint, code }`) and *not* an instance of `Error`. So
 * every one of those screens took the `String(e)` branch and rendered the
 * literal text "[object Object]" — the database explained exactly what went
 * wrong and the app threw the explanation away.
 *
 * `details` and `hint` are kept because Postgres puts the useful part there:
 * a check-constraint or RLS refusal often has a terse `message` and the actual
 * offending value in `details`.
 *
 * NOTE: this deliberately surfaces raw database wording. That is right while
 * the flow is being debugged and wrong for the store build — before release,
 * map known `code`s onto translated copy and keep this as the fallback.
 */
export function describeError(e: unknown): string {
  if (typeof e === "string") return e;

  if (e instanceof Error && e.message) return e.message;

  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;

    const text = (v: unknown) =>
      typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

    // Deduped: PostgREST sometimes repeats the message in `details`.
    const parts = [...new Set([text(o.message), text(o.details), text(o.hint)])]
      .filter((p): p is string => p !== null);

    const code = text(o.code);
    if (parts.length) return code ? `${parts.join(" — ")} (${code})` : parts.join(" — ");

    // Nothing recognisable. Anything beats "[object Object]" — name the class
    // at least, since an error whose fields are all non-enumerable serialises
    // to "{}" and the class is then the only clue left.
    const name = (e as { constructor?: { name?: string } }).constructor?.name ?? "Object";
    try {
      return `${name} ${JSON.stringify(e) ?? ""}`.trim();
    } catch {
      return name; // circular
    }
  }

  return String(e);
}

/**
 * `describeError`, plus the untouched original on the console so the full
 * object (stack, status, everything) reaches the Metro log even though the
 * screen only has room for a sentence.
 */
export function reportError(where: string, e: unknown): string {
  const message = describeError(e);
  console.error(`[${where}]`, message, e);
  return message;
}
