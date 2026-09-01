<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Profile;
use App\Services\OrderPhotoService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\Support\IssuesSupabaseTokens;
use Tests\TestCase;

/**
 * Signed viewing URLs for garment photos.
 *
 * The service role bypasses RLS, so the check in the controller is the only
 * thing standing between a stranger and photographs of someone's clothing
 * inside their home. These tests are mostly about who is refused.
 */
class OrderPhotoTest extends TestCase
{
    use IssuesSupabaseTokens;

    private const SIGN_URL = '*/storage/v1/object/sign/order-photos';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.supabase.url' => 'https://project.supabase.co',
            'services.supabase.service_role_key' => 'service-role-key',
            'services.supabase.jwt_secret' => $this->supabaseSecret(),
        ]);
    }

    private function profile(array $attributes = []): Profile
    {
        return Profile::forceCreate(array_merge([
            'id' => (string) Str::uuid(),
            'name' => 'Test',
            'phone' => '+9945'.random_int(10000000, 99999999),
            'email' => Str::uuid().'@example.com',
            'language' => 'az',
            'points' => 0,
            'is_subscribed' => false,
            'role' => 'customer',
            'wallet_balance' => 0,
            'created_at' => now(),
        ], $attributes));
    }

    private function order(Profile $customer, array $attributes = []): Order
    {
        return Order::forceCreate(array_merge([
            'id' => (string) Str::uuid(),
            'user_id' => $customer->id,
            'status' => 'pending',
            'lifecycle_state' => 'order_placed',
            'delivery_tier' => 'standard',
            'service_type' => 'dry_cleaning',
            'subtotal' => 40,
            'discount' => 0,
            'delivery_fee' => 0,
            'total' => 40,
            'collection_time' => 'Sabah, 18:00 - 20:00',
            'delivery_time' => 'Sabah, 18:00 - 20:00',
            'is_outside_city' => false,
            'item_photos' => [],
            'created_at' => now(),
        ], $attributes));
    }

    /** @param array<int, string> $paths */
    private function fakeSigning(array $paths): void
    {
        Http::fake([
            self::SIGN_URL => Http::response(array_map(fn (string $p) => [
                'path' => $p,
                'signedURL' => "/object/sign/order-photos/{$p}?token=fake",
                'error' => null,
            ], $paths)),
        ]);
    }

    public function test_the_customer_sees_their_own_photos(): void
    {
        $customer = $this->profile();
        $order = $this->order($customer, ['item_photos' => ["{$customer->id}/a.jpg"]]);

        $this->fakeSigning(["{$customer->id}/a.jpg"]);

        $body = $this->getJson("/api/orders/{$order->id}/photos", $this->as($customer))
            ->assertOk()
            ->json();

        $this->assertCount(1, $body['data']);
        $this->assertSame("{$customer->id}/a.jpg", $body['data'][0]['path']);
        $this->assertStringStartsWith(
            'https://project.supabase.co/storage/v1/object/sign/order-photos/',
            $body['data'][0]['url'],
        );
        $this->assertSame(OrderPhotoService::URL_TTL, $body['expires_in']);
    }

    public function test_the_assigned_courier_sees_them(): void
    {
        $customer = $this->profile();
        $courier = $this->profile(['role' => 'courier']);
        $order = $this->order($customer, [
            'courier_id' => $courier->id,
            'item_photos' => ["{$customer->id}/a.jpg"],
        ]);

        $this->fakeSigning(["{$customer->id}/a.jpg"]);

        $this->getJson("/api/orders/{$order->id}/photos", $this->as($courier))
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    /**
     * The one that matters. A courier is a trusted role, but trust is per
     * order — an unassigned courier is a stranger to this customer's laundry.
     */
    public function test_an_unassigned_courier_is_refused(): void
    {
        $customer = $this->profile();
        $mine = $this->profile(['role' => 'courier']);
        $other = $this->profile(['role' => 'courier']);
        $order = $this->order($customer, [
            'courier_id' => $mine->id,
            'item_photos' => ["{$customer->id}/a.jpg"],
        ]);

        Http::fake();

        $this->getJson("/api/orders/{$order->id}/photos", $this->as($other))
            ->assertStatus(403);

        // Nothing was signed: the check runs before the storage call, so a
        // refused request cannot mint a URL that outlives the refusal.
        Http::assertNothingSent();
    }

    public function test_another_customer_is_refused(): void
    {
        $customer = $this->profile();
        $stranger = $this->profile();
        $order = $this->order($customer, ['item_photos' => ["{$customer->id}/a.jpg"]]);

        Http::fake();

        $this->getJson("/api/orders/{$order->id}/photos", $this->as($stranger))
            ->assertStatus(403);

        Http::assertNothingSent();
    }

    public function test_an_admin_sees_any_order(): void
    {
        $customer = $this->profile();
        $admin = $this->profile(['role' => 'admin']);
        $order = $this->order($customer, ['item_photos' => ["{$customer->id}/a.jpg"]]);

        $this->fakeSigning(["{$customer->id}/a.jpg"]);

        $this->getJson("/api/orders/{$order->id}/photos", $this->as($admin))
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    /**
     * Only what the order recorded gets signed. The paths come from the row,
     * never from the request, so naming someone else's object is not an
     * available move — this pins that the request body cannot introduce one.
     */
    public function test_only_paths_recorded_on_the_order_are_signed(): void
    {
        $customer = $this->profile();
        $victim = $this->profile();
        $order = $this->order($customer, ['item_photos' => ["{$customer->id}/mine.jpg"]]);

        $this->fakeSigning(["{$customer->id}/mine.jpg"]);

        $this->getJson(
            "/api/orders/{$order->id}/photos?paths[]={$victim->id}/secret.jpg",
            $this->as($customer),
        )->assertOk();

        Http::assertSent(function ($request) use ($customer, $victim) {
            $paths = $request->data()['paths'];

            return $paths === ["{$customer->id}/mine.jpg"]
                && ! str_contains(json_encode($paths), $victim->id);
        });
    }

    /**
     * Every photo taken before uploads existed is a `file://` or `content://`
     * device URI. They resolve for nobody and cannot be signed, so they come
     * back with a null URL instead of being sent to the storage API.
     */
    public function test_legacy_device_uris_are_reported_rather_than_signed(): void
    {
        $customer = $this->profile();
        $order = $this->order($customer, [
            'item_photos' => [
                'file:///var/mobile/one.jpg',
                'content://media/external/images/2',
                "{$customer->id}/real.jpg",
            ],
        ]);

        $this->fakeSigning(["{$customer->id}/real.jpg"]);

        $body = $this->getJson("/api/orders/{$order->id}/photos", $this->as($customer))
            ->assertOk()
            ->json('data');

        $this->assertCount(3, $body, 'Every recorded photo is reported, signable or not.');
        $this->assertNull($body[0]['url']);
        $this->assertNull($body[1]['url']);
        $this->assertNotNull($body[2]['url']);

        Http::assertSent(fn ($request) => $request->data()['paths'] === ["{$customer->id}/real.jpg"]);
    }

    public function test_a_path_traversal_is_not_signed(): void
    {
        $customer = $this->profile();
        $order = $this->order($customer, [
            'item_photos' => ['../../other-bucket/secret.jpg', '/absolute.jpg'],
        ]);

        Http::fake();

        $body = $this->getJson("/api/orders/{$order->id}/photos", $this->as($customer))
            ->assertOk()
            ->json('data');

        $this->assertNull($body[0]['url']);
        $this->assertNull($body[1]['url']);
        Http::assertNothingSent();
    }

    /**
     * A missing service role key must not turn the order screen into an error
     * page — the photos are supporting detail, not the point of the screen.
     */
    public function test_a_missing_service_role_key_degrades_rather_than_fails(): void
    {
        config(['services.supabase.service_role_key' => '']);

        $customer = $this->profile();
        $order = $this->order($customer, ['item_photos' => ["{$customer->id}/a.jpg"]]);

        Http::fake();

        $body = $this->getJson("/api/orders/{$order->id}/photos", $this->as($customer))
            ->assertOk()
            ->json('data');

        $this->assertNull($body[0]['url']);
        Http::assertNothingSent();
    }

    public function test_a_storage_outage_degrades_rather_than_fails(): void
    {
        $customer = $this->profile();
        $order = $this->order($customer, ['item_photos' => ["{$customer->id}/a.jpg"]]);

        Http::fake([self::SIGN_URL => Http::response('nope', 500)]);

        $body = $this->getJson("/api/orders/{$order->id}/photos", $this->as($customer))
            ->assertOk()
            ->json('data');

        $this->assertNull($body[0]['url']);
    }

    public function test_an_order_with_no_photos_signs_nothing(): void
    {
        $customer = $this->profile();
        $order = $this->order($customer, ['item_photos' => []]);

        Http::fake();

        $this->getJson("/api/orders/{$order->id}/photos", $this->as($customer))
            ->assertOk()
            ->assertJsonCount(0, 'data');

        Http::assertNothingSent();
    }
}
