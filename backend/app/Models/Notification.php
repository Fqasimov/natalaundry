<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidKey;
use Illuminate\Database\Eloquent\Model;

/** public.notifications */
class Notification extends Model
{
    use UsesUuidKey;

    protected $table = 'notifications';

    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = [
        'created_at' => 'datetime',
        'payload' => 'array',
        'read' => 'boolean',
    ];
}
