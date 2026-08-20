<?php

namespace App\Services;

use App\Models\Profile;
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
}
