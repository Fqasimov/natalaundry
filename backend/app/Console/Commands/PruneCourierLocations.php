<?php

namespace App\Console\Commands;

use App\Models\CourierLocation;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Delete GPS pings older than the retention window.
 *
 * `nata.tracking.retain_hours` has been in config since the tracking feature
 * was written, and the migration that created `courier_locations` says "prune
 * old rows on a schedule" — but the schedule was never written. Without it the
 * table only grows.
 *
 * The arithmetic is what makes this urgent rather than tidy. A courier pings
 * every `ping_seconds` (5) while en route, so one active delivery writes ~720
 * rows an hour. Twenty concurrent deliveries over an eight-hour day is roughly
 * 115,000 rows, about 29 MB once the four indexes are counted. On a 500 MB
 * database that is a hard stop inside a fortnight, and it arrives as write
 * failures on live orders rather than as a warning.
 *
 * Deletes in bounded chunks: a single unqualified DELETE against a table this
 * size takes a long lock and bloats WAL, and this runs against the same
 * database serving live tracking reads.
 */
class PruneCourierLocations extends Command
{
    protected $signature = 'nata:prune-locations
                            {--hours= : Override the retention window}
                            {--chunk=5000 : Rows per delete statement}
                            {--dry-run : Report what would be deleted and stop}';

    protected $description = 'Delete courier GPS pings past the tracking retention window';

    public function handle(): int
    {
        $hours = (int) ($this->option('hours') ?? config('nata.tracking.retain_hours'));
        $chunk = max(100, (int) $this->option('chunk'));

        if ($hours < 1) {
            $this->error('Retention window must be at least one hour.');

            return self::FAILURE;
        }

        $cutoff = Carbon::now()->subHours($hours);

        $doomed = CourierLocation::query()
            ->where('recorded_at', '<', $cutoff)
            ->count();

        if ($doomed === 0) {
            $this->info("Nothing older than {$cutoff->toDateTimeString()}.");

            return self::SUCCESS;
        }

        if ($this->option('dry-run')) {
            $this->info("Would delete {$doomed} rows recorded before {$cutoff->toDateTimeString()}.");

            return self::SUCCESS;
        }

        $deleted = 0;
        do {
            // Chunked by primary key rather than a bare limited DELETE, which
            // Postgres does not support directly.
            $ids = CourierLocation::query()
                ->where('recorded_at', '<', $cutoff)
                ->limit($chunk)
                ->pluck('id');

            if ($ids->isEmpty()) {
                break;
            }

            $deleted += DB::table('courier_locations')->whereIn('id', $ids)->delete();
        } while (true);

        $this->info("Deleted {$deleted} pings recorded before {$cutoff->toDateTimeString()}.");

        return self::SUCCESS;
    }
}
