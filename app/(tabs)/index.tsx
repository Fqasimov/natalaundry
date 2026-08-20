import { View, Text, StyleSheet } from "react-native";
import { useAuth } from "@/lib/auth-context";

// PLACEHOLDER — replace with the real home screen once we know what it
// showed (order CTA, promos like "10% Endirim", active order status, etc.
// "10% Endirim" ["10% discount" in Azerbaijani] and other Az-language
// strings were found in the original bundle, so the app is likely
// bilingual — worth confirming before rebuilding this screen for real).
export default function HomeScreen() {
  const { session, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>{session?.user.email}</Text>
      <Text style={styles.note} onPress={signOut}>
        Sign out
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 80, backgroundColor: "#fff" },
  title: { fontFamily: "Outfit_700Bold", fontSize: 24 },
  subtitle: { fontFamily: "Outfit_400Regular", color: "#666", marginTop: 4 },
  note: { fontFamily: "Outfit_500Medium", color: "#c0392b", marginTop: 24 },
});
