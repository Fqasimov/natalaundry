import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/language-context";
import { fetchRecentAddresses } from "@/lib/orders";
import { font } from "@/theme/tokens";
import { Card, Note, SettingsScaffold, settingsText, settingsUi } from "@/components/SettingsScaffold";

/**
 * Addresses, derived from the customer's own order history.
 *
 * There is no addresses table in the confirmed schema, and inventing one would
 * create a table the server doesn't know about. Past orders already carry the
 * address that was used, so the useful list — "places you've had us collect
 * from" — can be built from data that certainly exists.
 */
export default function AddressesScreen() {
  const { session } = useAuth();
  const { t } = useI18n();
  const [addresses, setAddresses] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId) return;
    try {
      setAddresses(await fetchRecentAddresses(userId));
    } catch {
      setAddresses([]);
    }
  }, [session?.user.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (addresses === null) {
    return (
      <SettingsScaffold title={t("addressesTitle")}>
        <ActivityIndicator color={settingsUi.accent} style={{ marginTop: 32 }} />
      </SettingsScaffold>
    );
  }

  return (
    <SettingsScaffold title={t("addressesTitle")}>
      {addresses.length === 0 ? (
        <Note>{t("addressesEmpty")}</Note>
      ) : (
        <>
          <Note>{t("addressesRecent")}</Note>
          <Card>
            {addresses.map((address, i) => (
              <View key={address}>
                {i > 0 ? <View style={s.divider} /> : null}
                <View style={s.row}>
                  <Ionicons name="location-outline" size={22} color={settingsUi.accent} />
                  <Text style={s.label}>{address}</Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}
    </SettingsScaffold>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 18, paddingVertical: 16 },
  label: { flex: 1, fontFamily: font.medium, fontSize: 15, lineHeight: 21, color: settingsUi.ink },
  divider: { height: 1, backgroundColor: settingsUi.divider, marginLeft: 56 },
});
