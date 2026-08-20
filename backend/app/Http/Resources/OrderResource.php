<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class OrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'order_no' => $this->order_no,
            'status' => $this->status,
            'dispatch_state' => $this->dispatch_state,
            'delivery_tier' => $this->delivery_tier,
            'service_type' => $this->service_type,
            'subtotal' => (float) $this->subtotal,
            'discount' => (float) $this->discount,
            'delivery_fee' => (float) $this->delivery_fee,
            'total' => (float) $this->total,
            'collection_time' => $this->collection_time,
            'delivery_time' => $this->delivery_time,
            'address' => $this->address,
            'notes' => $this->notes,
            'is_outside_city' => (bool) $this->is_outside_city,
            'item_photos' => $this->item_photos ?? [],
            'payment_status' => $this->payment_status,
            'created_at' => $this->created_at?->toIso8601String(),
            'timeline' => [
                'approved_at' => $this->approved_at?->toIso8601String(),
                'assigned_at' => $this->assigned_at?->toIso8601String(),
                'collected_at' => $this->collected_at?->toIso8601String(),
                'cleaning_started_at' => $this->cleaning_started_at?->toIso8601String(),
                'delivering_at' => $this->delivering_at?->toIso8601String(),
                'delivered_at' => $this->delivered_at?->toIso8601String(),
            ],
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($item) => [
                'id' => $item->id,
                'service_id' => $item->service_id,
                'item_id' => $item->item_id,
                'item_name' => $item->item_name,
                'price' => (float) $item->price,
                'quantity' => $item->quantity,
                'line_total' => $item->lineTotal(),
            ])),
        ];
    }
}
