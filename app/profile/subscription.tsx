import { View, Text } from "react-native";
import { useProfile } from "@/lib/profile";
import { useI18n } from "@/lib/language-context";
import { Card, SettingsScaffold, settingsText } from "@/components/SettingsScaffold";

/** Reflects `profiles.is_subscribed` — the one confirmed subscription field. */
export default function SubscriptionScreen() {
  const { profile } = useProfile();
  const { t } = useI18n();
  const active = Boolean(profile?.is_subscribed);

  return (
    <SettingsScaffold title={t("subscriptionTitle")}>
      <Card>
        <View style={settingsText.pad}>
          <Text style={settingsText.h2}>
            {active ? t("subscriptionName") : t("subscriptionInactive")}
          </Text>
          <Text style={settingsText.body}>
            {active ? t("subscriptionActiveBody") : t("subscriptionInactiveBody")}
          </Text>
        </View>
      </Card>
    </SettingsScaffold>
  );
}
