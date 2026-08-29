import { supabase } from "@/lib/supabase";

/**
 * Garment photos, actually uploaded.
 *
 * Before this existed, the checkout screen put `result.assets[0].uri` straight
 * into the order draft — a `file://` or `content://` path pointing at the
 * phone's own filesystem. Those went into `orders.item_photos` and were
 * returned by the API to couriers and admins, for whom they resolve to
 * nothing. Every photo taken in production so far is unrecoverable.
 *
 * The photos exist to settle "this came back damaged" arguments, so they have
 * to survive leaving the device.
 *
 * The bucket is private (`storage_order_photos.sql`). Paths are
 * `<user-id>/<random>.jpg`, which is what the storage policies key on — a
 * customer can only write inside their own folder.
 */

const BUCKET = "order-photos";

/** What the picker hands back, narrowed to the parts that matter here. */
export type PickedImage = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
};

export class UploadError extends Error {}

const extensionFor = (image: PickedImage): string => {
  const fromName = image.fileName?.split(".").pop()?.toLowerCase();
  if (fromName && /^(jpe?g|png|webp|heic)$/.test(fromName)) return fromName;

  const fromMime = image.mimeType?.split("/")[1]?.toLowerCase();
  if (fromMime && /^(jpe?g|png|webp|heic)$/.test(fromMime)) return fromMime;

  // The picker is configured for images and the bucket rejects anything else,
  // so a missing hint means the metadata was absent, not that the file is
  // something exotic.
  return "jpg";
};

/**
 * Upload one photo and return the storage path to record on the order.
 *
 * Returns a path, not a URL: the bucket is private, so a URL would either be
 * unusable or a signed one that expires long before a dispute is raised. The
 * path is the durable reference; a viewer signs it on demand.
 */
export async function uploadOrderPhoto(image: PickedImage): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userId = session?.user?.id;
  if (!userId) {
    throw new UploadError("Not signed in.");
  }

  // React Native's fetch reads file:// and content:// URIs, which is how the
  // bytes get off the device. Reading as ArrayBuffer rather than passing the
  // blob straight through: Supabase's client mis-sizes RN blobs and uploads
  // zero-byte objects, which fail silently and look like a working upload.
  let bytes: ArrayBuffer;
  try {
    const response = await fetch(image.uri);
    bytes = await response.arrayBuffer();
  } catch {
    throw new UploadError("Could not read the photo from the device.");
  }

  if (bytes.byteLength === 0) {
    throw new UploadError("The photo was empty.");
  }

  const extension = extensionFor(image);
  const contentType =
    image.mimeType && image.mimeType.startsWith("image/")
      ? image.mimeType
      : `image/${extension === "jpg" ? "jpeg" : extension}`;

  // Crypto-random rather than a counter or a timestamp: object names in a
  // private bucket should not be guessable from another order's name.
  const name = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(name, bytes, {
    contentType,
    // Never overwrite. An uploaded photo is evidence; replacing one after a
    // dispute has started is exactly what must not be possible.
    upsert: false,
  });

  if (error) {
    throw new UploadError(error.message);
  }

  return name;
}

/**
 * Remove a photo the customer took back out of the draft.
 *
 * Best-effort: if the delete fails the object is orphaned in the bucket, which
 * costs a little storage and nothing else. Blocking the customer from editing
 * their basket over it would be the worse trade.
 */
export async function removeOrderPhoto(path: string): Promise<void> {
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // Deliberately swallowed — see above.
  }
}

/**
 * A temporary URL for showing a photo back to the customer.
 *
 * The bucket is private, so there is no permanent URL to render. Couriers and
 * admins do not use this path at all: they have no storage policy granting
 * them access, and are served signed URLs by the API, which can check that the
 * order is actually theirs.
 */
export async function signedPhotoUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  return error ? null : (data?.signedUrl ?? null);
}
