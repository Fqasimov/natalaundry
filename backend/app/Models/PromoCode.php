<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidKey;
use Illuminate\Database\Eloquent\Model;

/** Promo codes entered on the order summary ("Promo kod (məs: BAKU20)"). */
class PromoCode extends Model
{
    use UsesUuidKey;

    protected $table = 'promo_codes';

    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected $casts = [
        'value' => 'decimal:2',
        'min_subtotal' => 'decimal:2',
        'max_redemptions' => 'integer',
        'redemptions' => 'integer',
        'active' => 'boolean',
        'starts_at' => 'datetime',
        'expires_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    public function isRedeemable(float $subtotal): bool
    {
        if (! $this->active) {
            return false;
        }
        if ($this->starts_at && $this->starts_at->isFuture()) {
            return false;
        }
        if ($this->expires_at && $this->expires_at->isPast()) {
            return false;
        }
        if ($this->max_redemptions !== null && $this->redemptions >= $this->max_redemptions) {
            return false;
        }

        return $subtotal >= (float) $this->min_subtotal;
    }

    /** Discount in manat this code is worth against the given subtotal. */
    public function discountFor(float $subtotal): float
    {
        return match ($this->kind) {
            'percent' => round($subtotal * ((float) $this->value / 100), 2),
            'amount' => min((float) $this->value, $subtotal),
            default => 0.0,
        };
    }
}
