<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** public.order_items — one row per catalogue line on an order. */
class OrderItem extends Model
{
    use UsesUuidKey;

    protected $table = 'order_items';

    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = [
        'price' => 'decimal:2',
        'quantity' => 'integer',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }

    public function lineTotal(): float
    {
        return round((float) $this->price * $this->quantity, 2);
    }
}
