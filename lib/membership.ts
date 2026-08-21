// Membership tiers.
//
// Gold sits at 1500 because the Laravel reference computes progress as
// `max(0, 1500 - xp)` toward it. The shipped design shows a fresh account as
// "Nata Bronze", so Bronze is the entry tier and Silver moved up to 500;
// Platinum extends the ladder so it doesn't dead-end at Gold.
//
// `profiles.points` is the confirmed column in the live schema, so that is
// what drives the tier here (the reference API calls the same quantity "xp").

export type MembershipTier = {
  key: "bronze" | "silver" | "gold" | "platinum";
  name: string;
  /** Inclusive lower bound, in points. */
  threshold: number;
  /** Badge tint / foreground, matching the app's token palette. */
  tint: string;
  fg: string;
};

export const MEMBERSHIP_TIERS: readonly MembershipTier[] = [
  { key: "bronze", name: "Nata Bronze", threshold: 0, tint: "#F6E7DA", fg: "#9A5B25" },
  { key: "silver", name: "Nata Silver", threshold: 500, tint: "#ECEEF1", fg: "#6B7280" },
  { key: "gold", name: "Nata Gold", threshold: 1500, tint: "#FCF0D2", fg: "#B98407" },
  { key: "platinum", name: "Nata Platinum", threshold: 3500, tint: "#E7E6FB", fg: "#5B57D6" },
] as const;

export function tierFor(points: number): MembershipTier {
  let current = MEMBERSHIP_TIERS[0];
  for (const tier of MEMBERSHIP_TIERS) {
    if (points >= tier.threshold) current = tier;
  }
  return current;
}

export function nextTierFor(points: number): MembershipTier | null {
  return MEMBERSHIP_TIERS.find((tier) => points < tier.threshold) ?? null;
}

/** Points still needed for the next tier, or null when already at the top. */
export function pointsToNextTier(points: number): number | null {
  const next = nextTierFor(points);
  return next ? Math.max(0, next.threshold - points) : null;
}
