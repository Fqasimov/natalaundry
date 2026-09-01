<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Money going *into* Nata Balance.
 *
 * A separate table rather than reusing `payment_intents`: that table exists in
 * the live database but only `id` and `user_id` were ever recovered from the
 * policy dump, so its real columns are unknown. Writing to columns that may
 * not exist is what left the notification inbox rendering blank rows, and a
 * top-up is money — it is not the place to guess.
 *
 * `settled_at` is what makes crediting idempotent: the bank can be asked the
 * same question many times (browser callback, app poll, reconciliation job)
 * and only the first answer that says "paid" moves the balance.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('wallet_topups')) {
            return;
        }

        Schema::create('wallet_topups', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id')->index();
            $table->decimal('amount', 10, 2);
            $table->string('status', 32)->default('pending');
            $table->string('payment_method', 32)->nullable();
            // The bank's order id. Unique so a callback can never match two
            // rows, and so a replayed callback lands on the same one.
            $table->string('transaction_ref')->nullable()->unique();
            $table->timestampTz('settled_at')->nullable();
            $table->timestampTz('created_at')->useCurrent();

            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wallet_topups');
    }
};
