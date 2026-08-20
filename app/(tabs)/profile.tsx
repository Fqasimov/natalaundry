import { View, Text, Pressable, StyleSheet } from "react-native";
import { useAuth } from "@/lib/auth-context";

export default function ProfileScreen() {
  const { session, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>{session?.user.email}</Text>

      <Pressable style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 80, backgroundColor: "#fff" },
  title: { fontFamily: "Outfit_700Bold", fontSize: 24 },
  subtitle: { fontFamily: "Outfit_400Regular", color: "#666", marginTop: 4, marginBottom: 24 },
  button: { borderWidth: 1, borderColor: "#c0392b", borderRadius: 10, padding: 14, alignItems: "center" },
  buttonText: { fontFamily: "Outfit_600SemiBold", color: "#c0392b" },
});
