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

    /**
     * Microseconds, because "the latest fix" has to be decidable.
     *
     * Laravel's default is whole seconds. Pings arrive every few seconds, so
     * ties are routine, and on a tie the ORDER BY that feeds the customer's
     * map returns an arbitrary row — the marker jumps backwards. The column
     * was widened to timestamp(6) in the same change; without this format the
     * wider column would never see a fractional value.
     */
    protected $dateFormat = 'Y-m-d H:i:s.u';

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
