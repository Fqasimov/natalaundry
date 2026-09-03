<?php

/**
 * Fallback catalogue, mirroring lib/catalog.ts in the app.
 *
 * Both are now generated from `public.service_prices`, which is the
 * authority: `enforce_item_price` looks each line up by `item_id` and
 * refuses anything it does not recognise. An earlier version of this file used
 * invented ids (`tshirt`, `suit_2pc`) that existed in neither the database
 * nor a real order, and every checkout failed on its line items because of it.
 *
 * Keys are the app's service keys; the ids inside are the database's.
 * Regenerate with scripts/migration/gen-catalog-php.js — do not hand-edit.
 */
return [
    'dry_cleaning' => [
        'dc-shirt-1' => ['name' => 'T-Shirt', 'price' => 7],
        'dc-shirt-2' => ['name' => 'Köynək – Qısaqol', 'price' => 7],
        'dc-shirt-3' => ['name' => 'Köynək – Uzunqol', 'price' => 8],
        'dc-shirt-4' => ['name' => 'Sviter', 'price' => 9],
        'dc-suit-1' => ['name' => 'Pencək', 'price' => 12],
        'dc-suit-2' => ['name' => 'Jilet', 'price' => 7],
        'dc-suit-3' => ['name' => 'Kostyum (2 hissəli)', 'price' => 20],
        'dc-suit-4' => ['name' => 'Kostyum (3 hissəli)', 'price' => 25],
        'dc-bot-1' => ['name' => 'Şalvar', 'price' => 10],
        'dc-bot-2' => ['name' => 'Şort', 'price' => 6],
        'dc-bot-3' => ['name' => 'Ətək', 'price' => 10],
        'dc-dress-1' => ['name' => 'Don', 'price' => 20],
        'dc-dress-2' => ['name' => 'Gecə donu', 'price' => 30],
        'dc-outer-1' => ['name' => 'Gödəkçə – Qısa', 'price' => 20],
        'dc-outer-2' => ['name' => 'Gödəkçə – Uzun', 'price' => 25],
        'dc-outer-3' => ['name' => 'Dəri gödəkçə', 'price' => 60],
        'dc-outer-4' => ['name' => 'Palto', 'price' => 25],
        'dc-outer-5' => ['name' => 'Plaş', 'price' => 25],
        'dc-outer-6' => ['name' => 'Dublyonka', 'price' => 60],
        'dc-outer-7' => ['name' => 'Xəz palto – Qısa', 'price' => 55],
        'dc-outer-8' => ['name' => 'Xəz palto – Uzun', 'price' => 100],
        'dc-ev-1' => ['name' => 'Corab', 'price' => 2],
        'dc-ev-2' => ['name' => 'Alt paltarı', 'price' => 4],
        'dc-ev-3' => ['name' => 'İdman kostyumu', 'price' => 20],
        'dc-ev-4' => ['name' => 'Pijama', 'price' => 10],
    ],
    'ironing' => [
        'ir-shirt-1' => ['name' => 'T-Shirt', 'price' => 4],
        'ir-shirt-2' => ['name' => 'Köynək – Qısaqol', 'price' => 4],
        'ir-shirt-3' => ['name' => 'Köynək – Uzunqol', 'price' => 4],
        'ir-shirt-4' => ['name' => 'Sviter', 'price' => 4],
        'ir-suit-1' => ['name' => 'Pencək', 'price' => 6],
        'ir-suit-2' => ['name' => 'Jilet', 'price' => 4],
        'ir-suit-3' => ['name' => 'Kostyum (2 hissəli)', 'price' => 8],
        'ir-suit-4' => ['name' => 'Kostyum (3 hissəli)', 'price' => 10],
        'ir-bot-1' => ['name' => 'Şalvar', 'price' => 4],
        'ir-bot-2' => ['name' => 'Şort', 'price' => 4],
        'ir-bot-3' => ['name' => 'Ətək', 'price' => 4],
        'ir-dress-1' => ['name' => 'Don', 'price' => 6],
        'ir-dress-2' => ['name' => 'Gecə donu', 'price' => 10],
        'ir-outer-1' => ['name' => 'Palto', 'price' => 10],
        'ir-outer-2' => ['name' => 'Plaş', 'price' => 7],
        'ir-ev-1' => ['name' => 'Pijama', 'price' => 4],
    ],
    'shoes' => [
        'sh-1' => ['name' => 'Sadə parça ayaqqabı', 'price' => 25],
        'sh-2' => ['name' => 'Qismən dəri ayaqqabı', 'price' => 30],
        'sh-3' => ['name' => 'Tam dəri ayaqqabı', 'price' => 35],
        'sh-4' => ['name' => 'Qismən nabuk ayaqqabı', 'price' => 35],
        'sh-5' => ['name' => 'Nabuk ayaqqabı', 'price' => 40],
        'sh-6' => ['name' => 'Çəkmə', 'price' => 40],
    ],
    'bedding' => [
        'hm-bd-1' => ['name' => 'Ədyal – İkinəfərlik', 'price' => 25],
        'hm-bd-2' => ['name' => 'Yastıq', 'price' => 15],
        'hm-bd-3' => ['name' => 'Yastıq üzü', 'price' => 5],
        'hm-bd-4' => ['name' => 'Yastıq örtüyü', 'price' => 15],
        'hm-bd-5' => ['name' => 'Yataq örtüyü', 'price' => 15],
        'hm-bd-6' => ['name' => 'Yorğan – Birnəfərlik', 'price' => 25],
        'hm-bd-7' => ['name' => 'Yorğan – İkinəfərlik', 'price' => 30],
        'hm-bd-8' => ['name' => 'Yataq ləvazimatı (kq)', 'price' => 6],
        'hm-bt-1' => ['name' => 'Kiçik dəsmal', 'price' => 5],
        'hm-bt-2' => ['name' => 'Hamam dəsmalı', 'price' => 9],
        'hm-lr-1' => ['name' => 'Divan örtüyü', 'price' => 20],
        'hm-lr-2' => ['name' => 'Kreslo örtüyü', 'price' => 10],
        'hm-lr-3' => ['name' => 'Süfrə – Böyük', 'price' => 15],
        'hm-lr-4' => ['name' => 'Süfrə – Kiçik', 'price' => 10],
    ],
    'bags' => [
        'ac-bg-1' => ['name' => 'Çanta – Qismən dəri', 'price' => 25],
        'ac-bg-2' => ['name' => 'Çanta – Sadə', 'price' => 20],
        'ac-bg-3' => ['name' => 'Çanta – Dəri', 'price' => 30],
        'ac-ac-1' => ['name' => 'Papaq', 'price' => 6],
        'ac-ac-2' => ['name' => 'Şərf', 'price' => 7],
        'ac-ac-3' => ['name' => 'Qalstuk', 'price' => 7],
        'ac-ac-4' => ['name' => 'Əlcək', 'price' => 7],
        'ac-kd-1' => ['name' => 'Yumşaq oyuncaq – Böyük', 'price' => 30],
        'ac-kd-2' => ['name' => 'Yumşaq oyuncaq – Kiçik', 'price' => 15],
        'ac-kd-3' => ['name' => 'Uşaq arabası', 'price' => 30],
    ],
];
