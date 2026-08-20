<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * public.profiles — keyed by the Supabase auth user id.
 * Carries the wallet balance, loyalty points and locale directly.
 */
class Profile extends Model
{
    protected $table = 'profiles';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected $casts = [
        'points' => 'integer',
        'wallet_balance' => 'decimal:2',
        'is_subscribed' => 'boolean',
        'birthday' => 'date',
        'last_active_at' => 'datetime',
        'subscription_expires_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class, 'user_id');
    }

    public function walletTransactions(): HasMany
    {
        return $this->hasMany(WalletTransaction::class, 'user_id');
    }

    public function customerDetail(): HasOne
    {
        return $this->hasOne(CustomerDetail::class, 'id');
    }

    public function courierDetail(): HasOne
    {
        return $this->hasOne(CourierDetail::class, 'id');
    }

    public function isCourier(): bool
    {
        return $this->role === 'courier';
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    /** Nata Plus / VIP unlocks the legendary gift box. */
    public function hasActiveSubscription(): bool
    {
        return $this->is_subscribed
            && (! $this->subscription_expires_at || $this->subscription_expires_at->isFuture());
    }
}
