import { supabase } from "@/lib/supabase";

/**
 * Referrals.
 *
 * A referral code is a stable, public handle for one account. It is derived
 * from the profile id rather than stored on it: deriving needs no column and
 * no migration, and the same id always yields the same code, so a code shared
 * months ago still resolves.
 *
 * The alphabet omits 0/O/1/I/5/S — a referral code gets read aloud, written on
 * paper and typed by someone who did not choose it, and those are the pairs
 * people get wrong. Eight characters over a 30-symbol alphabet is ~39 bits,
 * which is far more than enough to be unguessable at this scale.
 */
/** What each side is paid, in manat. Mirrors supabase/referrals.sql. */
export const REFERRAL_BONUS = 5;

const ALPHABET = "2346789ABCDEFGHJKLMNPQRTUVWXYZ";
const CODE_LENGTH = 8;

export function referralCodeFor(profileId: string | null | undefined): string {
  if (!profileId) return "";

  // FNV-1a over the id, advanced per character. A uuid is already uniformly
  // distributed, so this only needs to spread it over the alphabet, not to
  // resist anything.
  let hash = 0x811c9dc5;
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    for (const ch of `${profileId}:${i}`) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    out += ALPHABET[hash % ALPHABET.length];
  }
  return out;
}

export type ReferralStats = {
  /** People who signed up with this code. */
  invited: number;
  /** Of those, the ones who have completed a paid order. */
  completed: number;
  /** Most recent first. `name` is a given name only. */
  friends: { id: string; name: string | null; completed: boolean; joinedAt: string | null }[];
};

const EMPTY: ReferralStats = { invited: 0, completed: 0, friends: [] };

/**
 * Who has used this account's code.
 *
 * Returns zeros rather than throwing when `referrals` is not there yet — the
 * table ships in supabase/referrals.sql and has to be applied by hand, and a
 * screen that crashes until then is worse than one that honestly shows none.
 */
export async function fetchReferralStats(): Promise<ReferralStats> {
  const { data, error } = await supabase
    .from("referrals")
    .select("id, status, created_at, referred:referred_id(name)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    // 42P01 is "relation does not exist"; anything else is worth surfacing.
    if (error.code === "42P01" || /does not exist/i.test(error.message)) return EMPTY;
    throw error;
  }

  const rows = data ?? [];
  const friends = rows.map((row: Record<string, unknown>) => {
    const referred = row.referred as { name?: string | null } | null;
    return {
      id: String(row.id),
      name: referred?.name?.trim().split(/\s+/)[0] ?? null,
      completed: row.status === "completed",
      joinedAt: (row.created_at as string | null) ?? null,
    };
  });

  return {
    invited: friends.length,
    completed: friends.filter((f) => f.completed).length,
    friends,
  };
}
