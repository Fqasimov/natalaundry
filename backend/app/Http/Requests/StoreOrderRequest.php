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
            'items' => ['required', 'array', 'min:1'],
            'items.*.service_id' => ['required', 'string'],
            'items.*.item_id' => ['required', 'string'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:99'],

            'delivery_tier' => ['required', Rule::in(config('nata.delivery.tiers'))],
            'collection_time' => ['required', 'string', 'max:120'],
            'delivery_time' => ['required', 'string', 'max:120'],

            'address' => ['nullable', 'string', 'max:500'],
            'address_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'address_lng' => ['nullable', 'numeric', 'between:-180,180'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'is_outside_city' => ['boolean'],

            // The app requires three garment photos before it will submit.
            'item_photos' => ['required', 'array', 'min:'.config('nata.required_photos')],
            'item_photos.*' => ['string', 'max:2048'],

            'promo_code' => ['nullable', 'string', 'max:40'],
            'user_reward_id' => ['nullable', 'uuid'],
            'payment_method' => ['nullable', 'string', 'max:40'],
        ];
    }
}
