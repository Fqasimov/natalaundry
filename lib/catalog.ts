import type { IconName } from "@/components/AppIcon";
import type { ServiceKey } from "@/theme/tokens";

// The catalogue, taken from `public.service_prices` in the live database on
// 2026-09-03 — 71 items across six services, with the prices the business
// actually charges.
//
// It did NOT start that way. The first version was transcribed from the 1.0.2
// screen recording with invented ids (`tshirt`, `suit_2pc`, `bag_large`) and
// 30 of its 49 prices marked `unverified` guesses, because the schema dump
// available at the time was truncated and the real ids could not be read. A
// comment here even claimed the ids "line up with" service_prices. They did
// not line up at all: **zero** of the 49 existed in the table.
//
// That was not a cosmetic problem. `enforce_item_price` looks the item up by
// `item_id` and raises 'Unknown or inactive item_id' when it misses, so every
// line item of every order was rejected — orders were created with no items
// and a ₼0 total, and checkout failed at the last step. Three such orders sit
// in production from 2026-09-03.
//
// So the rule is now the other way round: **service_prices is the authority**,
// and this file mirrors it. `itemId` and `priceServiceId` must match that
// table exactly, and `price` must equal the row's price — the customer is
// shown one number and the trigger charges another otherwise.
//
// The display names stay Azerbaijani (the table stores English ones, which is
// what the admin console shows); RU/EN live in lib/catalog-i18n.ts, keyed by
// these same ids.

export type CatalogItem = {
  itemId: string;
  name: string;
  price: number;
};

export type CatalogCategory = {
  categoryId: string;
  name: string;
  icon: IconName;
  items: CatalogItem[];
};

export type CatalogService = {
  serviceId: ServiceKey;
  /**
   * The `service_id` this service is stored under in `service_prices` and
   * `order_items` — camelCase, and deliberately not the same as `serviceId`.
   *
   * `serviceId` is the app's own key: it drives routing, the palette in
   * theme/tokens.ts and the icon map, and is snake_case throughout. The
   * database has used `dryCleaning`/`home`/`accessories` since 1.0.2 and the
   * 31 existing order_items rows are written that way. Renaming either side
   * would be a data migration, so the two vocabularies are kept apart and
   * this field is the bridge. Send this one to the server, never `serviceId`.
   */
  priceServiceId: string;
  name: string;
  tagline: string;
  icon: IconName;
  categories: CatalogCategory[];
};

export const CATALOG: CatalogService[] = [
  {
    serviceId: "dry_cleaning",
    priceServiceId: "dryCleaning",
    name: "Quru Təmizləmə",
    tagline: "Zərif parçalar və paltarlar üçün.",
    icon: "mci:washing-machine",
    categories: [
      {
        categoryId: "shirts",
        name: "Köynəklər",
        icon: "mci:tshirt-crew",
        items: [
          { itemId: "dc-shirt-1", name: "T-Shirt", price: 7 },
          { itemId: "dc-shirt-2", name: "Köynək – Qısaqol", price: 7 },
          { itemId: "dc-shirt-3", name: "Köynək – Uzunqol", price: 8 },
          { itemId: "dc-shirt-4", name: "Sviter", price: 9 },
        ],
      },
      {
        categoryId: "suits",
        name: "Kostyumlar",
        icon: "mci:tie",
        items: [
          { itemId: "dc-suit-1", name: "Pencək", price: 12 },
          { itemId: "dc-suit-2", name: "Jilet", price: 7 },
          { itemId: "dc-suit-3", name: "Kostyum (2 hissəli)", price: 20 },
          { itemId: "dc-suit-4", name: "Kostyum (3 hissəli)", price: 25 },
        ],
      },
      {
        categoryId: "bottoms",
        name: "Alt geyimlər",
        icon: "mci:hanger",
        items: [
          { itemId: "dc-bot-1", name: "Şalvar", price: 10 },
          { itemId: "dc-bot-2", name: "Şort", price: 6 },
          { itemId: "dc-bot-3", name: "Ətək", price: 10 },
        ],
      },
      {
        categoryId: "dresses",
        name: "Donlar",
        icon: "mci:human-female",
        items: [
          { itemId: "dc-dress-1", name: "Don", price: 20 },
          { itemId: "dc-dress-2", name: "Gecə donu", price: 30 },
        ],
      },
      {
        categoryId: "outerwear",
        name: "Xarici geyimlər",
        icon: "mci:snowflake",
        items: [
          { itemId: "dc-outer-1", name: "Gödəkçə – Qısa", price: 20 },
          { itemId: "dc-outer-2", name: "Gödəkçə – Uzun", price: 25 },
          { itemId: "dc-outer-3", name: "Dəri gödəkçə", price: 60 },
          { itemId: "dc-outer-4", name: "Palto", price: 25 },
          { itemId: "dc-outer-5", name: "Plaş", price: 25 },
          { itemId: "dc-outer-6", name: "Dublyonka", price: 60 },
          { itemId: "dc-outer-7", name: "Xəz palto – Qısa", price: 55 },
          { itemId: "dc-outer-8", name: "Xəz palto – Uzun", price: 100 },
        ],
      },
      {
        categoryId: "daily_other",
        name: "Gündəlik və Digər",
        icon: "mci:dots-horizontal-circle-outline",
        items: [
          { itemId: "dc-ev-1", name: "Corab", price: 2 },
          { itemId: "dc-ev-2", name: "Alt paltarı", price: 4 },
          { itemId: "dc-ev-3", name: "İdman kostyumu", price: 20 },
          { itemId: "dc-ev-4", name: "Pijama", price: 10 },
        ],
      },
    ],
  },
  {
    serviceId: "ironing",
    priceServiceId: "ironing",
    name: "Ütüləmə",
    tagline: "Artıq təmiz olan əşyalar üçün.",
    icon: "mci:iron",
    categories: [
      {
        categoryId: "shirts",
        name: "Köynəklər",
        icon: "mci:tshirt-crew",
        items: [
          { itemId: "ir-shirt-1", name: "T-Shirt", price: 4 },
          { itemId: "ir-shirt-2", name: "Köynək – Qısaqol", price: 4 },
          { itemId: "ir-shirt-3", name: "Köynək – Uzunqol", price: 4 },
          { itemId: "ir-shirt-4", name: "Sviter", price: 4 },
        ],
      },
      {
        categoryId: "suits",
        name: "Kostyumlar",
        icon: "mci:tie",
        items: [
          { itemId: "ir-suit-1", name: "Pencək", price: 6 },
          { itemId: "ir-suit-2", name: "Jilet", price: 4 },
          { itemId: "ir-suit-3", name: "Kostyum (2 hissəli)", price: 8 },
          { itemId: "ir-suit-4", name: "Kostyum (3 hissəli)", price: 10 },
        ],
      },
      {
        categoryId: "bottoms",
        name: "Alt geyimlər",
        icon: "mci:hanger",
        items: [
          { itemId: "ir-bot-1", name: "Şalvar", price: 4 },
          { itemId: "ir-bot-2", name: "Şort", price: 4 },
          { itemId: "ir-bot-3", name: "Ətək", price: 4 },
        ],
      },
      {
        categoryId: "dresses",
        name: "Donlar",
        icon: "mci:human-female",
        items: [
          { itemId: "ir-dress-1", name: "Don", price: 6 },
          { itemId: "ir-dress-2", name: "Gecə donu", price: 10 },
        ],
      },
      {
        categoryId: "outerwear",
        name: "Xarici geyimlər",
        icon: "mci:snowflake",
        items: [
          { itemId: "ir-outer-1", name: "Palto", price: 10 },
          { itemId: "ir-outer-2", name: "Plaş", price: 7 },
        ],
      },
      {
        categoryId: "daily_other",
        name: "Gündəlik və Digər",
        icon: "mci:dots-horizontal-circle-outline",
        items: [{ itemId: "ir-ev-1", name: "Pijama", price: 4 }],
      },
    ],
  },
  {
    serviceId: "shoes",
    priceServiceId: "shoes",
    name: "Ayaqqabı Təmizləmə",
    tagline: "Ayaqqabılarınıza peşəkar qulluq.",
    icon: "mci:shoe-formal",
    categories: [
      {
        categoryId: "shoes",
        name: "Ayaqqabılar",
        icon: "mci:shoe-formal",
        items: [
          { itemId: "sh-1", name: "Sadə parça ayaqqabı", price: 25 },
          { itemId: "sh-2", name: "Qismən dəri ayaqqabı", price: 30 },
          { itemId: "sh-3", name: "Tam dəri ayaqqabı", price: 35 },
          { itemId: "sh-4", name: "Qismən nabuk ayaqqabı", price: 35 },
          { itemId: "sh-5", name: "Nabuk ayaqqabı", price: 40 },
          { itemId: "sh-6", name: "Çəkmə", price: 40 },
        ],
      },
    ],
  },
  {
    serviceId: "bedding",
    priceServiceId: "home",
    name: "Ev Tekstili",
    tagline: "Yorğanlar, yastıqlar, pərdələr üçün.",
    icon: "mci:bed-king-outline",
    categories: [
      {
        categoryId: "bedding",
        name: "Yataq dəstləri",
        icon: "mci:bed-king-outline",
        items: [
          { itemId: "hm-bd-1", name: "Ədyal – İkinəfərlik", price: 25 },
          { itemId: "hm-bd-2", name: "Yastıq", price: 15 },
          { itemId: "hm-bd-3", name: "Yastıq üzü", price: 5 },
          { itemId: "hm-bd-4", name: "Yastıq örtüyü", price: 15 },
          { itemId: "hm-bd-5", name: "Yataq örtüyü", price: 15 },
          { itemId: "hm-bd-6", name: "Yorğan – Birnəfərlik", price: 25 },
          { itemId: "hm-bd-7", name: "Yorğan – İkinəfərlik", price: 30 },
          { itemId: "hm-bd-8", name: "Yataq ləvazimatı (kq)", price: 6 },
        ],
      },
      {
        categoryId: "bath",
        name: "Hamam",
        icon: "mci:shower",
        items: [
          { itemId: "hm-bt-1", name: "Kiçik dəsmal", price: 5 },
          { itemId: "hm-bt-2", name: "Hamam dəsmalı", price: 9 },
        ],
      },
      {
        categoryId: "living",
        name: "Qonaq otağı",
        icon: "mci:sofa-outline",
        items: [
          { itemId: "hm-lr-1", name: "Divan örtüyü", price: 20 },
          { itemId: "hm-lr-2", name: "Kreslo örtüyü", price: 10 },
          { itemId: "hm-lr-3", name: "Süfrə – Böyük", price: 15 },
          { itemId: "hm-lr-4", name: "Süfrə – Kiçik", price: 10 },
        ],
      },
    ],
  },
  {
    serviceId: "bags",
    priceServiceId: "accessories",
    name: "Aksesuarlar",
    tagline: "Çantalar, kəmər, aksesuar üçün.",
    icon: "mci:purse",
    categories: [
      {
        categoryId: "bags",
        name: "Çantalar",
        icon: "mci:purse",
        items: [
          { itemId: "ac-bg-1", name: "Çanta – Qismən dəri", price: 25 },
          { itemId: "ac-bg-2", name: "Çanta – Sadə", price: 20 },
          { itemId: "ac-bg-3", name: "Çanta – Dəri", price: 30 },
        ],
      },
      {
        categoryId: "accessories",
        name: "Aksesuarlar",
        icon: "mci:hat-fedora",
        items: [
          { itemId: "ac-ac-1", name: "Papaq", price: 6 },
          { itemId: "ac-ac-2", name: "Şərf", price: 7 },
          { itemId: "ac-ac-3", name: "Qalstuk", price: 7 },
          { itemId: "ac-ac-4", name: "Əlcək", price: 7 },
        ],
      },
      {
        categoryId: "kids",
        name: "Uşaq əşyaları",
        icon: "mci:teddy-bear",
        items: [
          { itemId: "ac-kd-1", name: "Yumşaq oyuncaq – Böyük", price: 30 },
          { itemId: "ac-kd-2", name: "Yumşaq oyuncaq – Kiçik", price: 15 },
          { itemId: "ac-kd-3", name: "Uşaq arabası", price: 30 },
        ],
      },
    ],
  },
];

export const SERVICE_ORDER = CATALOG.map((s) => s.serviceId);

export function findService(serviceId: ServiceKey) {
  return CATALOG.find((s) => s.serviceId === serviceId) ?? CATALOG[0];
}

/**
 * The `service_id` to store alongside an item. Falls back to the app key so a
 * service added here without a database row still writes *something* readable
 * rather than undefined.
 */
export function priceServiceIdFor(serviceId: string): string {
  return CATALOG.find((s) => s.serviceId === serviceId)?.priceServiceId ?? serviceId;
}

export function findItem(serviceId: string, itemId: string) {
  for (const service of CATALOG) {
    if (service.serviceId !== serviceId) continue;
    for (const category of service.categories) {
      const item = category.items.find((i) => i.itemId === itemId);
      if (item) return { service, category, item };
    }
  }
  return null;
}
