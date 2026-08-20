import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import { Stack, router } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { createOrder } from "@/lib/orders";
import { CATALOG } from "@/lib/catalog";

const TIME_SLOTS = ["Today, 10:00–12:00", "Today, 14:00–16:00", "Tomorrow, 10:00–12:00", "Tomorrow, 14:00–16:00"];

export default function BookScreen() {
  const { session } = useAuth();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [address, setAddress] = useState("");
  const [collectionTime, setCollectionTime] = useState(TIME_SLOTS[0]);
  const [deliveryTime, setDeliveryTime] = useState(TIME_SLOTS[2]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setQty = (itemId: string, delta: number) => {
    setQuantities((prev) => ({ ...prev, [itemId]: Math.max(0, (prev[itemId] ?? 0) + delta) }));
  };

  const selectedItems = CATALOG.filter((c) => (quantities[c.itemId] ?? 0) > 0).map((c) => ({
    itemId: c.itemId,
    serviceId: c.serviceId,
    itemName: c.name,
    price: c.price,
    quantity: quantities[c.itemId],
  }));

  const total = selectedItems.reduce((sum, item) => sum + item.quantity * item.price, 0);

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
        collectionTime,
        deliveryTime,
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

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Book a pickup" }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.section}>What do you need cleaned?</Text>
        <Text style={styles.caveat}>
          Item list is a placeholder catalog — the real service_prices table's price/name columns weren&apos;t
          in the schema dump yet, swap CATALOG in lib/catalog.ts once they are.
        </Text>
        {CATALOG.map((item) => (
          <View key={item.itemId} style={styles.serviceRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.serviceName}>{item.name}</Text>
              <Text style={styles.servicePrice}>
                {item.price} / {item.unit}
              </Text>
            </View>
            <View style={styles.qtyControl}>
              <Pressable style={styles.qtyButton} onPress={() => setQty(item.itemId, -1)}>
                <Text style={styles.qtyButtonText}>−</Text>
              </Pressable>
              <Text style={styles.qtyValue}>{quantities[item.itemId] ?? 0}</Text>
              <Pressable style={styles.qtyButton} onPress={() => setQty(item.itemId, 1)}>
                <Text style={styles.qtyButtonText}>+</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Text style={styles.section}>Pickup address</Text>
        <TextInput
          style={styles.input}
          placeholder="Street, building, apartment"
          value={address}
          onChangeText={setAddress}
        />
        {/* TODO: swap for react-native-google-places-autocomplete once we
            confirm how the original screen combined address text + map pin */}

        <Text style={styles.section}>Pickup time</Text>
        <View style={styles.slotRow}>
          {TIME_SLOTS.map((slot) => (
            <Pressable
              key={slot}
              style={[styles.slot, collectionTime === slot && styles.slotActive]}
              onPress={() => setCollectionTime(slot)}
            >
              <Text style={[styles.slotText, collectionTime === slot && styles.slotTextActive]}>{slot}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>Delivery time</Text>
        <View style={styles.slotRow}>
          {TIME_SLOTS.map((slot) => (
            <Pressable
              key={slot}
              style={[styles.slot, deliveryTime === slot && styles.slotActive]}
              onPress={() => setDeliveryTime(slot)}
            >
              <Text style={[styles.slotText, deliveryTime === slot && styles.slotTextActive]}>{slot}</Text>
            </Pressable>
          ))}
        </View>

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
  container: { padding: 20, paddingBottom: 60 },
  section: { fontFamily: "Outfit_600SemiBold", fontSize: 16, marginTop: 20, marginBottom: 10 },
  caveat: { fontFamily: "Outfit_400Regular", color: "#999", fontSize: 11, marginTop: -6, marginBottom: 10 },
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
  slotRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slot: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  slotActive: { backgroundColor: "#111", borderColor: "#111" },
  slotText: { fontFamily: "Outfit_400Regular", fontSize: 12 },
  slotTextActive: { color: "#fff" },
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
