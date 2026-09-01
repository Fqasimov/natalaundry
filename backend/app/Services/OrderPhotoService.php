<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Profile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Short-lived viewing URLs for the garment photos on an order.
 *
 * The `order-photos` bucket is private, and deliberately grants nothing to
 * couriers or admins — see `storage_order_photos.sql`. A storage policy keys
 * on the object's path, and the path carries the customer's id, not the
 * order's; expressing "the courier assigned to *this order*" would mean
 * duplicating the orders join into the storage schema and keeping the two in
 * step forever. So staff read through here instead: this service holds the
 * service role, checks the order actually belongs to the caller, and signs
 * only the paths that order recorded.
 *
 * The service role bypasses RLS entirely, which is exactly why the
 * authorisation check in `viewableBy()` is the whole security boundary. It
 * runs before anything is signed, and the paths signed are read from the
 * order rather than taken from the request — a caller cannot ask for someone
 * else's object by naming it.
 */
class OrderPhotoService
{
    /**
     * How long a viewing URL lives.
     *
     * Long enough to open an order and look at three photos on a bad mobile
     * connection; short enough that a URL pasted into a chat is dead by the
     * time anyone else opens it. The photos are of customers' clothing inside
     * their homes, so the URL is the only thing standing between the object
     * and anyone who is handed it.
     */
    public const URL_TTL = 300;

    private const BUCKET = 'order-photos';

    /**
     * May this profile see the photos on this order?
     *
     * Three readers, for three reasons: the customer took them, the assigned
     * courier is the person the evidence is about, and an admin settles the
     * dispute. Notably *not* every courier — an unassigned courier has no more
     * business here than a stranger.
     */
    public function viewableBy(Order $order, ?Profile $profile): bool
    {
        if ($profile === null) {
            return false;
        }

        if ($profile->role === 'admin') {
            return true;
        }

        if ($order->user_id === $profile->id) {
            return true;
        }

        return $profile->role === 'courier' && $order->courier_id === $profile->id;
    }

    /**
     * Signed URLs for every photo on the order, in the order they were taken.
     *
     * @return array<int, array{path: string, url: ?string}>
     */
    public function signedUrls(Order $order): array
    {
        $paths = array_values(array_filter(
            $order->item_photos ?? [],
            fn ($path) => is_string($path) && $path !== '',
        ));

        if ($paths === []) {
            return [];
        }

        // Photos taken before uploads existed are device URIs — `file://` or
        // `content://` — pointing at a phone's own filesystem. Every photo in
        // production before 2026-08-27 is one of these. They cannot be signed
        // and never resolved for anyone, so they are reported with a null URL
        // rather than sent to the storage API to fail one by one.
        $signable = array_values(array_filter($paths, $this->isStoragePath(...)));

        $signed = $signable === [] ? [] : $this->sign($signable);

        return array_map(fn (string $path) => [
            'path' => $path,
            'url' => $signed[$path] ?? null,
        ], $paths);
    }

    /**
     * A path this bucket could hold, as opposed to a leftover device URI.
     *
     * Uploads write `<user-uuid>/<name>.<ext>`, so anything with a scheme, a
     * leading slash, or a `..` segment did not come from `uploadOrderPhoto`.
     * The traversal check matters because these strings reach a URL path: the
     * column is old enough to contain values written before any of the current
     * validation existed.
     */
    private function isStoragePath(string $path): bool
    {
        if ($path === '' || str_starts_with($path, '/') || str_contains($path, '..')) {
            return false;
        }

        return ! preg_match('#^[a-zA-Z][a-zA-Z0-9+.-]*://#', $path);
    }

    /**
     * Sign a batch of paths in one call.
     *
     * One request rather than one per photo: an order carries three of them by
     * default, and the storage API is a network hop away from wherever this
     * runs.
     *
     * @param  array<int, string>  $paths
     * @return array<string, string> path => absolute signed URL
     */
    private function sign(array $paths): array
    {
        $base = rtrim((string) config('services.supabase.url'), '/');
        $key = (string) config('services.supabase.service_role_key');

        if ($base === '' || $key === '') {
            // Deliberately not an exception: a missing key must not turn an
            // order detail screen into an error page. The photos come back
            // with null URLs and the screen says it cannot show them.
            Log::warning('Order photos cannot be signed: Supabase URL or service role key is not configured.');

            return [];
        }

        $response = Http::withToken($key)
            ->acceptJson()
            ->timeout(10)
            ->post("{$base}/storage/v1/object/sign/".self::BUCKET, [
                'expiresIn' => self::URL_TTL,
                'paths' => $paths,
            ]);

        if ($response->failed()) {
            Log::warning('Order photo signing failed.', [
                'status' => $response->status(),
                'count' => count($paths),
            ]);

            return [];
        }

        $urls = [];

        foreach ($response->json() ?? [] as $row) {
            // The batch endpoint reports per-path failures inline rather than
            // failing the request, so a deleted object does not cost the
            // caller the photos that are still there.
            $signed = $row['signedURL'] ?? $row['signedUrl'] ?? null;
            $path = $row['path'] ?? null;

            if (! is_string($signed) || ! is_string($path) || ($row['error'] ?? null)) {
                continue;
            }

            $urls[$path] = $base.'/storage/v1'.(str_starts_with($signed, '/') ? $signed : '/'.$signed);
        }

        return $urls;
    }
}
