<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
|--------------------------------------------------------------------------
| Scheduled work
|--------------------------------------------------------------------------
|
| Requires one cron entry on the host, or none of this runs:
|
|   * * * * * cd /path/to/backend && php artisan schedule:run >> /dev/null 2>&1
|
*/

// GPS pings past the retention window. Hourly rather than daily so the table
// never accumulates a whole day's writes to delete in one pass — at twenty
// concurrent deliveries that is well over a hundred thousand rows.
//
// withoutOverlapping: a slow prune must not have a second copy start on top
// of it and fight for the same rows. onOneServer is harmless on a single host
// and correct the moment there are two.
Schedule::command('nata:prune-locations')
    ->hourly()
    ->withoutOverlapping()
    ->onOneServer()
    ->runInBackground();
