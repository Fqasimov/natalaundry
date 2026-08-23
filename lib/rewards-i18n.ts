import { useMemo } from "react";
import type { RewardKind } from "@/lib/rewards";
import type { RewardValue } from "@/lib/gift-boxes";
import type { ServiceKey } from "@/theme/tokens";
import { serviceTheme } from "@/theme/tokens";
import { findItem, findService } from "@/lib/catalog";
import { itemName, serviceName } from "@/lib/catalog-i18n";
import { useI18n } from "@/lib/language-context";

/**
 * Prize copy, composed rather than translated row by row.
 *
 * There are fifty prizes in the pool, but only a handful of shapes: an amount
 * of balance, a number of points, a percentage, one free item, or a named
 * package. So the server stores the numbers and the app renders them through
 * a template per kind — fifty prizes cost eight translations instead of a
 * hundred and fifty, and a prize added to the pool tomorrow is already
 * translated.
 *
 * Service and item names come from the catalogue translations, so a free
 * "Palto" reads "Пальто" in Russian without a second table of names.
 */
export function useRewardCopy() {
  const { t, lang } = useI18n();

  return useMemo(() => {
    const serviceLabel = (id?: string): string => {
      if (!id) return "";
      const service = findService(id as ServiceKey);
      const az = service?.name ?? serviceTheme[id as ServiceKey]?.label ?? id;
      return serviceName(id as ServiceKey, az, lang);
    };

    const itemLabel = (serviceId?: string, itemId?: string): string => {
      if (!itemId) return "";
      const found = serviceId ? findItem(serviceId, itemId) : null;
      return itemName(itemId, found?.item.name ?? itemId, lang);
    };

    /** Title and description for a prize, from its kind and stored value. */
    const describe = (
      kind: RewardKind,
      value: RewardValue | null | undefined,
      fallback?: { title?: string; description?: string },
    ): { title: string; description: string } => {
      const v = value ?? {};

      switch (kind) {
        case "balance_bonus":
          return {
            title: t("prizeBalance", { amount: v.amount ?? 0 }),
            description: t("prizeBalanceDesc"),
          };
        case "eco_points":
          return {
            title: t("prizePoints", { points: v.points ?? 0 }),
            description: t("prizePointsDesc"),
          };
        case "discount_coupon": {
          const service = serviceLabel(v.service_id);
          if (service) {
            return {
              title: t("prizePercentService", { percent: v.percent ?? 0, service }),
              description: t("prizePercentServiceDesc", { service }),
            };
          }
          return {
            title: t("prizePercent", { percent: v.percent ?? 0 }),
            description: t("prizePercentDesc"),
          };
        }
        case "free_service": {
          const item = itemLabel(v.service_id, v.item_id);
          return {
            title: t("prizeFreeItem", { item }),
            description: t("prizeFreeItemDesc", { item }),
          };
        }
        case "free_express_delivery":
          return { title: t("prizeFreeDelivery"), description: t("prizeFreeDeliveryDesc") };
        case "eco_care_package":
          return { title: t("prizeEcoCare"), description: t("prizeEcoCareDesc") };
        case "vip_care_package":
          return { title: t("prizeVipCare"), description: t("prizeVipCareDesc") };
        default:
          // An unrecognised kind still shows the server's own Azerbaijani text
          // rather than an empty card.
          return {
            title: fallback?.title ?? "",
            description: fallback?.description ?? "",
          };
      }
    };

    return { describe };
  }, [t, lang]);
}
