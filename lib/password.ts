import type { StringKey } from "@/lib/i18n";

/**
 * What makes a password acceptable here, in one place.
 *
 * Signup used to check `password.length < 8` and nothing else, and said so
 * only after the form was submitted — so "Aaaaaaaa" passed, and anyone whose
 * password was rejected learned one rule per attempt. The rules are now shown
 * while typing and enforced from the same list, which is the point of putting
 * them here: a rule that is displayed but not enforced, or enforced but not
 * displayed, is worse than either alone.
 *
 * Deliberately not a regex over the whole string. Four independent checks give
 * four independent ticks, and the customer can see which one they have not met
 * rather than being told "invalid password".
 *
 * Supabase enforces its own minimum on top of this. Keep this at least as
 * strict, or a password that satisfies every tick on screen can still be
 * refused by the server, which reads as a broken form.
 */

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordCheck = {
  /** i18n key for the rule as shown to the customer. */
  key: StringKey;
  met: boolean;
};

export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { key: "passwordRuleLength", met: password.length >= PASSWORD_MIN_LENGTH },
    { key: "passwordRuleCase", met: /[a-zçğıöşü]/.test(password) && /[A-ZÇĞİÖŞÜ]/.test(password) },
    { key: "passwordRuleDigit", met: /\d/.test(password) },
    // Anything that is not a letter, a digit or whitespace. Defining symbols
    // by exclusion rather than listing them keeps the rule honest for a
    // customer typing an Azerbaijani or Russian keyboard's punctuation.
    { key: "passwordRuleSymbol", met: /[^\p{L}\p{N}\s]/u.test(password) },
  ];
}

export function isStrongPassword(password: string): boolean {
  return passwordChecks(password).every((c) => c.met);
}
