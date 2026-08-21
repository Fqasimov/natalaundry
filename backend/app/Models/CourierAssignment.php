<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidKey;
use Illuminate\Database\Eloquent\Model;

/** One row per courier an order was broadcast to; claimed_at marks the winner. */
class CourierAssignment extends Model
{
    use UsesUuidKey;

    protected $table = 'courier_assignments';

    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected $casts = [
        'offered_at' => 'datetime',
        'claimed_at' => 'datetime',
        'created_at' => 'datetime',
    ];
}
