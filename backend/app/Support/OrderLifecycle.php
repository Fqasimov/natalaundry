<?php

namespace App\Support;

/**
 * The collection → laundry → delivery lifecycle.
 *
 * This is a *separate* axis from the legacy `orders.status` column. That
 * column only has six values and is baked into the live RLS policies and the
 * shipped app, so it can't be widened safely. `orders.lifecycle_state` carries
 * the nine-step flow instead, and every transition keeps `status` in sync via
 * self::LEGACY_STATUS so existing queries and policies keep working untouched.
 *
 * Notification copy is stored as a translation key plus vars rather than a
 * finished sentence: the app is Azerbaijani-first with RU/EN translations, so
 * rendering belongs on the client. `body` holds the AZ rendering as a fallback
 * for channels that can't translate (push payloads, e-mail).
 */
final class OrderLifecycle
{
    public const ORDER_PLACED = 'order_placed';
    public const ASSIGNING_COURIERS = 'assigning_couriers';
    public const COURIER_ASSIGNED = 'courier_assigned';
    public const COURIER_EN_ROUTE_PICKUP = 'courier_en_route_pickup';
    public const PICKED_UP = 'picked_up';
    public const AT_LAUNDRY = 'at_laundry';
    public const PROCESSING_FINISHED = 'processing_finished';
    public const COURIER_EN_ROUTE_DELIVERY = 'courier_en_route_delivery';
    public const DELIVERED = 'delivered';
    public const CANCELLED = 'cancelled';

    /** Ordered, so a UI stepper can render progress without its own list. */
    public const SEQUENCE = [
        self::ORDER_PLACED,
        self::ASSIGNING_COURIERS,
        self::COURIER_ASSIGNED,
        self::COURIER_EN_ROUTE_PICKUP,
        self::PICKED_UP,
        self::AT_LAUNDRY,
        self::PROCESSING_FINISHED,
        self::COURIER_EN_ROUTE_DELIVERY,
        self::DELIVERED,
    ];

    /**
     * Which state may follow which. Strictly sequential — no skipping — with
     * cancellation allowed only before a courier has physically collected.
     */
    public const TRANSITIONS = [
        self::ORDER_PLACED => [self::ASSIGNING_COURIERS, self::CANCELLED],
        self::ASSIGNING_COURIERS => [self::COURIER_ASSIGNED, self::CANCELLED],
        self::COURIER_ASSIGNED => [self::COURIER_EN_ROUTE_PICKUP, self::CANCELLED],
        self::COURIER_EN_ROUTE_PICKUP => [self::PICKED_UP, self::CANCELLED],
        self::PICKED_UP => [self::AT_LAUNDRY],
        self::AT_LAUNDRY => [self::PROCESSING_FINISHED],
        self::PROCESSING_FINISHED => [self::COURIER_EN_ROUTE_DELIVERY],
        self::COURIER_EN_ROUTE_DELIVERY => [self::DELIVERED],
        self::DELIVERED => [],
        self::CANCELLED => [],
    ];

    /** Who is allowed to drive each transition. */
    public const ACTORS = [
        self::ASSIGNING_COURIERS => ['admin'],
        self::COURIER_ASSIGNED => ['courier'],
        self::COURIER_EN_ROUTE_PICKUP => ['courier'],
        self::PICKED_UP => ['courier'],
        self::AT_LAUNDRY => ['admin', 'courier'],
        self::PROCESSING_FINISHED => ['admin'],
        self::COURIER_EN_ROUTE_DELIVERY => ['courier'],
        self::DELIVERED => ['courier'],
        self::CANCELLED => ['customer', 'admin'],
    ];

    /** Keeps the legacy six-value column truthful for existing consumers. */
    public const LEGACY_STATUS = [
        self::ORDER_PLACED => 'pending',
        self::ASSIGNING_COURIERS => 'pending',
        self::COURIER_ASSIGNED => 'pending',
        self::COURIER_EN_ROUTE_PICKUP => 'collecting',
        self::PICKED_UP => 'collecting',
        self::AT_LAUNDRY => 'cleaning',
        self::PROCESSING_FINISHED => 'cleaning',
        self::COURIER_EN_ROUTE_DELIVERY => 'delivering',
        self::DELIVERED => 'completed',
        self::CANCELLED => 'cancelled',
    ];

    /** Timestamp column stamped on entry, where the schema already has one. */
    public const TIMESTAMP_COLUMN = [
        self::ASSIGNING_COURIERS => 'offered_at',
        self::COURIER_ASSIGNED => 'assigned_at',
        self::PICKED_UP => 'collected_at',
        self::AT_LAUNDRY => 'cleaning_started_at',
        self::COURIER_EN_ROUTE_DELIVERY => 'delivering_at',
        self::DELIVERED => 'delivered_at',
    ];

    /** i18n key the app renders, and the AZ fallback for push/e-mail. */
    public const NOTIFICATION = [
        self::ORDER_PLACED => [
            'key' => 'notifyOrderPlaced',
            'az' => 'Sifarişiniz alındı! Admin təsdiqini gözləyir.',
        ],
        self::ASSIGNING_COURIERS => [
            'key' => 'notifyAssigningCouriers',
            'az' => 'Admin sifarişinizi təsdiqlədi və kuryer axtarır.',
        ],
        self::COURIER_ASSIGNED => [
            'key' => 'notifyCourierAssigned',
            'az' => 'Kuryer {courier} sifarişinizi qəbul etdi!',
        ],
        self::COURIER_EN_ROUTE_PICKUP => [
            'key' => 'notifyEnRoutePickup',
            'az' => 'Kuryer paltarlarınızı götürmək üçün yoldadır!',
        ],
        self::PICKED_UP => [
            'key' => 'notifyPickedUp',
            'az' => 'Paltarlar götürüldü və yuyucu mərkəzə aparılır.',
        ],
        self::AT_LAUNDRY => [
            'key' => 'notifyAtLaundry',
            'az' => 'Paltarlarınız təhlükəsiz şəkildə yuyucu mərkəzə çatdı.',
        ],
        self::PROCESSING_FINISHED => [
            'key' => 'notifyProcessingFinished',
            'az' => 'Paltarlarınız təmizdir və geri çatdırılmağa hazırdır!',
        ],
        self::COURIER_EN_ROUTE_DELIVERY => [
            'key' => 'notifyEnRouteDelivery',
            'az' => 'Kuryer təmiz paltarlarınızı çatdırmaq üçün yoldadır!',
        ],
        self::DELIVERED => [
            'key' => 'notifyDelivered',
            'az' => 'Sifariş çatdırıldı! Xidmətimizdən istifadə etdiyiniz üçün təşəkkürlər.',
        ],
        self::CANCELLED => [
            'key' => 'notifyCancelled',
            'az' => 'Sifarişiniz ləğv edildi.',
        ],
    ];

    /** States during which the courier app streams its position. */
    public const BROADCASTS_LOCATION = [
        self::COURIER_EN_ROUTE_PICKUP,
        self::COURIER_EN_ROUTE_DELIVERY,
    ];

    public static function canTransition(string $from, string $to): bool
    {
        return in_array($to, self::TRANSITIONS[$from] ?? [], true);
    }

    public static function actorMay(string $to, ?string $role): bool
    {
        return $role !== null && in_array($role, self::ACTORS[$to] ?? [], true);
    }

    public static function isTracking(?string $state): bool
    {
        return $state !== null && in_array($state, self::BROADCASTS_LOCATION, true);
    }

    /** Zero-based position in SEQUENCE, or null for terminal/cancelled. */
    public static function stepIndex(string $state): ?int
    {
        $i = array_search($state, self::SEQUENCE, true);

        return $i === false ? null : $i;
    }
}
