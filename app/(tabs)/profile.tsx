import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import type { CourierDetails, CustomerDetails } from "@/types/database";

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const { profile, isLoading } = useProfile();
  const [details, setDetails] = useState<CustomerDetails | CourierDetails | null>(null);
  const [saving, setSaving] = useState(false);

  const table = profile?.role === "courier" ? "courier_details" : "customer_details";

  useEffect(() => {
    if (!session?.user.id || !profile) return;
    supabase
      .from(table)
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setDetails(data ?? { id: session.user.id, full_name: null, phone: null } as any));
  }, [session?.user.id, profile, table]);

  const save = async () => {
    if (!session?.user.id || !details) return;
    setSaving(true);
    await supabase.from(table).upsert({ ...details, id: session.user.id });
    setSaving(false);
  };

  if (isLoading || !details) {
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
      <Text style={styles.role}>{profile?.role ?? "customer"}</Text>

      <Text style={styles.label}>Full name</Text>
      <TextInput
        style={styles.input}
        value={details.full_name ?? ""}
        onChangeText={(v) => setDetails({ ...details, full_name: v })}
      />

      <Text style={styles.label}>Phone</Text>
      <TextInput
        style={styles.input}
        keyboardType="phone-pad"
        value={details.phone ?? ""}
        onChangeText={(v) => setDetails({ ...details, phone: v })}
      />

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
  role: {
    fontFamily: "Outfit_600SemiBold",
    color: "#111",
    marginTop: 8,
    marginBottom: 20,
    textTransform: "capitalize",
  },
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
