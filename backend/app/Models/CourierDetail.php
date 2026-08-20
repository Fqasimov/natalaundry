<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** public.courier_details — vehicle info and last known position. */
class CourierDetail extends Model
{
    protected $table = 'courier_details';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = ['id'];

    protected $casts = [
        'is_active' => 'boolean',
        'current_lat' => 'float',
        'current_lng' => 'float',
        'last_location_update' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
