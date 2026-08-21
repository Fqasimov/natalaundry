<?php

namespace App\Services;

use RuntimeException;

/**
 * Raised when a courier loses the race to claim a broadcast order. Mapped to
 * HTTP 409 so the app can show its "Order already claimed" toast rather than
 * treating it as an unexpected failure.
 */
class OrderAlreadyClaimedException extends RuntimeException
{
}
