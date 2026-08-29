<?php

namespace Tests\Feature;

use App\Models\CourierLocation;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The pruning job that `retain_hours` always implied and nobody had written.
 *
 * Worth testing rather than trusting: a prune with an off-by-one on the
 * comparison silently deletes the fix the customer's map is currently
 * showing, which looks like the courier vanishing mid-delivery.
 */
class PruneCourierLocationsTest extends TestCase
{
    private function ping(Carbon $recordedAt): CourierLocation
    {
        return CourierLocation::forceCreate([
            'id' => (string) Str::uuid(),
            'order_id' => (string) Str::uuid(),
            'courier_id' => (string) Str::uuid(),
            'lat' => 40.3776,
            'lng' => 49.8920,
            'recorded_at' => $recordedAt,
            'created_at' => $recordedAt,
        ]);
    }

    public function test_it_deletes_only_pings_past_the_retention_window(): void
    {
        config()->set('nata.tracking.retain_hours', 24);

        $stale = $this->ping(Carbon::now()->subHours(30));
        $alsoStale = $this->ping(Carbon::now()->subHours(25));
        $fresh = $this->ping(Carbon::now()->subHours(2));
        $current = $this->ping(Carbon::now());

        $this->artisan('nata:prune-locations')->assertExitCode(0);

        $this->assertDatabaseMissing('courier_locations', ['id' => $stale->id]);
        $this->assertDatabaseMissing('courier_locations', ['id' => $alsoStale->id]);

        // The two that matter: a live delivery's most recent fixes.
        $this->assertDatabaseHas('courier_locations', ['id' => $fresh->id]);
        $this->assertDatabaseHas('courier_locations', ['id' => $current->id]);
    }

    public function test_a_dry_run_deletes_nothing(): void
    {
        config()->set('nata.tracking.retain_hours', 24);
        $stale = $this->ping(Carbon::now()->subHours(48));

        $this->artisan('nata:prune-locations --dry-run')->assertExitCode(0);

        $this->assertDatabaseHas('courier_locations', ['id' => $stale->id]);
    }

    /** Chunking must not stop early and leave rows behind. */
    public function test_it_clears_everything_stale_even_across_chunks(): void
    {
        config()->set('nata.tracking.retain_hours', 1);

        for ($i = 0; $i < 25; $i++) {
            $this->ping(Carbon::now()->subHours(5));
        }
        $keep = $this->ping(Carbon::now());

        $this->artisan('nata:prune-locations --chunk=100')->assertExitCode(0);

        $this->assertSame(1, CourierLocation::count());
        $this->assertDatabaseHas('courier_locations', ['id' => $keep->id]);
    }

    public function test_it_refuses_a_nonsensical_window_rather_than_deleting_everything(): void
    {
        $fresh = $this->ping(Carbon::now());

        $this->artisan('nata:prune-locations --hours=0')->assertExitCode(1);

        $this->assertDatabaseHas('courier_locations', ['id' => $fresh->id]);
    }
}
