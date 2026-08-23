import { useMemo } from "react";
import type { BoxTier, RewardKind } from "@/lib/rewards";
import { useI18n } from "@/lib/language-context";

/**
 * Translations for the gift box rewards.
 *
 * Same arrangement as the catalogue: lib/rewards.ts stays Azerbaijani, since
 * it is transcribed from the shipped app and is the source of truth for what
 * each reward is worth, and these are the RU and EN renderings keyed by the
 * same reward kinds and box tiers. A kind with no entry falls back to the
 * Azerbaijani text rather than to a blank card.
 */
type Copy = { title: string; description: string };
type Localised = { ru: Copy; en: Copy };

export const REWARD_COPY: Record<RewardKind, Localised> = {
  balance_bonus: {
    ru: { title: "Бонус 4 AZN", description: "Автоматически вычитается из суммы заказа" },
    en: { title: "4 AZN balance bonus", description: "Taken off your order total automatically" },
  },
  free_express_delivery: {
    ru: { title: "Бесплатная экспресс-доставка", description: "Доставка следующего заказа — 0 ₼" },
    en: { title: "Free express delivery", description: "Delivery on your next order costs ₼0" },
  },
  free_service: {
    ru: {
      title: "Бесплатная чистка костюма",
      description: "Один костюм-двойка в химчистку бесплатно",
    },
    en: {
      title: "Free suit cleaning",
      description: "One two-piece suit dry cleaned at no charge",
    },
  },
  eco_points: {
    ru: { title: "100 эко-баллов в подарок", description: "100 зелёных баллов зачислены на счёт" },
    en: { title: "100 eco points", description: "100 green points added to your balance" },
  },
  eco_care_package: {
    ru: {
      title: "Дополнительный эко-уход",
      description: "Антибактериальная деликатная обработка в подарок",
    },
    en: {
      title: "Extra eco-care package",
      description: "Antibacterial delicate care, on the house",
    },
  },
  vip_care_package: {
    ru: { title: "VIP-набор ухода", description: "Особая защитная обработка для вашей одежды" },
    en: { title: "VIP care package", description: "Special protective care for your garments" },
  },
  discount_coupon: {
    ru: { title: "Купон на 20%", description: "Скидка 20% на услуги химчистки" },
    en: { title: "20% discount coupon", description: "20% off dry cleaning" },
  },
};

export const BOX_COPY: Record<BoxTier, Localised & { badge: { ru: string; en: string } }> = {
  daily_bronze: {
    ru: { title: "Ежедневная бронзовая коробка", description: "Открывайте бесплатно раз в день!" },
    en: { title: "Daily bronze box", description: "Open one free every day!" },
    badge: { ru: "БЕСПЛАТНО", en: "FREE" },
  },
  gold: {
    ru: { title: "Золотая подарочная коробка", description: "Коробка после каждого заказа!" },
    en: { title: "Gold gift box", description: "A box after every order!" },
    badge: { ru: "ЗОЛОТО", en: "GOLD" },
  },
  legendary_vip: {
    ru: {
      title: "Легендарная VIP-коробка",
      description: "Для пользователей Nata Plus и Gold VIP.",
    },
    en: { title: "Legendary VIP box", description: "For Nata Plus and Gold VIP members." },
    badge: { ru: "ЛЕГЕНДАРНАЯ", en: "LEGENDARY" },
  },
};

/** Gift copy in the reader's language, falling back to the Azerbaijani text. */
export function useRewardCopy() {
  const { lang } = useI18n();

  return useMemo(() => {
    const pick = <T,>(value: T | undefined, fallback: T) =>
      lang === "az" || value === undefined ? fallback : value;

    return {
      rewardTitle: (kind: RewardKind, az: string) =>
        pick(lang === "az" ? undefined : REWARD_COPY[kind]?.[lang]?.title, az),
      rewardDescription: (kind: RewardKind, az: string) =>
        pick(lang === "az" ? undefined : REWARD_COPY[kind]?.[lang]?.description, az),
      boxTitle: (tier: BoxTier, az: string) =>
        pick(lang === "az" ? undefined : BOX_COPY[tier]?.[lang]?.title, az),
      boxDescription: (tier: BoxTier, az: string) =>
        pick(lang === "az" ? undefined : BOX_COPY[tier]?.[lang]?.description, az),
      boxBadge: (tier: BoxTier, az: string) =>
        pick(lang === "az" ? undefined : BOX_COPY[tier]?.badge?.[lang], az),
    };
  }, [lang]);
}
