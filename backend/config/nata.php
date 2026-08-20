<?php

/**
 * Nata Laundry business rules.
 *
 * These constants mirror lib/pricing.ts in the mobile app. The app shows an
 * estimate; this server recomputes every figure at checkout and is the
 * authority. Keep the two in sync — the values were derived from the shipped
 * 1.0.2 build (₼37 subtotal + ₼5 delivery = ₼42 total, with a red notice
 * explaining the ₼5 applies because the basket is under ₼40).
 */
return [
    'currency' => '₼',

    'delivery' => [
        // Baskets at or above this get the base fee waived.
        'free_threshold' => env('NATA_FREE_DELIVERY_THRESHOLD', 40),
        'base_fee' => env('NATA_BASE_DELIVERY_FEE', 5),
        'outside_city_fee' => env('NATA_OUTSIDE_CITY_FEE', 5),

        // Surcharge added on top of the base fee, per tier.
        'tier_surcharge' => [
            'standard' => 0,
            'express' => 5,
            'eco' => 0,
        ],

        'tiers' => ['standard', 'express', 'eco'],
    ],

    // The order summary refuses to submit without this many garment photos.
    'required_photos' => 3,

    'rewards' => [
        'ttl_days' => 7,
        // Daily bronze box: one free open per calendar day.
        'daily_box_cooldown_hours' => 24,
    ],

    'order' => [
        'statuses' => ['pending', 'collecting', 'cleaning', 'delivering', 'completed', 'cancelled'],
        'dispatch_states' => ['awaiting_admin', 'approved', 'offered', 'assigned'],
    ],
];
