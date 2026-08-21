import { View, Text, Pressable, StyleSheet } from "react-native";
import { Redirect, Tabs, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/theme/tokens";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile";
import { useI18n } from "@/lib/language-context";

// Three-slot tab bar from the video: Ana səhifə, a raised orange "+" that
// jumps straight into the catalogue, and Profil.
export default function TabsLayout() {
  const { session, isLoading } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const { t } = useI18n();

  if (!isLoading && !session) {
    return <Redirect href="/(auth)/login" />;
  }

  // Couriers work a different job entirely — offered orders and one active
  // task — so they get their own screen rather than the customer's catalogue
  // and basket. Waiting for the profile avoids bouncing a courier through the
  // customer tabs for a frame while their role loads.
  if (!profileLoading && profile?.role === "courier") {
    return <Redirect href="/courier" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 },
        tabBarStyle: {
          height: 78,
          paddingTop: 8,
          paddingBottom: 18,
          backgroundColor: colors.surface,
          borderTopColor: colors.divider,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("home"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={23} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="order"
        options={{
          title: t("order"),
          tabBarIcon: () => null,
          tabBarButton: (props) => (
            <Pressable
              style={styles.fabSlot}
              onPress={() => router.push("/service/dry_cleaning")}
              testID={props.testID}
            >
              <View style={styles.fab}>
                <Ionicons name="add" size={30} color={colors.textInverse} />
              </View>
              <Text style={styles.fabLabel}>{t("order")}</Text>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("profile"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={23} color={color} />
          ),
        }}
      />

      {/* Reachable by route but not shown as tabs — the video's bar has three slots. */}
      <Tabs.Screen name="orders" options={{ href: null }} />
      <Tabs.Screen name="wallet" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  fabSlot: { flex: 1, alignItems: "center", justifyContent: "flex-start" },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -20,
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabLabel: { fontFamily: font.medium, fontSize: 11, color: colors.textSecondary, marginTop: 4 },
});
