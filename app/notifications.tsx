import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import type { Notification } from "@/types/database";

export default function NotificationsScreen() {
  const { session } = useAuth();
  const [items, setItems] = useState<Notification[] | null>(null);

  const load = useCallback(() => {
    if (!session?.user.id) return;
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setItems((data as Notification[]) ?? []));
  }, [session?.user.id]);

  useEffect(load, [load]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    load();
  };

  if (!items) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Notifications" }} />
      <FlatList
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>Nothing yet</Text>}
        renderItem={({ item }) => (
          <Pressable style={[styles.row, !item.read && styles.rowUnread]} onPress={() => markRead(item.id)}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16 },
  empty: { fontFamily: "Outfit_400Regular", color: "#666", textAlign: "center", marginTop: 40 },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  rowUnread: { backgroundColor: "#fafafa" },
  title: { fontFamily: "Outfit_600SemiBold" },
  body: { fontFamily: "Outfit_400Regular", color: "#666", marginTop: 2 },
});
