<?php

namespace App\Models\Concerns;

use Illuminate\Support\Str;

/**
 * The Supabase schema uses uuid primary keys defaulted by gen_random_uuid().
 * Eloquent needs to be told they're non-incrementing strings, and we generate
 * one client-side when the row doesn't already have it.
 */
trait UsesUuidKey
{
    public function initializeUsesUuidKey(): void
    {
        $this->incrementing = false;
        $this->keyType = 'string';
    }

    protected static function bootUsesUuidKey(): void
    {
        static::creating(function ($model) {
            if (empty($model->{$model->getKeyName()})) {
                $model->{$model->getKeyName()} = (string) Str::uuid();
            }
        });
    }
}
