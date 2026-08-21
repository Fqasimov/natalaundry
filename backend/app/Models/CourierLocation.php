<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidKey;
use Illuminate\Database\Eloquent\Model;

/** A single GPS ping streamed by a courier while en route. */
class CourierLocation extends Model
{
    use UsesUuidKey;

    protected $table = 'courier_locations';

    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected $casts = [
        'lat' => 'float',
        'lng' => 'float',
        'heading' => 'float',
        'speed' => 'float',
        'accuracy' => 'float',
        'recorded_at' => 'datetime',
        'created_at' => 'datetime',
    ];
}
