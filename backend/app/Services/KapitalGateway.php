<?php

namespace App\Services;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Thin HTTP client for the Kapital Bank e-commerce API.
 *
 * Deliberately dumb: it speaks the bank's wire format and nothing else. It
 * does not know what a Nata order is, does not touch the database and does
 * not decide whether anything is paid. That judgement lives in PaymentService,
 * so the "is this money real" logic sits in one place instead of being spread
 * across a transport class.
 *
 * Every method throws KapitalException on a non-2xx or malformed response, so
 * callers never have to inspect a status code to find out whether they got a
 * result.
 */
class KapitalGateway
{
    private function client(): PendingRequest
    {
        return Http::baseUrl(config('kapital.base_url'))
            ->withBasicAuth(config('kapital.username'), config('kapital.password'))
            ->acceptJson()
            ->asJson()
            ->timeout(config('kapital.timeout'))
            // One retry, 400ms apart, on connection failures only. Retrying a
            // create-order that actually succeeded would leave an orphaned
            // order at the bank, so 4xx/5xx responses are never retried.
            ->retry(2, 400, throw: false);
    }

    /**
     * Creates an order and returns the fields needed to send a customer to
     * the hosted payment page.
     *
     * @param  float  $amount     charged as-is; the caller is responsible for
     *                            having read it from our own orders row and
     *                            never from a client request body
     * @param  string $reference  shown on the bank statement / back office
     * @return array{id: string, password: string, hppUrl: string, status: string}
     */
    public function createOrder(
        float $amount,
        string $reference,
        string $description,
        string $language = 'az',
        ?string $redirectUrl = null,
    ): array {
        $payload = [
            'order' => [
                'typeRid' => config('kapital.order_type.purchase'),
                // The API is documented with amounts as strings ("1.00").
                'amount' => number_format($amount, 2, '.', ''),
                'currency' => config('kapital.currency'),
                'language' => $language,
                'title' => $reference,
                'description' => $description,
                'initiationEnvKind' => 'Browser',
                'hppRedirectUrl' => $redirectUrl ?? config('kapital.callback_url'),
            ],
        ];

        $order = $this->post('/order', $payload)['order'] ?? null;

        if (! is_array($order) || ! isset($order['id'], $order['password'], $order['hppUrl'])) {
            throw new KapitalException(
                'Kapital create-order returned no usable order (missing id/password/hppUrl).'
            );
        }

        return [
            'id' => (string) $order['id'],
            'password' => (string) $order['password'],
            'hppUrl' => (string) $order['hppUrl'],
            'status' => (string) ($order['status'] ?? 'Preparing'),
        ];
    }

    /**
     * The authoritative state of an order.
     *
     * This is what decides whether a customer actually paid — never the
     * STATUS parameter on the browser redirect.
     *
     * @return array<string, mixed> the bank's `order` object
     */
    public function getOrder(string $bankOrderId, bool $detailed = false): array
    {
        $query = $detailed
            ? '?tranDetailLevel=2&tokenDetailLevel=2&orderDetailLevel=2'
            : '';

        $response = $this->send('get', "/order/{$bankOrderId}{$query}");
        $order = $response['order'] ?? null;

        if (! is_array($order)) {
            throw new KapitalException("Kapital returned no order for id [{$bankOrderId}].");
        }

        return $order;
    }

    /**
     * Refunds a settled transaction, fully or partially.
     *
     * Same endpoint as any other transaction execution — the bank
     * distinguishes them by `type`.
     *
     * @param  float|null  $amount  null refunds the full order amount
     * @return array<string, mixed>
     */
    public function refund(string $bankOrderId, ?float $amount = null): array
    {
        $tran = ['phase' => 'Single', 'type' => 'Refund'];
        if ($amount !== null) {
            $tran['amount'] = number_format($amount, 2, '.', '');
        }

        return $this->post("/order/{$bankOrderId}/exec-tran", ['tran' => $tran]);
    }

    /**
     * Cancels a transaction on the same day it was made.
     *
     * Distinct from a refund: a reversal removes the authorisation outright,
     * a refund is a second transaction sending money back. Same-day
     * cancellation should reverse, so the customer never sees the charge.
     */
    public function reverse(string $bankOrderId, ?float $amount = null): array
    {
        $tran = [
            'phase' => 'Single',
            'voidKind' => $amount === null ? 'Full' : 'Partial',
        ];
        if ($amount !== null) {
            $tran['amount'] = number_format($amount, 2, '.', '');
        }

        return $this->post("/order/{$bankOrderId}/exec-tran", ['tran' => $tran]);
    }

    /** @return array<string, mixed> */
    private function post(string $path, array $payload): array
    {
        return $this->send('post', $path, $payload);
    }

    /** @return array<string, mixed> */
    private function send(string $method, string $path, array $payload = []): array
    {
        try {
            $response = $method === 'get'
                ? $this->client()->get($path)
                : $this->client()->post($path, $payload);
        } catch (\Throwable $e) {
            // Connection-level failure: no HTTP response at all.
            throw new KapitalException(
                "Could not reach the Kapital gateway: {$e->getMessage()}",
                previous: $e,
            );
        }

        $body = $response->json();

        if ($response->failed() || (is_array($body) && isset($body['errorCode']))) {
            $code = is_array($body) ? ($body['errorCode'] ?? 'HttpError') : 'HttpError';
            $detail = is_array($body)
                ? ($body['errorDescription'] ?? $response->body())
                : $response->body();

            // The response body can carry a masked PAN and 3-D Secure
            // material, so it is logged at the gateway boundary only, and
            // never returned to the app. Customers get a generic failure.
            Log::warning('Kapital gateway error', [
                'path' => $path,
                'http_status' => $response->status(),
                'error_code' => $code,
                'detail' => $detail,
            ]);

            throw new KapitalException(
                "Kapital gateway rejected the request [{$code}].",
                bankErrorCode: is_string($code) ? $code : null,
            );
        }

        return is_array($body) ? $body : [];
    }
}
