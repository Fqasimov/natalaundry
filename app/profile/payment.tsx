import { View, Text } from "react-native";
import { useI18n } from "@/lib/language-context";
import { Card, SettingsScaffold, settingsText } from "@/components/SettingsScaffold";

/**
 * Payment methods.
 *
 * Says plainly how payment works today rather than showing an empty card list:
 * there is no stored-card flow in the confirmed schema (`payment_intents`
 * exists but is unpopulated), so an "add card" button would be a promise the
 * backend cannot keep.
 */
export default function PaymentScreen() {
  const { t } = useI18n();
  return (
    <SettingsScaffold title={t("paymentTitle")}>
      <Card>
        <View style={settingsText.pad}>
          <Text style={settingsText.h2}>{t("paymentTitle")}</Text>
          <Text style={settingsText.body}>{t("paymentBody")}</Text>
        </View>
      </Card>
    </SettingsScaffold>
  );
}
