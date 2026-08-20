<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** public.customer_details — Stripe linkage and loyalty points. */
class CustomerDetail extends Model
{
    protected $table = 'customer_details';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = ['id'];

    protected $casts = [
        'loyalty_points' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
