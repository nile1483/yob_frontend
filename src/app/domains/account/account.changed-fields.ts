/**
 * Building a partial update payload from what actually changed.
 *
 * ## Why this exists rather than "just send the form"
 *
 * The backend applies a field when its key is **present**, whatever the value:
 *
 * ```text
 * omitted   -> keep the stored value
 * "value"   -> set it
 * ""        -> deliberately clear it
 * ```
 *
 * A form serialises every input it renders, including the ones the buyer never
 * touched, and those arrive as `""`. Sending that whole object would clear the
 * customer's phone, email and second address line - the exact data loss backend Phase
 * 15B was written to stop, reintroduced from the client side.
 *
 * So the payload is a genuine before/after comparison against the record as it was
 * loaded.
 *
 * ## Truthiness is not usable here
 *
 * `if (value)` would drop three meaningful changes: clearing a field to `""`, and
 * setting a numeric or boolean field to `0` / `false`. A cleared phone number is a
 * change the buyer asked for, and silently discarding it is the same class of bug as
 * padding - the UI would appear to save and then show the old value back after the
 * refresh. The comparison below is strict inequality, nothing else.
 */

/**
 * The keys of `next` whose value differs from `initial`, as a partial object.
 *
 * Values are compared with `!==` after trimming strings, because a buyer who adds a
 * trailing space has not changed their address and does not need a request for it.
 * Trimming is applied to the *emitted* value too, so what is compared is what is sent.
 *
 * Returns an empty object when nothing changed - callers should treat that as "no
 * request needed" rather than sending `{name}` alone.
 */
export function changedFields<T extends object>(initial: T, next: T): Partial<T> {
  const patch: Record<string, string> = {};

  for (const key of Object.keys(next) as (keyof T & string)[]) {
    const before = normalize(initial[key] as unknown as string | undefined);
    const after = normalize(next[key] as unknown as string | undefined);

    if (before !== after) {
      patch[key] = after;
    }
  }

  return patch as Partial<T>;
}

/** Whether anything changed at all. */
export function hasChanges(patch: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(patch).length > 0;
}

/**
 * A record's editable values, with every absent field as `''`.
 *
 * Form inputs cannot hold `null`, so the loaded record is flattened for editing. This
 * is safe *because* the result is only ever compared against the form's own state:
 * `null` and `''` both normalise to `''`, so a field that was empty and stayed empty
 * produces no key, and no spurious clear is ever sent.
 */
export function toFormValues<K extends string>(
  record: Readonly<Record<string, unknown>>,
  keys: readonly K[],
): Record<K, string> {
  const values = {} as Record<K, string>;

  for (const key of keys) {
    const value = record[key];
    values[key] = typeof value === 'string' ? value : '';
  }

  return values;
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim();
}
