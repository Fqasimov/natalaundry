<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WalletTopup;
use App\Models\WalletTransaction;
use App\Services\KapitalException;
use App\Services\KapitalGateway;
use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class WalletController extends Controller
{
    public function __construct(
        private readonly WalletService $wallet,
        private readonly KapitalGateway $gateway,
    ) {}

    /** "Nata balansı" plus its ledger. */
    public function index(Request $request): JsonResponse
    {
        $profile = $request->attributes->get('profile');

        return response()->json([
            'balance' => $this->wallet->balance($profile->id),
            'currency' => config('nata.currency'),
            'transactions' => WalletTransaction::query()
                ->where('user_id', $profile->id)
                ->latest('created_at')
                ->limit(50)
                ->get()
                ->map(fn ($t) => [
                    'id' => $t->id,
                    'amount' => (float) $t->amount,
                    'kind' => $t->kind,
                    'note' => $t->note,
                    'order_id' => $t->order_id,
                    'created_at' => $t->created_at?->toIso8601String(),
                ]),
            'min_topup' => (float) config('nata.wallet.min_topup'),
            'max_topup' => (float) config('nata.wallet.max_topup'),
            'topup_presets' => array_map('floatval', config('nata.wallet.topup_presets')),
        ]);
    }

    /**
     * Starts a top-up and returns the bank page to send the customer to.
     *
     * The amount is proposed by the client and bounded here — that is the
     * whole job of the validation below. It is then written to the top-up row
     * *before* the customer goes anywhere, so what eventually gets credited is
     * a figure this server recorded, not one the bank echoes back or the app
     * re-sends afterwards.
     */
    public function topUp(Request $request): JsonResponse
    {
        $profile = $request->attributes->get('profile');

        $data = $request->validate([
            'amount' => [
                'required', 'numeric',
                'min:'.config('nata.wallet.min_topup'),
                'max:'.config('nata.wallet.max_topup'),
            ],
            'language' => ['nullable', 'string', 'in:az,ru,en'],
        ]);

        $amount = round((float) $data['amount'], 2);

        $topup = WalletTopup::create([
            'user_id' => $profile->id,
            'amount' => $amount,
            'status' => 'pending',
            'payment_method' => 'card',
            'created_at' => now(),
        ]);

        try {
            $bank = $this->gateway->createOrder(
                amount: $amount,
                reference: 'Nata balans '.substr((string) $topup->id, 0, 8),
                description: 'Nata Balance top-up',
                language: $data['language'] ?? 'az',
            );
        } catch (KapitalException $e) {
            $topup->forceFill(['status' => 'failed'])->save();
            Log::warning('Wallet top-up could not be started', [
                'topup_id' => $topup->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Top-up could not be started. Please try again.',
            ], 502);
        }

        $topup->forceFill(['transaction_ref' => $bank['id']])->save();

        $base = rtrim($bank['hppUrl'], '/');
        if (! str_ends_with($base, '/flex')) {
            $base .= '/flex';
        }

        return response()->json(['data' => [
            'topup_id' => (string) $topup->id,
            'amount' => $amount,
            'redirect_url' => $base.'?'.http_build_query([
                'id' => $bank['id'],
                'password' => $bank['password'],
            ]),
        ]]);
    }

    /**
     * What became of a top-up, re-read from the bank.
     *
     * Scoped to the caller's own rows: a top-up id is a uuid, but guessing one
     * must not reveal someone else's payment, and crediting is keyed off the
     * row rather than the requester, so an unscoped lookup here would let
     * anyone drive another customer's settlement.
     */
    public function topUpStatus(Request $request, string $topup): JsonResponse
    {
        $profile = $request->attributes->get('profile');

        $model = WalletTopup::query()
            ->where('id', $topup)
            ->where('user_id', $profile->id)
            ->firstOrFail();

        if ($model->settled_at === null && $model->transaction_ref !== null) {
            try {
                $bankOrder = $this->gateway->getOrder($model->transaction_ref);
                $mapped = config('kapital.status_map')[(string) ($bankOrder['status'] ?? '')] ?? 'pending';

                // The bank must have settled the amount we recorded. A
                // mismatch is never credited — it is flagged and held.
                $settled = $bankOrder['clearedChargeAmount'] ?? $bankOrder['amount'] ?? null;
                if ($mapped === 'paid' && $settled !== null
                    && abs((float) $settled - (float) $model->amount) > 0.001) {
                    Log::error('Top-up settled a different amount than requested', [
                        'topup_id' => $model->id,
                        'expected' => (float) $model->amount,
                        'settled' => (float) $settled,
                    ]);
                    $mapped = 'amount_mismatch';
                }

                $this->wallet->settleTopup($model, $mapped);
            } catch (KapitalException $e) {
                Log::warning('Top-up verification failed', [
                    'topup_id' => $model->id,
                    'error' => $e->getMessage(),
                ]);

                return response()->json(['data' => [
                    'status' => $model->status,
                    'settled' => false,
                    'stale' => true,
                    'balance' => $this->wallet->balance($profile->id),
                ]]);
            }
        }

        $fresh = $model->fresh();

        return response()->json(['data' => [
            'status' => $fresh->status,
            'settled' => $fresh->settled_at !== null,
            'amount' => (float) $fresh->amount,
            'balance' => $this->wallet->balance($profile->id),
        ]]);
    }
}
