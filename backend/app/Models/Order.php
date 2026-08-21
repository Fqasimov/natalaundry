<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidKey;
use App\Support\OrderLifecycle;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * public.orders.
 *
 * Two independent state machines live on this row:
 *  - `status`         customer/courier facing: pending → collecting →
 *                     cleaning → delivering → completed (or cancelled)
 *  - `dispatch_state` internal admin workflow: awaiting_admin → approved →
 *                     offered → assigned
 *  - `lifecycle_state` the nine-step collection → laundry → delivery flow
 *                     (App\Support\OrderLifecycle). `status` is derived from
 *                     it on every transition, so the two never drift.
 */
class Order extends Model
{
    use UsesUuidKey;

    protected $table = 'orders';

    public const UPDATED_AT = null;

    protected $guarded = ['id', 'order_no'];

    protected $casts = [
        'subtotal' => 'decimal:2',
        'discount' => 'decimal:2',
        'delivery_fee' => 'decimal:2',
        'total' => 'decimal:2',
        'deposit_amount' => 'decimal:2',
        'counted_total' => 'decimal:2',
        'is_outside_city' => 'boolean',
        'item_photos' => 'array',
        'created_at' => 'datetime',
        'approved_at' => 'datetime',
        'offered_at' => 'datetime',
        'assigned_at' => 'datetime',
        'collected_at' => 'datetime',
        'cleaning_started_at' => 'datetime',
        'delivering_at' => 'datetime',
        'delivered_at' => 'datetime',
        'counted_at' => 'datetime',
        'processing_finished_at' => 'datetime',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class, 'order_id');
    }

    public function offers(): HasMany
    {
        return $this->hasMany(OrderOffer::class, 'order_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'order_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'user_id');
    }

    public function courier(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'courier_id');
    }

    public function scopeAwaitingCourier($query)
    {
        return $query->where('status', 'pending')->whereNull('courier_id');
    }

    public function statusLogs(): HasMany
    {
        return $this->hasMany(OrderStatusLog::class, 'order_id');
    }

    public function locations(): HasMany
    {
        return $this->hasMany(CourierLocation::class, 'order_id');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(CourierAssignment::class, 'order_id');
    }

    /**
     * Both axes must agree. For rows written through OrderLifecycleService the
     * two are always in sync, so this is exact; for older rows — and anything
     * that set `status` directly — the legacy column still has the final say,
     * so an order already being cleaned can't be cancelled just because
     * `lifecycle_state` was never backfilled.
     */
    public function isCancellable(): bool
    {
        return $this->status === 'pending'
            && OrderLifecycle::canTransition(
                $this->lifecycle_state ?? OrderLifecycle::ORDER_PLACED,
                OrderLifecycle::CANCELLED,
            );
    }

    /** True while the courier app should be streaming its position. */
    public function isTracking(): bool
    {
        return OrderLifecycle::isTracking($this->lifecycle_state);
    }

    /** Orders broadcast to couriers but not yet claimed. */
    public function scopeAwaitingClaim($query)
    {
        return $query
            ->where('lifecycle_state', OrderLifecycle::ASSIGNING_COURIERS)
            ->whereNull('courier_id');
    }
}
