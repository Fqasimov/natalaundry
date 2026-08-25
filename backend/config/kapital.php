<?php

/**
 * Kapital Bank e-commerce gateway.
 *
 * The integration is a hosted-payment-page (HPP) redirect flow:
 *
 *   1. POST /order            -> { id, password, hppUrl, status: "Preparing" }
 *   2. send the customer to   {hppUrl}/flex?id={id}&password={password}
 *   3. the bank redirects to  {hppRedirectUrl}?ID=..&STATUS=..
 *   4. GET /order/{id}        -> the authoritative status
 *
 * Step 4 is not optional. The bank's own documentation warns that the STATUS
 * carried on the step-3 redirect "can be temporary", and that query string is
 * attacker-supplied anyway — anyone can open the callback URL with
 * STATUS=FullyPaid. Nothing is ever marked paid from it; see PaymentService.
 */
return [

    /*
     * Test:       https://txpgtst.kapitalbank.az/api
     * Production: https://e-commerce.kapitalbank.az/api
     *
     * Left pointing at the test host by default so a misconfigured deploy
     * fails against the sandbox rather than charging a real card.
     */
    'base_url' => rtrim(env('KAPITAL_BASE_URL', 'https://txpgtst.kapitalbank.az/api'), '/'),

    /*
     * BasicAuth merchant credentials.
     *
     * The published sandbox pair (TerminalSys/kapital + kapital123) is the
     * default so `php artisan test` and a fresh checkout work out of the box.
     * Production credentials belong in the backend .env and nowhere else —
     * these are acquirer credentials that can move money, so unlike the
     * Supabase anon key they must never reach the app bundle or a client.
     */
    'username' => env('KAPITAL_USERNAME', 'TerminalSys/kapital'),
    'password' => env('KAPITAL_PASSWORD', 'kapital123'),

    'currency' => env('KAPITAL_CURRENCY', 'AZN'),

    // Seconds. The gateway is in the customer's checkout path, so a hung
    // connection has to fail fast enough to show them an error.
    'timeout' => (int) env('KAPITAL_TIMEOUT', 20),

    /*
     * Where the bank sends the browser once the customer is done. Must be a
     * public https URL on this API — not a deep link. The bank redirects a
     * web browser, and a natalaundry:// target would strand the customer on
     * an unresolvable page. The callback verifies, then bounces into the app.
     */
    'callback_url' => env('KAPITAL_CALLBACK_URL', env('APP_URL').'/api/payments/callback'),

    // Deep link back into the app after the callback has verified the result.
    'app_return_scheme' => env('KAPITAL_APP_RETURN_SCHEME', 'natalaundry'),

    /*
     * Wallet acceptance (Apple Pay / Google Pay).
     *
     * OFF by default, and deliberately so. Kapital Bank supports both wallets
     * as a card *issuer* — their cardholders can add a Kapital card to Apple
     * Pay — but that is a different thing from this *acquiring* API accepting
     * a wallet token from us. The documented order type reports
     * "paymentMethods": ["Card"], and the API exposes no endpoint that takes
     * a PKPaymentToken or a Google Pay payload, so a native wallet sheet has
     * nothing to submit to.
     *
     * What this flag does when enabled: shows the wallet buttons, which route
     * through the same HPP as a card. Whether a wallet button actually
     * appears on that page is a per-terminal setting on the bank's side.
     * Turn this on only after Kapital confirms wallet acceptance is live on
     * the merchant terminal — otherwise customers tap "Apple Pay" and get a
     * plain card form, which is worse than not offering it.
     */
    'wallets_enabled' => (bool) env('KAPITAL_WALLETS_ENABLED', false),

    /*
     * Order types, from the API documentation.
     *
     * Order_SMS is a single-message purchase: authorise and capture in one
     * step. That is the right shape here — the customer is charged when they
     * check out, not when the laundry is delivered.
     *
     * Order_DMS (preauthorise, capture later) would suit "toplu" better,
     * where the real total is unknown until a courier counts the load, but
     * toplu already settles through a fixed deposit plus a wallet refund and
     * changing that is a pricing decision, not a payments one.
     */
    'order_type' => [
        'purchase' => 'Order_SMS',
        'preauth' => 'Order_DMS',
    ],

    /*
     * Bank order status -> our orders.payment_status.
     *
     * Anything not listed is treated as still pending, which is the safe
     * default: an unknown status must never read as paid.
     */
    'status_map' => [
        'FullyPaid' => 'paid',
        'Refunded' => 'refunded',
        'PartiallyRefunded' => 'partially_refunded',
        'Declined' => 'failed',
        'Rejected' => 'failed',
        'Cancelled' => 'cancelled',
        'Expired' => 'expired',
        'Preparing' => 'pending',
        'Authorized' => 'authorized',
        'PartiallyPaid' => 'partially_paid',
        'Voided' => 'cancelled',
    ],
];
