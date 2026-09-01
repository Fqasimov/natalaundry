<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.service_id' => ['required', 'string', 'max:64'],
            'items.*.item_id' => ['required', 'string', 'max:64'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:99'],

            'delivery_tier' => ['required', Rule::in(config('nata.delivery.tiers'))],
            'collection_time' => ['required', 'string', 'max:120'],
            'delivery_time' => ['required', 'string', 'max:120'],

            'address' => ['nullable', 'string', 'max:500'],
            'address_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'address_lng' => ['nullable', 'numeric', 'between:-180,180'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'is_outside_city' => ['boolean'],

            // Photos are optional. `nullable` rather than `required` so an
            // order with none is a valid request, not a 422; the minimum
            // still tracks config in case the gate is ever reinstated.
            'item_photos' => ['nullable', 'array', 'min:'.config('nata.required_photos'), 'max:20'],
            'item_photos.*' => ['string', 'max:2048'],

            'promo_code' => ['nullable', 'string', 'max:40'],
            'user_reward_id' => ['nullable', 'uuid'],
            'payment_method' => ['nullable', 'string', 'max:40'],
        ];
    }
}
