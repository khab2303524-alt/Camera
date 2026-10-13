import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const CTU_NavyBlue = "#1F5CA9";
const CTU_Red = "#ED1C24";
const CTU_Green = "#2E7D32";
const CTU_White = "#FFFFFF";
const CTU_Black = "#000000";
const COLOR_TEXT_PRIMARY = "#11181C";
const COLOR_TEXT_HINT = "#64748B";
const COLOR_TEXT_GRAY = "#7A8FAD";
const COLOR_OVERLAY = "rgba(0, 0, 0, 0.45)";

type DialogButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

type Payload = { title: string; message?: string; buttons: DialogButton[] };

let listener: ((p: Payload) => void) | null = null;

/**
 * Thay thế Alert.alert: cùng cách gọi, nhưng hiển thị modal giống modal đăng xuất.
 * Nếu <AppDialogHost /> chưa được gắn thì tự dùng Alert gốc.
 */
export function appAlert(title: string, message?: string, buttons?: DialogButton[]) {
  if (!listener) {
    Alert.alert(title, message, buttons);
    return;
  }
  listener({ title, message, buttons: buttons?.length ? buttons : [{ text: "OK" }] });
}

const iconCho = (title: string): { name: React.ComponentProps<typeof Ionicons>["name"]; color: string } => {
  const t = title.toLowerCase();
  if (t.includes("lỗi")) return { name: "alert-circle-outline", color: CTU_Red };
  if (t.includes("thành công") || t.includes("đã gửi")) return { name: "checkmark-circle-outline", color: CTU_Green };
  return { name: "information-circle-outline", color: CTU_NavyBlue };
};

// Gắn một lần ở root layout (app/_layout.tsx), sau cùng trong cây component.
export function AppDialogHost() {
  const [current, setCurrent] = useState<Payload | null>(null);

  useEffect(() => {
    listener = setCurrent;
    return () => {
      listener = null;
    };
  }, []);

  const dong = () => setCurrent(null);

  const bam = (b: DialogButton) => {
    dong();
    b.onPress?.();
  };

  const mauNut = (b: DialogButton) =>
    b.style === "cancel" ? CTU_Black : b.style === "destructive" ? CTU_Red : CTU_NavyBlue;

  const icon = current ? iconCho(current.title) : null;
  const cancelBtn = current?.buttons.find((b) => b.style === "cancel");

  return (
    <Modal
      visible={!!current}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (cancelBtn) bam(cancelBtn);
        else dong();
      }}
    >
      <Pressable style={styles.overlay} onPress={() => (cancelBtn ? bam(cancelBtn) : dong())}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            {icon && <Ionicons name={icon.name} size={22} color={icon.color} />}
            <Text style={styles.title} numberOfLines={2}>
              {current?.title}
            </Text>
            <TouchableOpacity
              onPress={() => (cancelBtn ? bam(cancelBtn) : dong())}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color={COLOR_TEXT_GRAY} />
            </TouchableOpacity>
          </View>

          {!!current?.message && <Text style={styles.message}>{current.message}</Text>}

          <View
            style={[
              styles.actions,
              { justifyContent: (current?.buttons.length ?? 1) > 1 ? "space-between" : "flex-end" },
            ]}
          >
            {current?.buttons.map((b, i) => (
              <TouchableOpacity key={i} style={styles.button} onPress={() => bam(b)} activeOpacity={0.7}>
                <Text style={[styles.buttonText, { color: mauNut(b) }]}>{b.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLOR_OVERLAY,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modal: {
    backgroundColor: CTU_White,
    borderRadius: 20,
    padding: 20,
    width: "100%",
    maxWidth: 420,
    maxHeight: "85%",
    elevation: 8,
    shadowColor: CTU_Black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  title: { fontSize: 16, fontWeight: "700", color: COLOR_TEXT_PRIMARY, flex: 1 },
  message: { fontSize: 13, color: COLOR_TEXT_HINT, marginTop: 10, lineHeight: 18 },
  actions: { flexDirection: "row", alignItems: "center", marginTop: 16 },
  button: { paddingVertical: 10, paddingHorizontal: 6 },
  buttonText: { fontSize: 16, fontWeight: "700" },
});
