<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Make "the latest fix" a well-defined question.
 *
 * `$table->timestamp()` gives Postgres `timestamp(0)` — whole seconds. The
 * courier pings every few seconds (nata.tracking.ping_seconds), so two fixes
 * landing in the same second is ordinary, not exotic: a retry, a burst after
 * signal returns, or simply a ping rate that divides evenly.
 *
 * TrackingController::show() picks the newest row with
 * `orderByDesc('recorded_at')`. On tied timestamps Postgres is free to return
 * either row, so the customer's map can be handed an older fix than the one it
 * already has — the courier marker jumps backwards, then forwards again on the
 * next poll. Found by EndToEndJourneyTest, which posts four fixes in one second
 * and asserts the last one wins; it passed alone and failed in the full suite,
 * which is exactly the shape of a real ordering bug rather than a flaky test.
 *
 * Microsecond precision makes the ordering meaningful. The model also gets a
 * $dateFormat carrying microseconds, without which Laravel would keep
 * serialising to whole seconds and the wider column would change nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('courier_locations')) {
            return;
        }

        // Postgres only. SQLite has no fixed-precision timestamp type — it
        // stores what the model formats, so the $dateFormat change is the
        // whole fix there.
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('alter table courier_locations alter column recorded_at type timestamp(6) without time zone');
        DB::statement('alter table courier_locations alter column created_at type timestamp(6) without time zone');
    }

    public function down(): void
    {
        if (! Schema::hasTable('courier_locations') || DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('alter table courier_locations alter column recorded_at type timestamp(0) without time zone');
        DB::statement('alter table courier_locations alter column created_at type timestamp(0) without time zone');
    }
};
