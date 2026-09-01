<?php

namespace App\Services;

use App\Models\Profile;
use App\Models\WalletTopup;
use App\Models\WalletTransaction;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Wallet movements. `profiles.wallet_balance` is the authoritative balance
 * and `wallet_transactions` is its ledger — the two are only ever written
 * together, inside a transaction, with the profile row locked.
 */
class WalletService
{
    /**
     * @param  float  $amount  positive to credit, negative to debit
     */
    public function record(
        string $userId,
        float $amount,
        string $kind,
        ?string $note = null,
        ?string $orderId = null
    ): WalletTransaction {
        return DB::transaction(function () use ($userId, $amount, $kind, $note, $orderId) {
            /** @var Profile $profile */
            $profile = Profile::query()->lockForUpdate()->findOrFail($userId);

            $balance = round((float) $profile->wallet_balance + $amount, 2);
            if ($balance < 0) {
                throw new RuntimeException('Insufficient wallet balance.');
            }

            $profile->wallet_balance = $balance;
            $profile->save();

            return WalletTransaction::create([
                'user_id' => $userId,
                'amount' => round($amount, 2),
                'kind' => $kind,
                'note' => $note,
                'order_id' => $orderId,
            ]);
        });
    }

    public function credit(string $userId, float $amount, string $kind, ?string $note = null, ?string $orderId = null): WalletTransaction
    {
        return $this->record($userId, abs($amount), $kind, $note, $orderId);
    }

    public function debit(string $userId, float $amount, string $kind, ?string $note = null, ?string $orderId = null): WalletTransaction
    {
        return $this->record($userId, -abs($amount), $kind, $note, $orderId);
    }

    public function balance(string $userId): float
    {
        return (float) Profile::query()->whereKey($userId)->value('wallet_balance');
    }

    /**
     * Credits a top-up exactly once, whatever the bank says and however often
     * it is asked.
     *
     * This is called from three places that can all fire for the same
     * payment — the browser callback, the app polling after it regains focus,
     * and any later reconciliation — so the guard has to be in the database,
     * not in the caller. The row is locked and `settled_at` re-read inside the
     * transaction: the second caller blocks, then finds it already set and
     * credits nothing.
     *
     * The amount credited is the one stored on the top-up row when it was
     * created, never a figure from the request or from the bank's echo.
     */
    public function settleTopup(WalletTopup $topup, string $bankStatus): WalletTopup
    {
        return DB::transaction(function () use ($topup, $bankStatus) {
            /** @var WalletTopup $locked */
            $locked = WalletTopup::query()->lockForUpdate()->findOrFail($topup->id);

            // Already dealt with. Re-reading the bank is fine; paying twice is not.
            if ($locked->settled_at !== null) {
                return $locked;
            }

            $locked->status = $bankStatus;

            if ($bankStatus === 'paid') {
                $this->credit(
                    $locked->user_id,
                    (float) $locked->amount,
                    'top_up',
                    'Nata balans artırma',
                );
                $locked->settled_at = now();
            }

            $locked->save();

            $topup->setRawAttributes($locked->getAttributes(), true);

            return $locked;
        });
    }
}
