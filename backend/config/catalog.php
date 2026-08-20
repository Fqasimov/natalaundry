<?php

/**
 * Fallback catalogue, mirroring lib/catalog.ts in the app.
 *
 * The authoritative source is `public.service_prices`, but only its
 * `service_id` / `item_id` columns are confirmed — the schema dump was
 * truncated before returning a price column. CatalogService prefers the
 * database whenever it exposes a usable price column and falls back to this
 * list otherwise, so pricing is never taken from the client.
 *
 * Prices marked "verified" are legible in the 1.0.2 screen recording.
 */
return [
    'dry_cleaning' => [
        'tshirt' => ['name' => 'T-Shirt', 'price' => 7],              // verified
        'shirt_short' => ['name' => 'Köynək – Qısaqol', 'price' => 7], // verified
        'shirt_long' => ['name' => 'Köynək – Uzunqol', 'price' => 8],  // verified
        'sweater' => ['name' => 'Sviter', 'price' => 9],               // verified
        'trousers' => ['name' => 'Şalvar', 'price' => 10],             // verified
        'shorts' => ['name' => 'Şort', 'price' => 6],                  // verified
        'skirt' => ['name' => 'Ətək', 'price' => 10],                  // verified
        'jacket' => ['name' => 'Pencək', 'price' => 12],
        'suit_2pc' => ['name' => 'Kostyum (2 hissəli)', 'price' => 20],
        'suit_3pc' => ['name' => 'Kostyum (3 hissəli)', 'price' => 26],
        'vest' => ['name' => 'Jilet', 'price' => 8],
        'dress_simple' => ['name' => 'Sadə don', 'price' => 14],
        'dress_evening' => ['name' => 'Gecə donu', 'price' => 25],
        'coat' => ['name' => 'Palto', 'price' => 22],
        'jacket_winter' => ['name' => 'Qış gödəkçəsi', 'price' => 25],
        'raincoat' => ['name' => 'Plaş', 'price' => 18],
        'leather_jacket' => ['name' => 'Dəri gödəkçə', 'price' => 35],
        'tie' => ['name' => 'Qalstuk', 'price' => 5],
        'scarf' => ['name' => 'Şərf', 'price' => 6],
        'gloves' => ['name' => 'Əlcək', 'price' => 5],
        'hat' => ['name' => 'Papaq', 'price' => 7],
    ],
    'ironing' => [
        'tshirt' => ['name' => 'T-Shirt', 'price' => 3],
        'shirt_short' => ['name' => 'Köynək – Qısaqol', 'price' => 3],
        'shirt_long' => ['name' => 'Köynək – Uzunqol', 'price' => 4],
        'sweater' => ['name' => 'Sviter', 'price' => 4],
        'trousers' => ['name' => 'Şalvar', 'price' => 4],
        'skirt' => ['name' => 'Ətək', 'price' => 4],
        'shorts' => ['name' => 'Şort', 'price' => 3],
        'dress_simple' => ['name' => 'Sadə don', 'price' => 6],
        'dress_evening' => ['name' => 'Gecə donu', 'price' => 10],
    ],
    'shoes' => [
        'shoe_fabric' => ['name' => 'Sadə parça ayaqqabı', 'price' => 25],       // verified
        'shoe_part_leather' => ['name' => 'Qismən dəri ayaqqabı', 'price' => 30], // verified
        'shoe_full_leather' => ['name' => 'Tam dəri ayaqqabı', 'price' => 35],    // verified
        'shoe_part_nubuck' => ['name' => 'Qismən nabuk ayaqqabı', 'price' => 35], // verified
        'shoe_nubuck' => ['name' => 'Nabuk ayaqqabı', 'price' => 40],             // verified
        'boot' => ['name' => 'Çəkmə', 'price' => 40],                             // verified
    ],
    'bedding' => [
        'bedding_single' => ['name' => 'Bir nəfərlik dəst', 'price' => 15],
        'bedding_double' => ['name' => 'İki nəfərlik dəst', 'price' => 20],
        'duvet' => ['name' => 'Yorğan', 'price' => 25],
        'pillow' => ['name' => 'Yastıq', 'price' => 8],
        'blanket' => ['name' => 'Ədyal', 'price' => 22],
        'curtain' => ['name' => 'Pərdə', 'price' => 18],
        'tablecloth' => ['name' => 'Süfrə', 'price' => 12],
        'towel' => ['name' => 'Dəsmal', 'price' => 5],
    ],
    'bags' => [
        'bag_small' => ['name' => 'Kiçik çanta', 'price' => 20],
        'bag_medium' => ['name' => 'Orta çanta', 'price' => 28],
        'bag_large' => ['name' => 'Böyük çanta', 'price' => 35],
        'backpack' => ['name' => 'Bel çantası', 'price' => 25],
        'suitcase' => ['name' => 'Çamadan', 'price' => 40],
    ],
];
