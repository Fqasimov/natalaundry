import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";

// profiles.name/phone are the confirmed editable fields — customer_details/
// courier_details turned out to hold system-managed stuff instead
// (stripe_customer_id, courier vehicle/location), not profile display info.
export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const { profile, isLoading } = useProfile();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setPhone(profile.phone ?? "");
    }
  }, [profile]);

  const save = async () => {
    if (!session?.user.id) return;
    setSaving(true);
    await supabase.from("profiles").update({ name, phone }).eq("id", session.user.id);
    setSaving(false);
  };

  if (isLoading || !profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>{session?.user.email}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.role}>{profile.role ?? "user"}</Text>
        <Text style={styles.points}>{profile.points} pts</Text>
      </View>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />

      <Text style={styles.label}>Phone</Text>
      <TextInput style={styles.input} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

      <Pressable style={styles.saveButton} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save</Text>}
      </Pressable>

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1, padding: 24, paddingTop: 70, backgroundColor: "#fff" },
  title: { fontFamily: "Outfit_700Bold", fontSize: 24 },
  subtitle: { fontFamily: "Outfit_400Regular", color: "#666", marginTop: 4 },
  metaRow: { flexDirection: "row", gap: 12, marginTop: 8, marginBottom: 20 },
  role: {
    fontFamily: "Outfit_600SemiBold",
    color: "#111",
    textTransform: "capitalize",
  },
  points: { fontFamily: "Outfit_400Regular", color: "#666" },
  label: { fontFamily: "Outfit_500Medium", color: "#666", marginTop: 12, marginBottom: 6, fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 14,
    fontFamily: "Outfit_400Regular",
  },
  saveButton: { backgroundColor: "#111", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 24 },
  saveButtonText: { color: "#fff", fontFamily: "Outfit_600SemiBold" },
  signOutButton: {
    borderWidth: 1,
    borderColor: "#c0392b",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 12,
  },
  signOutText: { fontFamily: "Outfit_600SemiBold", color: "#c0392b" },
});
