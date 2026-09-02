import { supabase } from "@/lib/supabase";

/**
 * The garment photos on an order, as URLs that can actually be rendered.
 *
 * The bucket is private, so there is no permanent URL to put in an `<Image>`;
 * each path has to be signed on demand.
 *
 * This used to go through the API, which signed with the service role key
 * because couriers and admins held no storage grant at all. They do now: two
 * storage policies let a courier read the photos of customers whose orders are
 * assigned to them, and an admin read any. So every reader signs for
 * themselves, with their own token, and the rules live in the policies rather
 * than in a service that has to be trusted to apply them.
 */

export type OrderPhoto = {
  /** The stored path. Stable; the URL is not. */
  path: string;
  /**
   * A short-lived viewing URL, or null when the photo cannot be shown:
   * a device URI left over from before uploads existed, a deleted object,
   * or the signing call failing.
   */
  url: string | null;
};

export type OrderPhotos = {
  photos: OrderPhoto[];
  /** When the URLs stop working, as an epoch milliseconds timestamp. */
  expiresAt: number;
};

const BUCKET = "order-photos";

/** Seconds a signed URL stays valid. */
const URL_TTL = 300;

/**
 * A path that predates uploads existing.
 *
 * Five orders from mid-August hold iOS Simulator paths in `item_photos`.
 * Passing one to the signer would produce a URL that 404s; returning null lets
 * the screen say it cannot show the photo, which is the truth.
 */
const isDeviceUri = (path: string): boolean =>
  path.startsWith("file://") || path.startsWith("content://");

export async function fetchOrderPhotos(orderId: string): Promise<OrderPhotos> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("item_photos")
    .eq("id", orderId)
    .single();

  if (error) throw error;

  const paths = (Array.isArray(order?.item_photos) ? order.item_photos : [])
    .filter((p): p is string => typeof p === "string");

  const usable = paths.filter((p) => !isDeviceUri(p));

  // One call for the whole order rather than one per photo: an order carries
  // three by default and storage is a network hop away.
  const signed = usable.length
    ? await supabase.storage.from(BUCKET).createSignedUrls(usable, URL_TTL)
    : { data: [], error: null };

  const urlFor = new Map<string, string>();
  for (const row of signed.data ?? []) {
    if (row.path && row.signedUrl) urlFor.set(row.path, row.signedUrl);
  }

  return {
    photos: paths.map((path) => ({ path, url: urlFor.get(path) ?? null })),
    expiresAt: Date.now() + URL_TTL * 1000,
  };
}
