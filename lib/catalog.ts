import type { IconName } from "@/components/AppIcon";
import type { ServiceKey } from "@/theme/tokens";

// Catalogue transcribed from the 1.0.2 screen recording. Item names and
// prices that are legible in the video are exact; categories the video shows
// only as a collapsed header (with its item count) are reconstructed at
// plausible prices and marked `unverified` so they're easy to correct against
// the real `service_prices` rows.
//
// service_prices in Postgres keys on (service_id, item_id) — those are the
// two columns confirmed by the schema dump — so the ids here are written to
// line up with that composite key.

export type CatalogItem = {
  itemId: string;
  name: string;
  price: number;
  unverified?: true;
};

export type CatalogCategory = {
  categoryId: string;
  name: string;
  icon: IconName;
  items: CatalogItem[];
};

export type CatalogService = {
  serviceId: ServiceKey;
  name: string;
  tagline: string;
  icon: IconName;
  categories: CatalogCategory[];
};

export const CATALOG: CatalogService[] = [
  {
    serviceId: "dry_cleaning",
    name: "Quru Təmizləmə",
    tagline: "Zərif parçalar və paltarlar üçün.",
    icon: "mci:washing-machine",
    categories: [
      {
        categoryId: "shirts",
        name: "Köynəklər",
        icon: "mci:tshirt-crew",
        items: [
          { itemId: "tshirt", name: "T-Shirt", price: 7 },
          { itemId: "shirt_short", name: "Köynək – Qısaqol", price: 7 },
          { itemId: "shirt_long", name: "Köynək – Uzunqol", price: 8 },
          { itemId: "sweater", name: "Sviter", price: 9 },
        ],
      },
      {
        categoryId: "suits",
        name: "Kostyumlar",
        icon: "mci:tie",
        items: [
          { itemId: "jacket", name: "Pencək", price: 12, unverified: true },
          { itemId: "suit_2pc", name: "Kostyum (2 hissəli)", price: 20, unverified: true },
          { itemId: "suit_3pc", name: "Kostyum (3 hissəli)", price: 26, unverified: true },
          { itemId: "vest", name: "Jilet", price: 8, unverified: true },
        ],
      },
      {
        categoryId: "bottoms",
        name: "Alt geyimlər",
        icon: "mci:hanger",
        items: [
          { itemId: "trousers", name: "Şalvar", price: 10 },
          { itemId: "shorts", name: "Şort", price: 6 },
          { itemId: "skirt", name: "Ətək", price: 10 },
        ],
      },
      {
        categoryId: "dresses",
        name: "Donlar",
        icon: "mci:human-female",
        items: [
          { itemId: "dress_simple", name: "Sadə don", price: 14, unverified: true },
          { itemId: "dress_evening", name: "Gecə donu", price: 25, unverified: true },
        ],
      },
      {
        categoryId: "outerwear",
        name: "Xarici geyimlər",
        icon: "mci:snowflake",
        items: [
          { itemId: "coat", name: "Palto", price: 22, unverified: true },
          { itemId: "jacket_winter", name: "Qış gödəkçəsi", price: 25, unverified: true },
          { itemId: "raincoat", name: "Plaş", price: 18, unverified: true },
          { itemId: "leather_jacket", name: "Dəri gödəkçə", price: 35, unverified: true },
        ],
      },
      {
        categoryId: "daily_other",
        name: "Gündəlik və Digər",
        icon: "mci:dots-horizontal-circle-outline",
        items: [
          { itemId: "tie", name: "Qalstuk", price: 5, unverified: true },
          { itemId: "scarf", name: "Şərf", price: 6, unverified: true },
          { itemId: "gloves", name: "Əlcək", price: 5, unverified: true },
          { itemId: "hat", name: "Papaq", price: 7, unverified: true },
        ],
      },
    ],
  },
  {
    serviceId: "ironing",
    name: "Ütüləmə",
    tagline: "Artıq təmiz olan əşyalar üçün.",
    icon: "mci:iron",
    categories: [
      {
        categoryId: "shirts",
        name: "Köynəklər",
        icon: "mci:tshirt-crew",
        items: [
          { itemId: "tshirt", name: "T-Shirt", price: 3, unverified: true },
          { itemId: "shirt_short", name: "Köynək – Qısaqol", price: 3, unverified: true },
          { itemId: "shirt_long", name: "Köynək – Uzunqol", price: 4, unverified: true },
          { itemId: "sweater", name: "Sviter", price: 4, unverified: true },
        ],
      },
      {
        categoryId: "bottoms",
        name: "Alt geyimlər",
        icon: "mci:hanger",
        items: [
          { itemId: "trousers", name: "Şalvar", price: 4, unverified: true },
          { itemId: "skirt", name: "Ətək", price: 4, unverified: true },
          { itemId: "shorts", name: "Şort", price: 3, unverified: true },
        ],
      },
      {
        categoryId: "dresses",
        name: "Donlar",
        icon: "mci:human-female",
        items: [
          { itemId: "dress_simple", name: "Sadə don", price: 6, unverified: true },
          { itemId: "dress_evening", name: "Gecə donu", price: 10, unverified: true },
        ],
      },
    ],
  },
  {
    serviceId: "shoes",
    name: "Ayaqqabı Təmizləmə",
    tagline: "Ayaqqabılarınıza peşəkar qulluq.",
    icon: "mci:shoe-formal",
    categories: [
      {
        categoryId: "shoes",
        name: "Ayaqqabılar",
        icon: "mci:shoe-formal",
        items: [
          { itemId: "shoe_fabric", name: "Sadə parça ayaqqabı", price: 25 },
          { itemId: "shoe_part_leather", name: "Qismən dəri ayaqqabı", price: 30 },
          { itemId: "shoe_full_leather", name: "Tam dəri ayaqqabı", price: 35 },
          { itemId: "shoe_part_nubuck", name: "Qismən nabuk ayaqqabı", price: 35 },
          { itemId: "shoe_nubuck", name: "Nabuk ayaqqabı", price: 40 },
          { itemId: "boot", name: "Çəkmə", price: 40 },
        ],
      },
    ],
  },
  {
    serviceId: "bedding",
    name: "Yataq Dəstləri",
    tagline: "Yataq və ev tekstili üçün.",
    icon: "mci:bed-king-outline",
    categories: [
      {
        categoryId: "bedding",
        name: "Yataq dəstləri",
        icon: "mci:bed-king-outline",
        items: [
          { itemId: "bedding_single", name: "Bir nəfərlik dəst", price: 15, unverified: true },
          { itemId: "bedding_double", name: "İki nəfərlik dəst", price: 20, unverified: true },
          { itemId: "duvet", name: "Yorğan", price: 25, unverified: true },
          { itemId: "pillow", name: "Yastıq", price: 8, unverified: true },
          { itemId: "blanket", name: "Ədyal", price: 22, unverified: true },
        ],
      },
      {
        categoryId: "home_textile",
        name: "Ev tekstili",
        icon: "mci:sofa-outline",
        items: [
          { itemId: "curtain", name: "Pərdə", price: 18, unverified: true },
          { itemId: "tablecloth", name: "Süfrə", price: 12, unverified: true },
          { itemId: "towel", name: "Dəsmal", price: 5, unverified: true },
        ],
      },
    ],
  },
  {
    serviceId: "bags",
    name: "Çanta Təmizləmə",
    tagline: "Çanta və dəri aksesuarlar üçün.",
    icon: "mci:purse",
    categories: [
      {
        categoryId: "bags",
        name: "Çantalar",
        icon: "mci:purse",
        items: [
          { itemId: "bag_small", name: "Kiçik çanta", price: 20, unverified: true },
          { itemId: "bag_medium", name: "Orta çanta", price: 28, unverified: true },
          { itemId: "bag_large", name: "Böyük çanta", price: 35, unverified: true },
          { itemId: "backpack", name: "Bel çantası", price: 25, unverified: true },
          { itemId: "suitcase", name: "Çamadan", price: 40, unverified: true },
        ],
      },
    ],
  },
];

export const SERVICE_ORDER = CATALOG.map((s) => s.serviceId);

export function findService(serviceId: ServiceKey) {
  return CATALOG.find((s) => s.serviceId === serviceId) ?? CATALOG[0];
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
