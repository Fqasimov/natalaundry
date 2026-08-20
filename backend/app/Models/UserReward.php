<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A prize a customer has won and may still spend. */
class UserReward extends Model
{
    use UsesUuidKey;

    protected $table = 'user_rewards';

    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = [
        'won_at' => 'datetime',
        'expires_at' => 'datetime',
        'used_at' => 'datetime',
    ];

    public function reward(): BelongsTo
    {
        return $this->belongsTo(Reward::class, 'reward_id');
    }

    public function scopeActive($query)
    {
        return $query->whereNull('used_at')->where('expires_at', '>', now());
    }

    public function isSpendable(): bool
    {
        return $this->used_at === null && $this->expires_at->isFuture();
    }
}
