<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Makes the live `notifications` table match what the app actually reads.
 *
 * The inbox was rendering rows with no text in them. The write path is
 * correct — OrderLifecycleService sets `body` and a `payload.key` on every
 * transition — but this table predates the rebuild, and the only columns ever
 * recovered from the production dump were `id` and `user_id`
 * (SCHEMA_NOTES.md). Everything else the app reads is an assumption, and a
 * column that is not there comes back as undefined rather than as an error,
 * which is precisely how a row ends up displaying nothing.
 *
 * Every add is guarded, so this is a no-op on a database that already has
 * them and a repair on one that does not. It adds columns and never drops or
 * rewrites one, so it cannot lose an existing message.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('notifications')) {
            return;
        }

        Schema::table('notifications', function (Blueprint $table) {
            if (! Schema::hasColumn('notifications', 'title')) {
                $table->string('title')->nullable();
            }
            if (! Schema::hasColumn('notifications', 'body')) {
                $table->text('body')->nullable();
            }
            if (! Schema::hasColumn('notifications', 'read')) {
                $table->boolean('read')->default(false);
            }
            if (! Schema::hasColumn('notifications', 'payload')) {
                $table->jsonb('payload')->nullable();
            }
            if (! Schema::hasColumn('notifications', 'created_at')) {
                $table->timestampTz('created_at')->useCurrent();
            }
        });
    }

    /**
     * Deliberately empty.
     *
     * Rolling back would drop columns holding real customer messages. If this
     * migration added something unwanted, remove it by hand having looked at
     * what is in it.
     */
    public function down(): void
    {
        //
    }
};
