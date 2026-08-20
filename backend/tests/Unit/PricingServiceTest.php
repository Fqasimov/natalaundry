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

    public function test_tier_fees_match_the_cards_in_the_video(): void
    {
        // With a ₼37 basket the app shows: Standart +5.00, Ekspres +10.00,
        // Eko +5.00.
        $subtotal = 37.0;

        $this->assertSame(5.0, $this->pricing->deliveryFee($subtotal, 'standard'));
        $this->assertSame(10.0, $this->pricing->deliveryFee($subtotal, 'express'));
        $this->assertSame(5.0, $this->pricing->deliveryFee($subtotal, 'eco'));
    }

    public function test_express_still_costs_its_surcharge_above_the_threshold(): void
    {
        $this->assertSame(0.0, $this->pricing->deliveryFee(50, 'standard'));
        $this->assertSame(5.0, $this->pricing->deliveryFee(50, 'express'));
    }

    public function test_outside_city_adds_its_own_fee(): void
    {
        // "Şəhərdən kənar üçün 5 ₼ çatdırılma haqqı alınır."
        $this->assertSame(10.0, $this->pricing->deliveryFee(37, 'standard', true));
        $this->assertSame(5.0, $this->pricing->deliveryFee(50, 'standard', true));
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
