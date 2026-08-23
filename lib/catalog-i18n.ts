import { useMemo } from "react";
import type { ServiceKey } from "@/theme/tokens";
import type { Language } from "@/lib/i18n";
import { useI18n } from "@/lib/language-context";
import type { CatalogCategory, CatalogItem, CatalogService } from "@/lib/catalog";

/**
 * Translations for the catalogue.
 *
 * The catalogue itself (lib/catalog.ts) stays Azerbaijani — it is transcribed
 * from the shipped app and is the source of truth for names and prices, the
 * same rule the rest of the copy follows. These are the RU and EN renderings,
 * keyed by the same ids, so a translation can never drift onto the wrong item:
 * an id with no entry here simply falls back to the Azerbaijani name.
 *
 * Kept out of lib/i18n.ts deliberately. That file is organised by screen and
 * these are data, not interface copy.
 */
type Pair = { ru: string; en: string };

export const SERVICE_COPY: Record<ServiceKey, { name: Pair; tagline: Pair }> = {
  dry_cleaning: {
    name: { ru: "Химчистка", en: "Dry cleaning" },
    tagline: {
      ru: "Для деликатных тканей и одежды.",
      en: "For delicate fabrics and garments.",
    },
  },
  ironing: {
    name: { ru: "Глажка", en: "Ironing" },
    tagline: {
      ru: "Для уже чистых вещей.",
      en: "For items that are already clean.",
    },
  },
  shoes: {
    name: { ru: "Чистка обуви", en: "Shoe cleaning" },
    tagline: {
      ru: "Профессиональный уход за обувью.",
      en: "Professional care for your shoes.",
    },
  },
  bedding: {
    name: { ru: "Домашний текстиль", en: "Home textiles" },
    tagline: {
      ru: "Одеяла, подушки, шторы.",
      en: "Duvets, pillows and curtains.",
    },
  },
  bags: {
    name: { ru: "Аксессуары", en: "Accessories" },
    tagline: {
      ru: "Сумки, ремни и аксессуары.",
      en: "Bags, belts and accessories.",
    },
  },
  toplu: {
    name: { ru: "Оптом", en: "Bulk" },
    tagline: {
      ru: "Не знаете количество? Курьер посчитает.",
      en: "Not sure how many? The courier counts.",
    },
  },
};

export const CATEGORY_NAME: Record<string, Pair> = {
  shirts: { ru: "Рубашки", en: "Shirts" },
  suits: { ru: "Костюмы", en: "Suits" },
  bottoms: { ru: "Низ", en: "Bottoms" },
  dresses: { ru: "Платья", en: "Dresses" },
  outerwear: { ru: "Верхняя одежда", en: "Outerwear" },
  daily_other: { ru: "Повседневное и прочее", en: "Everyday & other" },
  shoes: { ru: "Обувь", en: "Shoes" },
  bedding: { ru: "Комплекты постельного белья", en: "Bedding sets" },
  home_textile: { ru: "Домашний текстиль", en: "Home textiles" },
  bags: { ru: "Сумки", en: "Bags" },
};

export const ITEM_NAME: Record<string, Pair> = {
  tshirt: { ru: "Футболка", en: "T-shirt" },
  shirt_short: { ru: "Рубашка — короткий рукав", en: "Shirt – short sleeve" },
  shirt_long: { ru: "Рубашка — длинный рукав", en: "Shirt – long sleeve" },
  sweater: { ru: "Свитер", en: "Sweater" },

  jacket: { ru: "Пиджак", en: "Jacket" },
  suit_2pc: { ru: "Костюм (2 предмета)", en: "Suit (2-piece)" },
  suit_3pc: { ru: "Костюм (3 предмета)", en: "Suit (3-piece)" },
  vest: { ru: "Жилет", en: "Waistcoat" },

  trousers: { ru: "Брюки", en: "Trousers" },
  shorts: { ru: "Шорты", en: "Shorts" },
  skirt: { ru: "Юбка", en: "Skirt" },

  dress_simple: { ru: "Простое платье", en: "Simple dress" },
  dress_evening: { ru: "Вечернее платье", en: "Evening dress" },

  coat: { ru: "Пальто", en: "Coat" },
  jacket_winter: { ru: "Зимняя куртка", en: "Winter jacket" },
  raincoat: { ru: "Плащ", en: "Raincoat" },
  leather_jacket: { ru: "Кожаная куртка", en: "Leather jacket" },

  tie: { ru: "Галстук", en: "Tie" },
  scarf: { ru: "Шарф", en: "Scarf" },
  gloves: { ru: "Перчатки", en: "Gloves" },
  hat: { ru: "Шапка", en: "Hat" },

  shoe_fabric: { ru: "Тканевая обувь", en: "Fabric shoes" },
  shoe_part_leather: { ru: "Частично кожаная обувь", en: "Part-leather shoes" },
  shoe_full_leather: { ru: "Полностью кожаная обувь", en: "Full-leather shoes" },
  shoe_part_nubuck: { ru: "Частично нубуковая обувь", en: "Part-nubuck shoes" },
  shoe_nubuck: { ru: "Нубуковая обувь", en: "Nubuck shoes" },
  boot: { ru: "Сапоги", en: "Boots" },

  bedding_single: { ru: "Односпальный комплект", en: "Single set" },
  bedding_double: { ru: "Двуспальный комплект", en: "Double set" },
  duvet: { ru: "Одеяло", en: "Duvet" },
  pillow: { ru: "Подушка", en: "Pillow" },
  blanket: { ru: "Плед", en: "Blanket" },

  curtain: { ru: "Штора", en: "Curtain" },
  tablecloth: { ru: "Скатерть", en: "Tablecloth" },
  towel: { ru: "Полотенце", en: "Towel" },

  bag_small: { ru: "Маленькая сумка", en: "Small bag" },
  bag_medium: { ru: "Средняя сумка", en: "Medium bag" },
  bag_large: { ru: "Большая сумка", en: "Large bag" },
  backpack: { ru: "Рюкзак", en: "Backpack" },
  suitcase: { ru: "Чемодан", en: "Suitcase" },
};

/** Pick the reader's rendering, falling back to the Azerbaijani original. */
function pick(pair: Pair | undefined, language: Language, fallback: string): string {
  if (language === "az" || !pair) return fallback;
  return pair[language] ?? fallback;
}

export const serviceName = (id: ServiceKey, az: string, language: Language) =>
  pick(SERVICE_COPY[id]?.name, language, az);

export const serviceTagline = (id: ServiceKey, az: string, language: Language) =>
  pick(SERVICE_COPY[id]?.tagline, language, az);

export const categoryName = (id: string, az: string, language: Language) =>
  pick(CATEGORY_NAME[id], language, az);

export const itemName = (id: string, az: string, language: Language) =>
  pick(ITEM_NAME[id], language, az);

/**
 * The catalogue's copy in the reader's language, bound to the current locale.
 *
 * A hook rather than raw lookups at each call site so a screen cannot render
 * half its catalogue translated and half of it not — which is exactly what the
 * home grid did, with three cards reading from the catalogue and three with
 * their Azerbaijani baked in.
 */
export function useCatalogCopy() {
  const { lang } = useI18n();

  return useMemo(
    () => ({
      service: (s: Pick<CatalogService, "serviceId" | "name">) =>
        serviceName(s.serviceId, s.name, lang),
      tagline: (s: Pick<CatalogService, "serviceId" | "tagline">) =>
        serviceTagline(s.serviceId, s.tagline, lang),
      category: (c: Pick<CatalogCategory, "categoryId" | "name">) =>
        categoryName(c.categoryId, c.name, lang),
      item: (i: Pick<CatalogItem, "itemId" | "name">) => itemName(i.itemId, i.name, lang),
      /** For the short `serviceTheme` labels, which carry no catalogue entry. */
      label: (id: ServiceKey, az: string) => serviceName(id, az, lang),
    }),
    [lang],
  );
}
