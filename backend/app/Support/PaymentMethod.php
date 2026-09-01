<?php

namespace App\Support;

/**
 * How an order gets paid for.
 *
 * Mirrored by lib/payments.ts in the app — keep the two in sync, the strings
 * are what land in orders.payment_method.
 */
final class PaymentMethod
{
    /** Card via the Kapital Bank hosted payment page. */
    public const CARD = 'card';

    /** Cash handed to the courier on delivery. Settles outside the gateway. */
    public const CASH = 'cash';

    /** Wallets. Routed through the same HPP; see config/kapital.php. */
    public const APPLE_PAY = 'apple_pay';
    public const GOOGLE_PAY = 'google_pay';

    /** Nata Balance — the customer's own wallet, settled instantly in-house. */
    public const BALANCE = 'balance';

    /** The fixed up-front deposit on a "toplu" bulk order. */
    public const DEPOSIT = 'deposit';

    /** Everything a customer may choose at checkout. */
    public const CHECKOUT_METHODS = [
        self::CARD,
        self::BALANCE,
        self::CASH,
        self::APPLE_PAY,
        self::GOOGLE_PAY,
    ];

    /** Methods that go through the gateway rather than being collected by hand. */
    public const GATEWAY_METHODS = [
        self::CARD,
        self::APPLE_PAY,
        self::GOOGLE_PAY,
    ];

    public static function isGateway(?string $method): bool
    {
        return in_array($method, self::GATEWAY_METHODS, true);
    }

    public static function isWallet(?string $method): bool
    {
        return in_array($method, [self::APPLE_PAY, self::GOOGLE_PAY], true);
    }

    /** Settled against the customer's Nata Balance, never the gateway. */
    public static function isBalance(?string $method): bool
    {
        return $method === self::BALANCE;
    }

    /**
     * What a customer is allowed to pick right now.
     *
     * Wallets drop out unless the terminal is confirmed to accept them —
     * offering a button that lands on a plain card form is worse than not
     * offering it at all.
     */
    public static function available(): array
    {
        return array_values(array_filter(
            self::CHECKOUT_METHODS,
            fn (string $m) => ! self::isWallet($m) || config('kapital.wallets_enabled'),
        ));
    }
}
