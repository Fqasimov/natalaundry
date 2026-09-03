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
  bedding: { ru: "Постельные принадлежности", en: "Bedding" },
  bath: { ru: "Ванная", en: "Bathroom" },
  living: { ru: "Гостиная", en: "Living room" },
  bags: { ru: "Сумки", en: "Bags" },
  accessories: { ru: "Аксессуары", en: "Accessories" },
  kids: { ru: "Детские вещи", en: "Kids' items" },
};

// Keyed by the real `service_prices.item_id`. The English side is the name the
// database itself stores, so the app and the admin console call the same thing
// by the same name.
export const ITEM_NAME: Record<string, Pair> = {
  // Dry cleaning
  "dc-shirt-1": { ru: "Футболка", en: "T-Shirt" },
  "dc-shirt-2": { ru: "Рубашка — короткий рукав", en: "Short-sleeve Shirt" },
  "dc-shirt-3": { ru: "Рубашка — длинный рукав", en: "Long-sleeve Shirt" },
  "dc-shirt-4": { ru: "Свитер", en: "Sweater" },

  "dc-suit-1": { ru: "Пиджак", en: "Blazer" },
  "dc-suit-2": { ru: "Жилет", en: "Vest" },
  "dc-suit-3": { ru: "Костюм (2 предмета)", en: "2-Piece Suit" },
  "dc-suit-4": { ru: "Костюм (3 предмета)", en: "3-Piece Suit" },

  "dc-bot-1": { ru: "Брюки", en: "Trousers" },
  "dc-bot-2": { ru: "Шорты", en: "Shorts" },
  "dc-bot-3": { ru: "Юбка", en: "Skirt" },

  "dc-dress-1": { ru: "Платье", en: "Dress" },
  "dc-dress-2": { ru: "Вечернее платье", en: "Evening Dress" },

  "dc-outer-1": { ru: "Куртка — короткая", en: "Short Jacket" },
  "dc-outer-2": { ru: "Куртка — длинная", en: "Long Jacket" },
  "dc-outer-3": { ru: "Кожаная куртка", en: "Leather Jacket" },
  "dc-outer-4": { ru: "Пальто", en: "Coat" },
  "dc-outer-5": { ru: "Плащ", en: "Trench Coat" },
  "dc-outer-6": { ru: "Дублёнка", en: "Sheepskin Coat" },
  "dc-outer-7": { ru: "Шуба — короткая", en: "Short Fur Coat" },
  "dc-outer-8": { ru: "Шуба — длинная", en: "Long Fur Coat" },

  "dc-ev-1": { ru: "Носки", en: "Socks" },
  "dc-ev-2": { ru: "Нижнее бельё", en: "Underwear" },
  "dc-ev-3": { ru: "Спортивный костюм", en: "Tracksuit" },
  "dc-ev-4": { ru: "Пижама", en: "Pajamas" },

  // Ironing
  "ir-shirt-1": { ru: "Футболка", en: "T-Shirt" },
  "ir-shirt-2": { ru: "Рубашка — короткий рукав", en: "Short-sleeve Shirt" },
  "ir-shirt-3": { ru: "Рубашка — длинный рукав", en: "Long-sleeve Shirt" },
  "ir-shirt-4": { ru: "Свитер", en: "Sweater" },

  "ir-suit-1": { ru: "Пиджак", en: "Blazer" },
  "ir-suit-2": { ru: "Жилет", en: "Vest" },
  "ir-suit-3": { ru: "Костюм (2 предмета)", en: "2-Piece Suit" },
  "ir-suit-4": { ru: "Костюм (3 предмета)", en: "3-Piece Suit" },

  "ir-bot-1": { ru: "Брюки", en: "Trousers" },
  "ir-bot-2": { ru: "Шорты", en: "Shorts" },
  "ir-bot-3": { ru: "Юбка", en: "Skirt" },

  "ir-dress-1": { ru: "Платье", en: "Dress" },
  "ir-dress-2": { ru: "Вечернее платье", en: "Evening Dress" },

  "ir-outer-1": { ru: "Пальто", en: "Coat" },
  "ir-outer-2": { ru: "Плащ", en: "Trench Coat" },

  "ir-ev-1": { ru: "Пижама", en: "Pajamas" },

  // Shoes
  "sh-1": { ru: "Тканевая обувь", en: "Fabric shoes" },
  "sh-2": { ru: "Частично кожаная обувь", en: "Partially leather shoes" },
  "sh-3": { ru: "Полностью кожаная обувь", en: "Full leather shoes" },
  "sh-4": { ru: "Частично нубуковая обувь", en: "Partially nubuck shoes" },
  "sh-5": { ru: "Нубуковая обувь", en: "Nubuck shoes" },
  "sh-6": { ru: "Сапоги", en: "Boots" },

  // Home textiles
  "hm-bd-1": { ru: "Одеяло — двуспальное", en: "Blanket - Double" },
  "hm-bd-2": { ru: "Подушка", en: "Pillow" },
  "hm-bd-3": { ru: "Наволочка", en: "Pillowcase" },
  "hm-bd-4": { ru: "Чехол для подушки", en: "Pillow cover" },
  "hm-bd-5": { ru: "Покрывало", en: "Bedspread" },
  "hm-bd-6": { ru: "Пуховое одеяло — односпальное", en: "Duvet - Single" },
  "hm-bd-7": { ru: "Пуховое одеяло — двуспальное", en: "Duvet - Double" },
  "hm-bd-8": { ru: "Постельные принадлежности (кг)", en: "Bedding items (kg)" },

  "hm-bt-1": { ru: "Маленькое полотенце", en: "Small towel" },
  "hm-bt-2": { ru: "Банное полотенце", en: "Bath towel" },

  "hm-lr-1": { ru: "Чехол для дивана", en: "Sofa cover" },
  "hm-lr-2": { ru: "Чехол для кресла", en: "Armchair cover" },
  "hm-lr-3": { ru: "Скатерть — большая", en: "Tablecloth - Large" },
  "hm-lr-4": { ru: "Скатерть — маленькая", en: "Tablecloth - Small" },

  // Accessories
  "ac-bg-1": { ru: "Сумка — частично кожаная", en: "Bag - Partially leather" },
  "ac-bg-2": { ru: "Сумка — простая", en: "Bag - Simple" },
  "ac-bg-3": { ru: "Сумка — кожаная", en: "Bag - Leather" },

  "ac-ac-1": { ru: "Шапка", en: "Hat" },
  "ac-ac-2": { ru: "Шарф", en: "Scarf" },
  "ac-ac-3": { ru: "Галстук", en: "Tie" },
  "ac-ac-4": { ru: "Перчатки", en: "Gloves" },

  "ac-kd-1": { ru: "Мягкая игрушка — большая", en: "Soft toy - Large" },
  "ac-kd-2": { ru: "Мягкая игрушка — маленькая", en: "Soft toy - Small" },
  "ac-kd-3": { ru: "Коляска", en: "Stroller" },
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
