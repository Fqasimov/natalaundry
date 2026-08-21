<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidKey;
use Illuminate\Database\Eloquent\Model;

/** Append-only record of every lifecycle transition on an order. */
class OrderStatusLog extends Model
{
    use UsesUuidKey;

    protected $table = 'order_status_logs';

    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected $casts = ['created_at' => 'datetime'];
}
