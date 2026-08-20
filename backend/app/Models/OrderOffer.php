<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidKey;
use Illuminate\Database\Eloquent\Model;

/** public.order_offers */
class OrderOffer extends Model
{
    use UsesUuidKey;

    protected $table = 'order_offers';

    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = [
        'offered_at' => 'datetime',
        'responded_at' => 'datetime',
    ];
}
