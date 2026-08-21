<?php

return [

    /*
     * Supabase. The mobile app keeps using Supabase Auth; this API verifies
     * the access tokens it issues, and Eloquent talks to the same Postgres
     * database (see config/database.php -> pgsql).
     */
    'supabase' => [
        'url' => env('SUPABASE_URL'),
        'jwt_secret' => env('SUPABASE_JWT_SECRET'),
        'service_role_key' => env('SUPABASE_SERVICE_ROLE_KEY'),
        // Safe to hand to a browser — it is the publishable key, and RLS is
        // what protects the data. The admin console signs in with it so staff
        // use their normal Supabase credentials rather than a second store.
        'anon_key' => env('SUPABASE_ANON_KEY'),
    ],


    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],


    // Geocoding only — restricted to the Maps JavaScript API and Geocoding API
    // in the Cloud Console. Live courier tracking deliberately does not use a
    // Google product; see App\Http\Controllers\Api\TrackingController.
    'google_maps' => [
        'key' => env('GOOGLE_MAPS_API_KEY'),
    ],

];
