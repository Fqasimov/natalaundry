<?php

namespace Tests\Support;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mirrors the live Supabase tables so the suite can run against an in-memory
 * SQLite database.
 *
 * This is TEST-ONLY scaffolding — it is deliberately NOT a migration, because
 * these tables already exist in production and must never be created or
 * altered by this codebase. Column names and nullability follow the
 * information_schema dump taken from the live project.
 */
class SupabaseSchema
{
    public static function create(): void
    {
        Schema::create('profiles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('phone');
            $table->string('email')->nullable();
            $table->string('language')->default('az');
            $table->integer('points')->default(100);
            $table->boolean('is_subscribed')->default(false);
            $table->string('push_token')->nullable();
            $table->timestamp('last_active_at')->nullable();
            $table->date('birthday')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->string('role')->nullable()->default('user');
            $table->decimal('wallet_balance', 12, 2)->default(0);
            $table->timestamp('subscription_expires_at')->nullable();
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->string('status')->default('pending');
            $table->string('delivery_tier')->default('standard');
            $table->decimal('subtotal', 12, 2);
            $table->decimal('discount', 12, 2)->default(0);
            $table->decimal('delivery_fee', 12, 2)->default(0);
            $table->decimal('total', 12, 2);
            $table->string('collection_time');
            $table->string('delivery_time');
            $table->timestamp('created_at')->nullable();
            $table->uuid('courier_id')->nullable();
            $table->uuid('reward_id')->nullable();
            $table->string('service_type')->default('standard');
            $table->string('address')->nullable();
            $table->decimal('address_lat', 12, 8)->nullable();
            $table->decimal('address_lng', 12, 8)->nullable();
            $table->text('notes')->nullable();
            $table->decimal('deposit_amount', 12, 2)->nullable()->default(0);
            $table->decimal('counted_total', 12, 2)->nullable();
            $table->timestamp('counted_at')->nullable();
            $table->uuid('counted_by')->nullable();
            $table->string('payment_method')->nullable();
            $table->string('payment_status')->nullable()->default('pending');
            $table->boolean('is_outside_city')->default(false);
            $table->json('item_photos')->nullable();
            $table->string('dispatch_state')->default('awaiting_admin');
            $table->string('lifecycle_state')->default('order_placed');
            $table->timestamp('processing_finished_at')->nullable();
            $table->string('promo_code')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('offered_at')->nullable();
            $table->timestamp('assigned_at')->nullable();
            // In Postgres this is a bigint fed by orders_order_no_seq; SQLite
            // can't express that alongside the uuid primary key, so tests
            // simply leave it nullable.
            $table->bigInteger('order_no')->nullable();
            $table->timestamp('collected_at')->nullable();
            $table->timestamp('cleaning_started_at')->nullable();
            $table->timestamp('delivering_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id')->index();
            $table->string('title')->nullable();
            $table->text('body')->nullable();
            $table->boolean('read')->default(false);
            $table->json('payload')->nullable();
            $table->timestamp('created_at')->nullable();
        });

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

        Schema::create('courier_assignments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('order_id')->index();
            $table->uuid('courier_id')->index();
            $table->timestamp('offered_at')->nullable();
            $table->timestamp('claimed_at')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->unique(['order_id', 'courier_id']);
        });

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
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('order_id');
            $table->string('service_id');
            $table->string('item_id');
            $table->string('item_name');
            $table->decimal('price', 12, 2);
            $table->integer('quantity');
        });

        Schema::create('wallet_transactions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->decimal('amount', 12, 2);
            $table->string('kind');
            $table->uuid('order_id')->nullable();
            $table->text('note')->nullable();
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('service_prices', function (Blueprint $table) {
            $table->string('service_id');
            $table->string('item_id');
        });

        // `payments` and `payment_intents` both exist in the live project
        // (they appear in the RLS dump); these mirror the columns the app
        // relies on. transaction_ref holds the Kapital Bank order id.
        Schema::create('payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('order_id');
            $table->decimal('amount', 12, 2);
            $table->string('status')->default('Pending');
            $table->string('payment_method')->default('Card');
            $table->string('transaction_ref')->nullable();
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('payment_intents', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->string('purpose');
            $table->decimal('amount', 12, 2);
            $table->string('status')->default('pending');
            $table->string('transaction_ref')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('settled_at')->nullable();
        });

        // Owned by this codebase — see the create_wallet_topups migration.
        Schema::create('wallet_topups', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id')->index();
            $table->decimal('amount', 10, 2);
            $table->string('status', 32)->default('pending');
            $table->string('payment_method', 32)->nullable();
            $table->string('transaction_ref')->nullable()->unique();
            $table->timestamp('settled_at')->nullable();
            $table->timestamp('created_at')->nullable();
        });

        // Tables this codebase does own (see the gift-box migration).
        Schema::create('rewards', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('kind');
            $table->string('title');
            $table->text('description')->nullable();
            $table->json('value')->nullable();
            $table->unsignedInteger('weight')->default(1);
            $table->string('box_tier');
            $table->boolean('active')->default(true);
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('user_rewards', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->uuid('reward_id');
            $table->timestamp('won_at')->nullable();
            $table->timestamp('expires_at');
            $table->timestamp('used_at')->nullable();
            $table->uuid('used_on_order_id')->nullable();
        });

        Schema::create('gift_box_openings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->string('box_tier');
            $table->uuid('user_reward_id')->nullable();
            $table->uuid('order_id')->nullable();
            $table->timestamp('opened_at')->nullable();
        });

        Schema::create('promo_codes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code')->unique();
            $table->string('kind');
            $table->decimal('value', 10, 2)->default(0);
            $table->decimal('min_subtotal', 10, 2)->default(0);
            $table->unsignedInteger('max_redemptions')->nullable();
            $table->unsignedInteger('redemptions')->default(0);
            $table->boolean('active')->default(true);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('created_at')->nullable();
        });
    }
}
