<?php

namespace App\Services;

/**
 * The caller may never perform this move, whatever state the order is in.
 *
 * Split out from InvalidTransitionException so the two failures a client
 * genuinely has to tell apart do not arrive as the same status code:
 *
 *   - "a customer may not broadcast to couriers"  -> never, for this caller
 *   - "cannot go from picked_up to cancelled"     -> not from this state
 *
 * The first is 403 and the screen should hide the control; the second is 422
 * and the screen should re-read the order, because someone else has already
 * moved it. Folded together, a client could only guess which it was.
 *
 * It extends InvalidTransitionException rather than standing alone so that
 * every existing `catch (InvalidTransitionException)` keeps working. Callers
 * that want the distinction catch this one first — see
 * OrderLifecycleController::guard(), where the order of the catch blocks is
 * what produces the two codes.
 */
class ForbiddenActorException extends InvalidTransitionException
{
}
