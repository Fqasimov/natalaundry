<?php

namespace App\Services;

use RuntimeException;
use Throwable;

/**
 * The gateway refused, or could not be reached.
 *
 * The message is safe to log but not to show a customer: it can name a
 * decline reason the cardholder is not entitled to see from our side.
 * Controllers translate this into a generic failure.
 */
class KapitalException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly ?string $bankErrorCode = null,
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }
}
