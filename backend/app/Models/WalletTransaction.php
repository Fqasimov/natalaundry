<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidKey;
use Illuminate\Database\Eloquent\Model;

/** public.wallet_transactions */
class WalletTransaction extends Model
{
    use UsesUuidKey;

    protected $table = 'wallet_transactions';

    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = [
        'created_at' => 'datetime',
        'amount' => 'decimal:2',
    ];
}
