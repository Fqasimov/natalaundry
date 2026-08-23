<?php

namespace Database\Seeders;

use App\Models\Reward;
use App\Services\GiftBoxService;
use Illuminate\Database\Seeder;

/**
 * The prize pool: fifty prizes in one box.
 *
 * There is a single tier now — the box a finalised order earns — so every row
 * here belongs to it. The old three-tier split (daily / gold / VIP) is gone.
 *
 * `value` is the part that matters: the app renders a prize from its `kind`
 * plus these numbers, so the fifty titles below never have to be translated
 * fifty times over. They are kept as the Azerbaijani source text, and as what
 * the admin console shows.
 *
 * `weight` is a relative draw chance. Small prizes are weighted heavily and
 * the pool tapers steeply — a 1 AZN bonus comes up roughly one opening in
 * eighteen, a 30 AZN one about once in five hundred.
 */
class RewardSeeder extends Seeder
{
    public function run(): void
    {
        $prizes = [
            ['balance_bonus', '1 AZN Balans Bonusu', 'Sifariş cəminizdən avtomatik çıxılır', ['amount' => 1], 90],
            ['balance_bonus', '2 AZN Balans Bonusu', 'Sifariş cəminizdən avtomatik çıxılır', ['amount' => 2], 80],
            ['balance_bonus', '3 AZN Balans Bonusu', 'Sifariş cəminizdən avtomatik çıxılır', ['amount' => 3], 70],
            ['balance_bonus', '4 AZN Balans Bonusu', 'Sifariş cəminizdən avtomatik çıxılır', ['amount' => 4], 65],
            ['balance_bonus', '5 AZN Balans Bonusu', 'Sifariş cəminizdən avtomatik çıxılır', ['amount' => 5], 55],
            ['balance_bonus', '7 AZN Balans Bonusu', 'Sifariş cəminizdən avtomatik çıxılır', ['amount' => 7], 40],
            ['balance_bonus', '10 AZN Balans Bonusu', 'Sifariş cəminizdən avtomatik çıxılır', ['amount' => 10], 28],
            ['balance_bonus', '15 AZN Balans Bonusu', 'Sifariş cəminizdən avtomatik çıxılır', ['amount' => 15], 16],
            ['balance_bonus', '20 AZN Balans Bonusu', 'Sifariş cəminizdən avtomatik çıxılır', ['amount' => 20], 9],
            ['balance_bonus', '25 AZN Balans Bonusu', 'Sifariş cəminizdən avtomatik çıxılır', ['amount' => 25], 5],
            ['balance_bonus', '30 AZN Balans Bonusu', 'Sifariş cəminizdən avtomatik çıxılır', ['amount' => 30], 3],
            ['eco_points', '25 Eko Xal', 'Yaşıl xal balansınıza yükləndi', ['points' => 25], 85],
            ['eco_points', '50 Eko Xal', 'Yaşıl xal balansınıza yükləndi', ['points' => 50], 75],
            ['eco_points', '100 Eko Xal', 'Yaşıl xal balansınıza yükləndi', ['points' => 100], 60],
            ['eco_points', '150 Eko Xal', 'Yaşıl xal balansınıza yükləndi', ['points' => 150], 45],
            ['eco_points', '200 Eko Xal', 'Yaşıl xal balansınıza yükləndi', ['points' => 200], 30],
            ['eco_points', '300 Eko Xal', 'Yaşıl xal balansınıza yükləndi', ['points' => 300], 18],
            ['eco_points', '500 Eko Xal', 'Yaşıl xal balansınıza yükləndi', ['points' => 500], 9],
            ['eco_points', '750 Eko Xal', 'Yaşıl xal balansınıza yükləndi', ['points' => 750], 4],
            ['eco_points', '1000 Eko Xal', 'Yaşıl xal balansınıza yükləndi', ['points' => 1000], 2],
            ['discount_coupon', '5% Endirim Kuponu', 'Bütün xidmətlərə endirim', ['percent' => 5], 90],
            ['discount_coupon', '10% Endirim Kuponu', 'Bütün xidmətlərə endirim', ['percent' => 10], 70],
            ['discount_coupon', '15% Endirim Kuponu', 'Bütün xidmətlərə endirim', ['percent' => 15], 50],
            ['discount_coupon', '20% Endirim Kuponu', 'Bütün xidmətlərə endirim', ['percent' => 20], 35],
            ['discount_coupon', '25% Endirim Kuponu', 'Bütün xidmətlərə endirim', ['percent' => 25], 22],
            ['discount_coupon', '30% Endirim Kuponu', 'Bütün xidmətlərə endirim', ['percent' => 30], 12],
            ['discount_coupon', '40% Endirim Kuponu', 'Bütün xidmətlərə endirim', ['percent' => 40], 5],
            ['discount_coupon', '50% Endirim Kuponu', 'Bütün xidmətlərə endirim', ['percent' => 50], 2],
            ['discount_coupon', '20% Endirim — Quru Təmizləmə', 'Quru Təmizləmə xidmətinə endirim', ['percent' => 20, 'service_id' => 'dry_cleaning'], 30],
            ['discount_coupon', '25% Endirim — Ütüləmə', 'Ütüləmə xidmətinə endirim', ['percent' => 25, 'service_id' => 'ironing'], 30],
            ['discount_coupon', '30% Endirim — Ayaqqabı Təmizləmə', 'Ayaqqabı Təmizləmə xidmətinə endirim', ['percent' => 30, 'service_id' => 'shoes'], 20],
            ['discount_coupon', '20% Endirim — Ev Tekstili', 'Ev Tekstili xidmətinə endirim', ['percent' => 20, 'service_id' => 'bedding'], 20],
            ['discount_coupon', '25% Endirim — Aksesuarlar', 'Aksesuarlar xidmətinə endirim', ['percent' => 25, 'service_id' => 'bags'], 15],
            ['free_service', 'Pulsuz T-Shirt Ütüləmə', '1 ədəd T-Shirt tam ödənişsiz', ['service_id' => 'ironing', 'item_id' => 'tshirt'], 60],
            ['free_service', 'Pulsuz Köynək – Uzunqol Ütüləmə', '1 ədəd Köynək – Uzunqol tam ödənişsiz', ['service_id' => 'ironing', 'item_id' => 'shirt_long'], 50],
            ['free_service', 'Pulsuz T-Shirt Təmizləmə', '1 ədəd T-Shirt tam ödənişsiz', ['service_id' => 'dry_cleaning', 'item_id' => 'tshirt'], 45],
            ['free_service', 'Pulsuz Sviter Təmizləmə', '1 ədəd Sviter tam ödənişsiz', ['service_id' => 'dry_cleaning', 'item_id' => 'sweater'], 35],
            ['free_service', 'Pulsuz Şalvar Təmizləmə', '1 ədəd Şalvar tam ödənişsiz', ['service_id' => 'dry_cleaning', 'item_id' => 'trousers'], 32],
            ['free_service', 'Pulsuz Pencək Təmizləmə', '1 ədəd Pencək tam ödənişsiz', ['service_id' => 'dry_cleaning', 'item_id' => 'jacket'], 22],
            ['free_service', 'Pulsuz Sadə don Təmizləmə', '1 ədəd Sadə don tam ödənişsiz', ['service_id' => 'dry_cleaning', 'item_id' => 'dress_simple'], 18],
            ['free_service', 'Pulsuz Palto Təmizləmə', '1 ədəd Palto tam ödənişsiz', ['service_id' => 'dry_cleaning', 'item_id' => 'coat'], 10],
            ['free_service', 'Pulsuz Kostyum (2 hissəli) Təmizləmə', '1 ədəd Kostyum (2 hissəli) tam ödənişsiz', ['service_id' => 'dry_cleaning', 'item_id' => 'suit_2pc'], 7],
            ['free_service', 'Pulsuz Yastıq Yuma', '1 ədəd Yastıq tam ödənişsiz', ['service_id' => 'bedding', 'item_id' => 'pillow'], 26],
            ['free_service', 'Pulsuz Yorğan Yuma', '1 ədəd Yorğan tam ödənişsiz', ['service_id' => 'bedding', 'item_id' => 'duvet'], 12],
            ['free_service', 'Pulsuz Dəsmal Yuma', '1 ədəd Dəsmal tam ödənişsiz', ['service_id' => 'bedding', 'item_id' => 'towel'], 34],
            ['free_service', 'Pulsuz Çəkmə Təmizləmə', '1 ədəd Çəkmə tam ödənişsiz', ['service_id' => 'shoes', 'item_id' => 'boot'], 12],
            ['free_service', 'Pulsuz Orta çanta Təmizləmə', '1 ədəd Orta çanta tam ödənişsiz', ['service_id' => 'bags', 'item_id' => 'bag_medium'], 15],
            ['free_express_delivery', 'Pulsuz Ekspress Çatdırılma', 'Növbəti sifarişinizdə çatdırılma haqqı 0 ₼-dir', [], 25],
            ['eco_care_package', 'Ekstra Eko-Baxış Paketi', 'Antibakterial zərif baxış xidməti hədiyyə olunur', [], 12],
            ['vip_care_package', 'VIP Qulluq Hədiyyə Paketi', 'Paltarlarınız üçün xüsusi qoruyucu qulluq', [], 4],
        ];

        foreach ($prizes as [$kind, $title, $description, $value, $weight]) {
            Reward::query()->updateOrCreate(
                ['kind' => $kind, 'title' => $title, 'box_tier' => GiftBoxService::TIER_ORDER],
                [
                    'description' => $description,
                    'value' => $value,
                    'weight' => $weight,
                    'active' => true,
                ],
            );
        }

        // Anything seeded under the retired tiers stops being drawable.
        Reward::query()
            ->where('box_tier', '!=', GiftBoxService::TIER_ORDER)
            ->update(['active' => false]);
    }
}
