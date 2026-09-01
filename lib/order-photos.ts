import { apiRequest } from "@/lib/api";

/**
 * The garment photos on an order, as URLs that can actually be rendered.
 *
 * The bucket is private, so there is no permanent URL to put in an `<Image>`.
 * The API signs the order's recorded paths on demand after checking the
 * reader is the customer, the assigned courier, or an admin — see
 * `OrderPhotoService`. Couriers and admins hold no storage grant at all, so
 * this is the only route by which they ever see the evidence trail.
 *
 * A customer could sign their own photos directly through the Supabase client
 * (`signedPhotoUrl` in `lib/uploads.ts` does exactly that), but the screen
 * showing them serves both sides. Going through the API for both keeps one
 * code path instead of branching on the reader's role to pick a mechanism.
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

type PhotosResponse = {
  data: OrderPhoto[];
  /** Seconds the URLs remain valid. */
  expires_in: number;
};

export type OrderPhotos = {
  photos: OrderPhoto[];
  /** When the URLs stop working, as an epoch milliseconds timestamp. */
  expiresAt: number;
};

export async function fetchOrderPhotos(orderId: string): Promise<OrderPhotos> {
  const response = await apiRequest<PhotosResponse>(`orders/${orderId}/photos`);

  // The server's TTL rather than a constant here: the two would drift, and
  // this side drifting long is the failure that shows a customer a broken
  // image instead of refetching.
  const ttl = Number(response.expires_in);

  return {
    photos: response.data ?? [],
    expiresAt: Date.now() + (Number.isFinite(ttl) ? ttl : 300) * 1000,
  };
}
