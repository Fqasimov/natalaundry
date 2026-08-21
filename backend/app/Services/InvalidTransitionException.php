<?php

namespace App\Services;

use RuntimeException;

/** A lifecycle move that the state machine or the actor's role forbids. */
class InvalidTransitionException extends RuntimeException
{
}
