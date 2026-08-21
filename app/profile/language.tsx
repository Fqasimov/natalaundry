import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/lib/language-context";
import { LANGUAGES, type Language } from "@/lib/i18n";
import { font } from "@/theme/tokens";
import { Card, SettingsScaffold, settingsUi } from "@/components/SettingsScaffold";

/** Language is already persisted by the provider, so picking one is enough. */
const LABEL: Record<Language, string> = {
  az: "Azərbaycan",
  ru: "Русский",
  en: "English",
};

export default function LanguageScreen() {
  const { t, lang, setLang } = useI18n();

  return (
    <SettingsScaffold title={t("appLanguage")}>
      <Card>
        {LANGUAGES.map((code, i) => (
          <View key={code}>
            {i > 0 ? <View style={s.divider} /> : null}
            <Pressable style={s.row} onPress={() => setLang(code)}>
              <Text style={s.label}>{LABEL[code]}</Text>
              {code === lang ? (
                <Ionicons name="checkmark-circle" size={22} color={settingsUi.accent} />
              ) : (
                <View style={s.empty} />
              )}
            </Pressable>
          </View>
        ))}
      </Card>
    </SettingsScaffold>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 17,
  },
  label: { flex: 1, fontFamily: font.bold, fontSize: 16, color: settingsUi.ink },
  empty: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: settingsUi.border },
  divider: { height: 1, backgroundColor: settingsUi.divider, marginLeft: 18 },
});
