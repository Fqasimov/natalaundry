<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidKey;
use Illuminate\Database\Eloquent\Model;

/** Audit of every box opened; also enforces the daily-box cooldown. */
class GiftBoxOpening extends Model
{
    use UsesUuidKey;

    protected $table = 'gift_box_openings';

    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = ['opened_at' => 'datetime'];
}
