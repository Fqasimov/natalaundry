<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidKey;
use Illuminate\Database\Eloquent\Model;

/** public.payment_intents */
class PaymentIntent extends Model
{
    use UsesUuidKey;

    protected $table = 'payment_intents';

    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = [
        'created_at' => 'datetime',
        'settled_at' => 'datetime',
        'amount' => 'decimal:2',
    ];
}
