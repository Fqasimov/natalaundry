import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Stack, router } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { createOrder, fetchActiveServicePrices } from "@/lib/orders";
import type { ServicePrice } from "@/types/database";

export default function BookScreen() {
  const { session } = useAuth();
  const [services, setServices] = useState<ServicePrice[] | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchActiveServicePrices()
      .then(setServices)
      .catch((e) => setError(e.message));
  }, []);

  const setQty = (id: string, delta: number) => {
    setQuantities((prev) => {
      const next = Math.max(0, (prev[id] ?? 0) + delta);
      return { ...prev, [id]: next };
    });
  };

  const selectedItems = (services ?? [])
    .filter((s) => (quantities[s.id] ?? 0) > 0)
    .map((s) => ({ servicePriceId: s.id, quantity: quantities[s.id], unitPrice: s.price }));

  const total = selectedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const onSubmit = async () => {
    if (!session?.user.id) return;
    if (selectedItems.length === 0) {
      Alert.alert("Pick at least one item");
      return;
    }
    if (!address.trim()) {
      Alert.alert("Enter a pickup address");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const order = await createOrder({
        userId: session.user.id,
        address: address.trim(),
        addressLat: null,
        addressLng: null,
        scheduledFor: null,
        notes: notes.trim() || null,
        items: selectedItems,
      });
      router.replace(`/order/${order.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!services) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Book a pickup" }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.section}>What do you need cleaned?</Text>
        {services.length === 0 ? (
          <Text style={styles.empty}>
            No active services found. (service_prices table may use different column names than guessed —
            see SCHEMA_NOTES.md)
          </Text>
        ) : (
          services.map((service) => (
            <View key={service.id} style={styles.serviceRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.serviceName}>{service.name}</Text>
                <Text style={styles.servicePrice}>
                  {service.price} / {service.unit}
                </Text>
              </View>
              <View style={styles.qtyControl}>
                <Pressable style={styles.qtyButton} onPress={() => setQty(service.id, -1)}>
                  <Text style={styles.qtyButtonText}>−</Text>
                </Pressable>
                <Text style={styles.qtyValue}>{quantities[service.id] ?? 0}</Text>
                <Pressable style={styles.qtyButton} onPress={() => setQty(service.id, 1)}>
                  <Text style={styles.qtyButtonText}>+</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Text style={styles.section}>Pickup address</Text>
        <TextInput
          style={styles.input}
          placeholder="Street, building, apartment"
          value={address}
          onChangeText={setAddress}
        />
        {/* TODO: swap for react-native-google-places-autocomplete once we
            confirm how the original screen combined address text + map pin */}

        <Text style={styles.section}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, { height: 80 }]}
          placeholder="Anything the courier should know"
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{total.toFixed(2)}</Text>
        </View>

        <Pressable style={styles.submit} onPress={onSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Book pickup</Text>}
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 20, paddingBottom: 60 },
  section: { fontFamily: "Outfit_600SemiBold", fontSize: 16, marginTop: 20, marginBottom: 10 },
  empty: { fontFamily: "Outfit_400Regular", color: "#666" },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  serviceName: { fontFamily: "Outfit_500Medium" },
  servicePrice: { fontFamily: "Outfit_400Regular", color: "#666", marginTop: 2, fontSize: 12 },
  qtyControl: { flexDirection: "row", alignItems: "center", gap: 12 },
  qtyButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButtonText: { fontFamily: "Outfit_600SemiBold", fontSize: 16 },
  qtyValue: { fontFamily: "Outfit_500Medium", width: 20, textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 14,
    fontFamily: "Outfit_400Regular",
  },
  error: { color: "#c0392b", marginTop: 12, fontFamily: "Outfit_400Regular" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  totalLabel: { fontFamily: "Outfit_500Medium", fontSize: 16 },
  totalValue: { fontFamily: "Outfit_700Bold", fontSize: 16 },
  submit: {
    backgroundColor: "#111",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 20,
  },
  submitText: { color: "#fff", fontFamily: "Outfit_600SemiBold" },
});
