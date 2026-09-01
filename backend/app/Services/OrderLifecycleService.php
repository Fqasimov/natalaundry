<?php

namespace App\Services;

use App\Models\CourierAssignment;
use App\Models\Notification;
use App\Models\Order;
use App\Models\OrderStatusLog;
use App\Models\Profile;
use App\Support\OrderLifecycle;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Drives orders through the nine-step collection → laundry → delivery flow.
 *
 * Every transition goes through transition(): it is the single place that
 * validates the move, keeps the legacy `status` column in sync, stamps the
 * matching *_at column, writes the audit log, and queues the customer
 * notification. Nothing else should write `lifecycle_state` directly.
 */
class OrderLifecycleService
{
    /**
     * Broadcast an order to a pool of couriers.
     *
     * @param  array<int, string>|null  $courierIds  null broadcasts to every
     *                                               available courier.
     */
    public function broadcast(Order $order, Profile $admin, ?array $courierIds = null): Order
    {
        $this->assertRole($admin, 'admin');

        $couriers = $courierIds
            ?? Profile::query()->where('role', 'courier')->pluck('id')->all();

        if ($couriers === []) {
            throw new RuntimeException('No couriers available to broadcast to.');
        }

        return DB::transaction(function () use ($order, $admin, $couriers) {
            $now = Carbon::now();

            foreach ($couriers as $courierId) {
                CourierAssignment::query()->updateOrCreate(
                    ['order_id' => $order->id, 'courier_id' => $courierId],
                    ['offered_at' => $now, 'created_at' => $now],
                );
            }

            $order->forceFill(['approved_at' => $order->approved_at ?? $now])->save();

            return $this->transition(
                $order,
                OrderLifecycle::ASSIGNING_COURIERS,
                $admin,
                'admin',
            );
        });
    }

    /**
     * First-to-claim wins.
     *
     * The row is re-read inside the transaction with a `SELECT ... FOR UPDATE`
     * so concurrent claims serialise on it: the loser blocks until the winner
     * commits, then sees courier_id already set and is rejected. Checking
     * before the lock would be a race — two couriers could both read null.
     */
    public function claim(Order $order, Profile $courier): Order
    {
        $this->assertRole($courier, 'courier');

        return DB::transaction(function () use ($order, $courier) {
            /** @var Order $locked */
            $locked = Order::query()->lockForUpdate()->findOrFail($order->id);

            if ($locked->courier_id !== null) {
                throw new OrderAlreadyClaimedException(
                    $locked->courier_id === $courier->id
                        ? 'You have already claimed this order.'
                        : 'Order already claimed.'
                );
            }

            if ($locked->lifecycle_state !== OrderLifecycle::ASSIGNING_COURIERS) {
                throw new OrderAlreadyClaimedException('Order is no longer available.');
            }

            // Honour the broadcast pool when one exists; an order offered to
            // named couriers must not be claimable by anyone else.
            $offered = CourierAssignment::query()->where('order_id', $locked->id);
            if ($offered->exists() && ! (clone $offered)->where('courier_id', $courier->id)->exists()) {
                throw new OrderAlreadyClaimedException('This order was not offered to you.');
            }

            $locked->forceFill(['courier_id' => $courier->id])->save();

            CourierAssignment::query()
                ->where('order_id', $locked->id)
                ->where('courier_id', $courier->id)
                ->update(['claimed_at' => Carbon::now()]);

            return $this->transition(
                $locked,
                OrderLifecycle::COURIER_ASSIGNED,
                $courier,
                'courier',
            );
        });
    }

    /**
     * Move an order to `$to`, enforcing the state machine and actor rules.
     *
     * The two kinds of refusal are thrown as different exceptions: a move the
     * state machine forbids is InvalidTransitionException (422), a move this
     * caller may never make is ForbiddenActorException (403).
     */
    public function transition(Order $order, string $to, ?Profile $actor, string $actorRole, ?string $note = null): Order
    {
        return DB::transaction(function () use ($order, $to, $actor, $actorRole, $note) {
            // Locked and re-read before anything is validated. The checks used
            // to run against the instance handed in, which was fetched before
            // the transaction opened — so two transitions submitted together
            // both validated against the same stale `from` state and both
            // applied, moving the order two steps and writing two audit rows
            // for a single real change.
            //
            // Re-locking a row this transaction already holds (claim() calls
            // in already holding it) is a no-op, so nesting is safe.
            /** @var Order $locked */
            $locked = Order::query()->lockForUpdate()->findOrFail($order->id);

            $from = $locked->lifecycle_state ?? OrderLifecycle::ORDER_PLACED;

            if (! OrderLifecycle::canTransition($from, $to)) {
                throw new InvalidTransitionException("Cannot move an order from {$from} to {$to}.");
            }

            if (! OrderLifecycle::actorMay($to, $actorRole)) {
                throw new ForbiddenActorException("A {$actorRole} may not move an order to {$to}.");
            }

            // Courier-driven steps belong to the assigned courier only.
            if ($actorRole === 'courier' && $to !== OrderLifecycle::COURIER_ASSIGNED) {
                if ($actor === null || $locked->courier_id !== $actor->id) {
                    throw new ForbiddenActorException('Only the assigned courier can update this order.');
                }
            }

            if ($actorRole === 'customer' && ($actor === null || $locked->user_id !== $actor->id)) {
                throw new ForbiddenActorException('Only the customer can cancel their own order.');
            }

            $now = Carbon::now();

            $changes = [
                'lifecycle_state' => $to,
                'status' => OrderLifecycle::LEGACY_STATUS[$to],
            ];

            if ($column = OrderLifecycle::TIMESTAMP_COLUMN[$to] ?? null) {
                $changes[$column] = $now;
            }
            if ($to === OrderLifecycle::PROCESSING_FINISHED) {
                $changes['processing_finished_at'] = $now;
            }

            $locked->forceFill($changes)->save();

            OrderStatusLog::query()->create([
                'order_id' => $locked->id,
                'from_state' => $from,
                'to_state' => $to,
                'actor_id' => $actor?->id,
                'actor_role' => $actorRole,
                'note' => $note,
                'created_at' => $now,
            ]);

            $this->notifyCustomer($locked, $to, $actor);

            // The caller holds the instance it passed in; keep it in step.
            $order->setRawAttributes($locked->getAttributes(), true);

            return $locked->refresh();
        });
    }

    /**
     * Queue the customer-facing message for a transition.
     *
     * Stored as an i18n key plus vars — the app renders it in the customer's
     * own language — with the Azerbaijani rendering kept as `body` so channels
     * that can't translate (push, e-mail) still have something to show.
     */
    protected function notifyCustomer(Order $order, string $state, ?Profile $actor): void
    {
        $template = OrderLifecycle::NOTIFICATION[$state] ?? null;
        if ($template === null) {
            return;
        }

        $vars = [];
        if ($state === OrderLifecycle::COURIER_ASSIGNED) {
            $vars['courier'] = $actor?->name ?? '';
        }

        $body = $template['az'];
        foreach ($vars as $key => $value) {
            $body = str_replace('{'.$key.'}', (string) $value, $body);
        }

        Notification::query()->create([
            'id' => (string) Str::uuid(),
            'user_id' => $order->user_id,
            'title' => 'Nata Laundry',
            'body' => $body,
            'read' => false,
            'payload' => [
                'key' => $template['key'],
                'vars' => $vars,
                'order_id' => $order->id,
                'lifecycle_state' => $state,
            ],
            'created_at' => Carbon::now(),
        ]);
    }

    protected function assertRole(Profile $profile, string $role): void
    {
        if ($profile->role !== $role) {
            throw new ForbiddenActorException("This action requires the {$role} role.");
        }
    }
}
