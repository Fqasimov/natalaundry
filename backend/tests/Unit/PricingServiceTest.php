<?php

namespace Tests\Unit;

use App\Services\PricingService;
use Tests\TestCase;

/**
 * The expected numbers here come from the 1.0.2 screen recording, so this
 * suite is what proves the rebuilt pricing matches what customers already
 * see in the App Store build.
 */
class PricingServiceTest extends TestCase
{
    private PricingService $pricing;

    protected function setUp(): void
    {
        parent::setUp();
        $this->pricing = new PricingService;
    }

    public function test_it_reproduces_the_totals_shown_in_the_app(): void
    {
        // The video's order summary: Ara cəm ₼37.00, Çatdırılma haqqı ₼5.00,
        // Ümumi ₼42.00 — with Standart selected and the basket under ₼40.
        $lines = [
            ['price' => 9, 'quantity' => 3],  // Sviter  ₼27.00
            ['price' => 10, 'quantity' => 1], // Şalvar  ₼10.00
        ];

        $breakdown = $this->pricing->breakdown($lines, 'standard', false);

        $this->assertSame(37.0, $breakdown['subtotal']);
        $this->assertSame(5.0, $breakdown['delivery_fee']);
        $this->assertSame(42.0, $breakdown['total']);
        $this->assertFalse($breakdown['qualifies_for_free_delivery']);
        $this->assertSame(3.0, $breakdown['amount_to_free_delivery']);
    }

    public function test_delivery_is_free_at_or_above_the_threshold(): void
    {
        $atThreshold = $this->pricing->breakdown([['price' => 40, 'quantity' => 1]], 'standard');

        $this->assertSame(0.0, $atThreshold['delivery_fee']);
        $this->assertSame(40.0, $atThreshold['total']);
        $this->assertTrue($atThreshold['qualifies_for_free_delivery']);
        $this->assertSame(0.0, $atThreshold['amount_to_free_delivery']);
    }

    public function test_express_doubles_the_order_total(): void
    {
        // The owner's own example: a ₼40 basket earns free delivery and totals
        // ₼40 as standard. Choosing express doubles that to ₼80.
        $lines = [['price' => 40, 'quantity' => 1]];

        $standard = $this->pricing->breakdown($lines, 'standard');
        $express = $this->pricing->breakdown($lines, 'express');

        $this->assertSame(40.0, $standard['total']);
        $this->assertSame(80.0, $express['total']);
        $this->assertSame(40.0, $express['express_surcharge']);
    }

    public function test_express_leaves_the_delivery_fee_alone(): void
    {
        // Express is not a delivery surcharge — it is the same drive. The
        // delivery line stays honest and the multiple lands in the total.
        $lines = [['price' => 37, 'quantity' => 1]];

        $express = $this->pricing->breakdown($lines, 'express');

        $this->assertSame(5.0, $express['delivery_fee']);
        $this->assertSame(42.0, $express['express_surcharge']);
        $this->assertSame(84.0, $express['total']);
    }

    public function test_express_doubles_what_is_left_after_the_discount(): void
    {
        // Discount first, then double the remainder: ₼50 - ₼10 = ₼40 payable
        // (delivery free at this subtotal), doubled to ₼80. Doubling before
        // the discount would have charged ₼90.
        $breakdown = $this->pricing->breakdown(
            [['price' => 50, 'quantity' => 1]],
            'express',
            false,
            10.0,
        );

        $this->assertSame(80.0, $breakdown['total']);
    }

    public function test_standard_adds_no_surcharge(): void
    {
        $breakdown = $this->pricing->breakdown([['price' => 37, 'quantity' => 1]], 'standard');

        $this->assertSame(0.0, $breakdown['express_surcharge']);
        $this->assertSame(42.0, $breakdown['total']);
    }

    public function test_eco_is_no_longer_a_tier(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->pricing->deliveryFee(37, 'eco');
    }

    public function test_discount_never_exceeds_the_subtotal(): void
    {
        $breakdown = $this->pricing->breakdown(
            [['price' => 10, 'quantity' => 1]],
            'standard',
            false,
            999,
        );

        $this->assertSame(10.0, $breakdown['discount']);
        // Delivery is still owed on a fully-discounted basket.
        $this->assertSame(5.0, $breakdown['total']);
    }

    public function test_unknown_tier_is_rejected(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->pricing->deliveryFee(10, 'teleport');
    }
}
