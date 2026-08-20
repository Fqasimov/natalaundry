<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * public.service_prices — the catalogue.
 *
 * Only `service_id` and `item_id` are confirmed columns; the schema dump we
 * have was truncated before returning the rest (a price column must exist,
 * since an RLS policy reads "Anyone can read active prices"). `$guarded = []`
 * keeps this model usable whatever the remaining columns turn out to be —
 * tighten it once they're known.
 */
class ServicePrice extends Model
{
    protected $table = 'service_prices';

    public $timestamps = false;

    public $incrementing = false;

    protected $primaryKey = null;

    protected $guarded = [];

    public function scopeForService($query, string $serviceId)
    {
        return $query->where('service_id', $serviceId);
    }
}
