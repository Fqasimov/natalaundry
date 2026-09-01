<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidKey;
use Illuminate\Database\Eloquent\Model;

/** public.wallet_topups — money moving into Nata Balance. */
class WalletTopup extends Model
{
    use UsesUuidKey;

    protected $table = 'wallet_topups';

    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = [
        'amount' => 'decimal:2',
        'created_at' => 'datetime',
        'settled_at' => 'datetime',
    ];

    public function isSettled(): bool
    {
        return $this->settled_at !== null;
    }
}
