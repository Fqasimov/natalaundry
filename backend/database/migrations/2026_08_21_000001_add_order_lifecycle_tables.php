<?php

use App\Support\OrderLifecycle;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Additive only. The live Supabase schema is shared with the shipped app and
 * its RLS policies, so nothing here drops or rewrites an existing column:
 * `orders.status` keeps its six values and every new column is nullable or
 * defaulted. Run `php artisan migrate --pretend` against production and
 * reconcile the reward tables before applying (see DESIGN_NOTES.md).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('orders') && ! Schema::hasColumn('orders', 'lifecycle_state')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->string('lifecycle_state')->default(OrderLifecycle::ORDER_PLACED);
                // Set when an admin marks the load cleaned, so "ready for
                // return" survives a restart rather than living in memory.
                $table->timestamp('processing_finished_at')->nullable();
                // The promo actually applied, kept for auditing the discount.
                $table->string('promo_code')->nullable();
            });
        }

        // Append-only audit trail: one row per transition, who drove it and
        // when. Doubles as the source for the customer's timeline stepper.
        if (! Schema::hasTable('order_status_logs')) {
            Schema::create('order_status_logs', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('order_id')->index();
                $table->string('from_state')->nullable();
                $table->string('to_state');
                $table->uuid('actor_id')->nullable();
                $table->string('actor_role')->nullable();
                $table->text('note')->nullable();
                $table->timestamp('created_at')->nullable();
            });
        }

        // Broadcast pool. A row per (order, courier) offered; the winner is
        // recorded by claimed_at. Unique on the pair so a double POST from one
        // courier can't create two offers.
        if (! Schema::hasTable('courier_assignments')) {
            Schema::create('courier_assignments', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('order_id')->index();
                $table->uuid('courier_id')->index();
                $table->timestamp('offered_at')->nullable();
                $table->timestamp('claimed_at')->nullable();
                $table->timestamp('created_at')->nullable();
                $table->unique(['order_id', 'courier_id']);
            });
        }

        // Live position pings. Written frequently and read by one customer, so
        // it stays deliberately narrow; prune old rows on a schedule.
        if (! Schema::hasTable('courier_locations')) {
            Schema::create('courier_locations', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('order_id')->index();
                $table->uuid('courier_id')->index();
                $table->decimal('lat', 10, 7);
                $table->decimal('lng', 10, 7);
                $table->decimal('heading', 6, 2)->nullable();
                $table->decimal('speed', 8, 2)->nullable();
                $table->decimal('accuracy', 8, 2)->nullable();
                $table->timestamp('recorded_at')->nullable();
                $table->timestamp('created_at')->nullable();
                $table->index(['order_id', 'recorded_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('courier_locations');
        Schema::dropIfExists('courier_assignments');
        Schema::dropIfExists('order_status_logs');

        if (Schema::hasTable('orders') && Schema::hasColumn('orders', 'lifecycle_state')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->dropColumn(['lifecycle_state', 'processing_finished_at', 'promo_code']);
            });
        }
    }
};
