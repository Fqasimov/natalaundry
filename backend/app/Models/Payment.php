<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidKey;
use Illuminate\Database\Eloquent\Model;

/** public.payments */
class Payment extends Model
{
    use UsesUuidKey;

    protected $table = 'payments';

    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = [
        'created_at' => 'datetime',
        'amount' => 'decimal:2',
    ];
}
