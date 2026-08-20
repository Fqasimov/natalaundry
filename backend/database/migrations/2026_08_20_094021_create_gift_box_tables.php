<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Gift box ("Hədiyyə Qutusu") tables.
 *
 * These are ADDITIVE — they create tables that did not appear in the schema
 * dump taken from the live project. Note that `orders.reward_id` already
 * exists there, so a rewards table of some shape may already be present under
 * a name we haven't seen; run `php artisan migrate --pretend` first and
 * reconcile before applying this to production.
 *
 * Nothing here alters or drops an existing column.
 */
return new class extends Migration
{
    public function up(): void
    {
        // The prize catalogue: what a box can contain, and how likely it is.
        if (! Schema::hasTable('rewards')) {
            Schema::create('rewards', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('kind');
                $table->string('title');
                $table->text('description')->nullable();
                $table->jsonb('value')->default('{}');
                // Relative draw weight within a box tier.
                $table->unsignedInteger('weight')->default(1);
                $table->string('box_tier');
                $table->boolean('active')->default(true);
                $table->timestampTz('created_at')->useCurrent();
            });

            Schema::table('rewards', function (Blueprint $table) {
                $table->index(['box_tier', 'active']);
            });
        }

        // A prize an individual customer has won.
        if (! Schema::hasTable('user_rewards')) {
            Schema::create('user_rewards', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('user_id');
                $table->uuid('reward_id');
                $table->timestampTz('won_at')->useCurrent();
                $table->timestampTz('expires_at');
                $table->timestampTz('used_at')->nullable();
                // Set when the reward is spent on a particular order.
                $table->uuid('used_on_order_id')->nullable();

                $table->index(['user_id', 'used_at']);
                $table->index('expires_at');
            });
        }

        // Audit trail, and what enforces the daily-box cooldown.
        if (! Schema::hasTable('gift_box_openings')) {
            Schema::create('gift_box_openings', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('user_id');
                $table->string('box_tier');
                $table->uuid('user_reward_id')->nullable();
                $table->uuid('order_id')->nullable();
                $table->timestampTz('opened_at')->useCurrent();

                $table->index(['user_id', 'box_tier', 'opened_at']);
            });
        }

        if (! Schema::hasTable('promo_codes')) {
            Schema::create('promo_codes', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('code')->unique();
                // 'percent' | 'amount' | 'free_delivery'
                $table->string('kind');
                $table->decimal('value', 10, 2)->default(0);
                $table->decimal('min_subtotal', 10, 2)->default(0);
                $table->unsignedInteger('max_redemptions')->nullable();
                $table->unsignedInteger('redemptions')->default(0);
                $table->boolean('active')->default(true);
                $table->timestampTz('starts_at')->nullable();
                $table->timestampTz('expires_at')->nullable();
                $table->timestampTz('created_at')->useCurrent();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('promo_codes');
        Schema::dropIfExists('gift_box_openings');
        Schema::dropIfExists('user_rewards');
        Schema::dropIfExists('rewards');
    }
};
