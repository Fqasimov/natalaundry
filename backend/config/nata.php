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

        /*
         * What each tier multiplies the PAYABLE TOTAL by (set 2026-09-04 by
         * the owner). Express is not a delivery surcharge: a ₼40 basket with
         * free delivery totals ₼40 as standard and ₼80 as express. The
         * multiplier applies after the discount and after the delivery fee.
         *
         * Two tiers went the same day. 'eco' priced identically to standard,
         * and the outside-city fee lost its slider, so nothing can set the
         * flag any more and it no longer enters the arithmetic. Orders that
         * already carry delivery_tier = 'eco' or is_outside_city = true are
         * untouched — this list only validates new ones.
         */
        'tier_multiplier' => [
            'standard' => 1,
            'express' => 2,
        ],

        'tiers' => ['standard', 'express'],
    ],

    /*
     * Garment photos are no longer required to place an order.
     *
     * The shipped 1.0.2 build demanded three. That gate is gone on both
     * sides: the app suggests three (lib/pricing.ts RECOMMENDED_PHOTOS) but
     * nothing blocks checkout, and this server-side minimum is 0 to match.
     * Set it above 0 to reinstate the gate — OrderService still enforces
     * whatever number is here, so the two cannot drift apart.
     */
    'required_photos' => (int) env('NATA_REQUIRED_PHOTOS', 0),

    /*
     * "Toplu" — the bulk / count-after-pickup order type.
     *
     * The customer never itemises anything. They pay a fixed deposit, a
     * courier collects within the pickup window, counts the load, and the
     * real order value is written to orders.counted_total. Those columns
     * (deposit_amount, counted_total, counted_at, counted_by) already exist
     * in the live schema.
     */
    'toplu' => [
        'service_type' => 'toplu',
        'deposit' => env('NATA_TOPLU_DEPOSIT', 20),
        'pickup_window_hours' => env('NATA_TOPLU_PICKUP_WINDOW_HOURS', 24),
    ],

    /*
     * Nata Balance — the in-app wallet.
     *
     * Top-ups run through the same Kapital hosted page as an order payment.
     * The bounds are server-side because they are the only thing standing
     * between the gateway and an arbitrary amount: the client proposes a
     * figure, this decides whether it is allowed.
     */
    'wallet' => [
        'min_topup' => env('NATA_WALLET_MIN_TOPUP', 5),
        'max_topup' => env('NATA_WALLET_MAX_TOPUP', 500),
        // What the top-up sheet offers as one-tap amounts.
        'topup_presets' => [10, 20, 50, 100],
    ],

    'rewards' => [
        'ttl_days' => 7,
        // Daily bronze box: one free open per calendar day.
        'daily_box_cooldown_hours' => 24,
    ],

    'order' => [
        'statuses' => ['pending', 'collecting', 'cleaning', 'delivering', 'completed', 'cancelled'],
        'dispatch_states' => ['awaiting_admin', 'approved', 'offered', 'assigned'],
    ],

    // The welcome offer. Applied automatically to a customer's first order —
    // it is advertised on the home screen rather than typed in, so nothing in
    // the app asks for it. Percentage lives here so the value is in one place
    // for both the quote and the order write.
    'promo' => [
        'first_order_enabled' => env('NATA_FIRST_ORDER_PROMO', true),
        'first_order_code' => env('NATA_FIRST_ORDER_CODE', 'ILK20'),
        'first_order_percent' => env('NATA_FIRST_ORDER_PERCENT', 20),
    ],

    // Live courier tracking. Deliberately a plain polling endpoint rather than
    // a paid fleet-tracking product: the courier posts a ping every few
    // seconds while en route and the customer polls the latest one.
    'tracking' => [
        'ping_seconds' => env('NATA_TRACKING_PING_SECONDS', 5),
        // Pings older than this are treated as stale by the customer view.
        'stale_after_seconds' => env('NATA_TRACKING_STALE_SECONDS', 60),
        'retain_hours' => env('NATA_TRACKING_RETAIN_HOURS', 24),
    ],
];
