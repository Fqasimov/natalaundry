<?php

namespace Database\Seeders;

use App\Models\Reward;
use App\Services\GiftBoxService;
use Illuminate\Database\Seeder;

/**
 * The prize pool, transcribed from the 1.0.2 recording's reward list and the
 * two prizes its box-opening animation reveals.
 *
 * `weight` is a relative draw chance within a tier — the cheap prizes are
 * weighted heavily, the VIP package rarely. Tune these to taste; they are not
 * recoverable from the video.
 */
class RewardSeeder extends Seeder
{
    public function run(): void
    {
        $rewards = [
            // Daily bronze: small, high-frequency prizes.
            ['balance_bonus', '4 AZN Balans Bonusu', 'Sifariş cəminizdən avtomatik çıxılır', ['amount' => 4], 30, GiftBoxService::TIER_DAILY],
            ['eco_points', '100 Eko Xal Hədiyyə', '100 yaşıl xal balansınıza yükləndi', ['points' => 100], 40, GiftBoxService::TIER_DAILY],
            ['discount_coupon', '20% Endirim Kuponu', 'Quru təmizləmə xidmətinə 20% xüsusi endirim', ['percent' => 20, 'service_id' => 'dry_cleaning'], 20, GiftBoxService::TIER_DAILY],
            ['eco_care_package', 'Ekstra Eko-Baxış Paketi', 'Antibakterial zərif baxış xidməti hədiyyə olunur', [], 10, GiftBoxService::TIER_DAILY],

            // Gold: granted after an order completes.
            ['free_express_delivery', 'Pulsuz Ekspress Çatdırılma', 'Növbəti sifarişinizdə çatdırılma haqqı 0 ₼-dir', [], 30, GiftBoxService::TIER_GOLD],
            ['discount_coupon', '20% Endirim Kuponu', 'Quru təmizləmə xidmətinə 20% xüsusi endirim', ['percent' => 20, 'service_id' => 'dry_cleaning'], 25, GiftBoxService::TIER_GOLD],
            ['balance_bonus', '4 AZN Balans Bonusu', 'Sifariş cəminizdən avtomatik çıxılır', ['amount' => 4], 25, GiftBoxService::TIER_GOLD],
            ['free_service', 'Pulsuz Köynək Ütüləmə', '1 ədəd köynək tamamilə ödənişsiz ütülənir', ['service_id' => 'ironing', 'item_id' => 'shirt_long'], 15, GiftBoxService::TIER_GOLD],
            ['eco_care_package', 'Ekstra Eko-Baxış Paketi', 'Antibakterial zərif baxış xidməti hədiyyə olunur', [], 5, GiftBoxService::TIER_GOLD],

            // Legendary VIP: the high-value pool.
            ['free_service', 'Pulsuz Kostyum Təmizləmə', '1 ədəd 2-li kostyum tam ödənişsiz quru təmizlənir', ['service_id' => 'dry_cleaning', 'item_id' => 'suit_2pc'], 35, GiftBoxService::TIER_VIP],
            ['vip_care_package', 'VIP Qulluq Hədiyyə Paketi', 'Paltarlarınız üçün xüsusi qoruyucu qulluq', [], 30, GiftBoxService::TIER_VIP],
            ['discount_coupon', '30% Endirim Kuponu', 'Bütün xidmətlərə 30% endirim', ['percent' => 30], 20, GiftBoxService::TIER_VIP],
            ['balance_bonus', '10 AZN Balans Bonusu', 'Sifariş cəminizdən avtomatik çıxılır', ['amount' => 10], 15, GiftBoxService::TIER_VIP],
        ];

        foreach ($rewards as [$kind, $title, $description, $value, $weight, $tier]) {
            Reward::query()->updateOrCreate(
                ['kind' => $kind, 'title' => $title, 'box_tier' => $tier],
                [
                    'description' => $description,
                    'value' => $value,
                    'weight' => $weight,
                    'active' => true,
                ],
            );
        }
    }
}
