<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidKey;
use Illuminate\Database\Eloquent\Model;

/** A prize definition that a gift box can yield. */
class Reward extends Model
{
    use UsesUuidKey;

    protected $table = 'rewards';

    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected $casts = [
        'value' => 'array',
        'weight' => 'integer',
        'active' => 'boolean',
        'created_at' => 'datetime',
    ];
}
