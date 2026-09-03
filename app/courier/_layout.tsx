import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/theme/tokens";
import { useI18n } from "@/lib/language-context";

/**
 * The courier app's three tabs.
 *
 * It used to be a single screen with two pills at the top, which meant the
 * shift switch, the day's figures and the job in hand all competed for the
 * same space, and the profile was reachable only through a small icon. The
 * shape here follows the supplied design: what is happening now, the work
 * available, and the courier's own page.
 *
 * Styled from `colors` (the 1.0.2 blue on ivory) rather than `brand`, because
 * that is what the design shows. The customer app keeps the coastal palette —
 * the two are different products with different users, and the courier one is
 * read at arm's length in daylight, which the higher-contrast blue suits.
 */
export default function CourierLayout() {
  const { t } = useI18n();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.divider,
          height: 84,
          paddingTop: 8,
          paddingBottom: 26,
        },
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11.5 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("courierTabHome"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="deliveries"
        options={{
          title: t("courierTabDeliveries"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="car-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("courierTabProfile"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
