import { appAlert } from "@/components/AppDialog";
import { useAuth } from "@/context/AuthContext";
import { disablePush, enablePush } from "@/lib/pushNotifications";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  EmailAuthProvider,
  getAuth,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  updatePassword,
} from "firebase/auth";
import { off, onValue, ref, set } from "firebase/database";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../config/firebaseConfig";

// Bảng màu đồng bộ toàn bộ app (Tone CTU & UI Template)
const CTU_NavyBlue = "#1F5CA9";
const CTU_SkyBlue = "#00AFEF";
const CTU_Gold = "#FFF200";
const CTU_LightBlue = "#E8F4FB";
const CTU_Red = "#ED1C24";
const CTU_White = "#FFFFFF";
const CTU_Black = "#000000";

// Màu văn bản & Trạng thái
const COLOR_TEXT_PRIMARY = "#11181C";
const COLOR_TEXT_LABEL = "#334155";
const COLOR_TEXT_HINT = "#64748B";
const COLOR_TEXT_GRAY = "#7A8FAD";
const COLOR_PLACEHOLDER = "#A0AEC0";

// Màu nền, đường viền & Đổ bóng
const COLOR_BG_APP = "#F0F4FA";
const COLOR_BG_INPUT = "#F8FAFC";
const COLOR_BORDER = "#E2E8F0";
const COLOR_OVERLAY = "rgba(0, 0, 0, 0.45)";

// Hai ngưỡng nhiệt độ tách riêng, đều lưu trên Firebase Realtime Database:
//  - canhbao : ngưỡng cảnh báo  -> nhietdo/canhbao  (đường "cảnh báo" trên biểu đồ, cờ giamsat/canhbao)
//  - nguyhiem: ngưỡng bật chuông -> nhietdo/nguyhiem (chuông trên thiết bị, đường "nguy hiểm" trên biểu đồ)
type NguongKey = "canhbao" | "nguyhiem";
type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const NGUONG_CONFIG: Record<
  NguongKey,
  { path: string; title: string; icon: IoniconName; placeholder: string; hint: string }
> = {
  canhbao: {
    path: "nhietdo/canhbao",
    title: "Ngưỡng cảnh báo",
    icon: "warning-outline",
    placeholder: "VD: 50",
    hint: "Hệ thống sẽ cảnh báo qua thông báo đẩy khi nhiệt độ đo được vượt quá giá trị này.",
  },
  nguyhiem: {
    path: "nhietdo/nguyhiem",
    title: "Ngưỡng bật chuông",
    icon: "alarm-outline",
    placeholder: "VD: 70",
    hint: "Chuông trên thiết bị sẽ reo khi nhiệt độ đo được đạt giá trị này. Nên đặt cao hơn ngưỡng cảnh báo.",
  },
};

// Pi chỉ nhận ngưỡng trong khoảng này, ngoài khoảng sẽ bỏ qua.
const NGUONG_MIN = -40;
const NGUONG_MAX = 300;

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [thresholds, setThresholds] = useState<Record<NguongKey, number | null>>({
    canhbao: null,
    nguyhiem: null,
  });
  const [inputValue, setInputValue] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<NguongKey>("canhbao"); // ngưỡng đang chỉnh trong modal
  const [modalVisible, setModalVisible] = useState(false);

  // Đổi mật khẩu
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Quên mật khẩu
  const [sendingReset, setSendingReset] = useState(false);

  // Đăng xuất
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Thông báo đẩy (Expo Push, lưu trạng thái tại users/{uid}/push)
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [emailAlertEnabled, setEmailAlertEnabled] = useState(false);

  // Đồng bộ trạng thái bật/tắt push từ Firebase
  useEffect(() => {
    if (!user?.uid) return;
    const r = ref(db, `users/${user.uid}/push/enabled`);
    const cb = (snap: any) => setPushEnabled(snap.val() === true);
    onValue(r, cb);
    return () => off(r, "value", cb);
  }, [user?.uid]);

  const handleTogglePush = useCallback(
    async (next: boolean) => {
      if (!user?.uid || pushBusy) return;
      setPushBusy(true);
      try {
        if (next) {
          const ok = await enablePush(user.uid);
          if (!ok) {
            appAlert(
              "Không thể bật thông báo",
              "Hãy cấp quyền thông báo cho app trong Cài đặt máy và dùng thiết bị thật (không phải emulator)."
            );
          }
        } else {
          await disablePush(user.uid);
        }
      } catch (error) {
        console.error("Lỗi khi cập nhật thông báo đẩy:", error);
        appAlert("Lỗi", "Không thể cập nhật thông báo đẩy. Vui lòng thử lại.");
      } finally {
        setPushBusy(false);
      }
    },
    [user?.uid, pushBusy]
  );

  const displayName = user?.displayName?.trim() || "Người dùng";
  const providerLabel = user?.providerData?.some((provider) => provider.providerId === "google.com")
    ? "Google"
    : "Email";
  const isEmailProvider = providerLabel === "Email";

  const handleLogout = () => setLogoutModalVisible(true);

  const confirmLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await logout();
      setLogoutModalVisible(false);
    } catch (error) {
      console.error("Lỗi khi đăng xuất:", error);
      setLogoutModalVisible(false);
      appAlert("Lỗi", "Không thể đăng xuất. Vui lòng thử lại.");
    } finally {
      setLoggingOut(false);
    }
  }, [logout]);

  useEffect(() => {
    const keys = Object.keys(NGUONG_CONFIG) as NguongKey[];
    const daNhan = new Set<NguongKey>();

    const hoanTat = (key: NguongKey) => {
      daNhan.add(key);
      if (daNhan.size === keys.length) setLoading(false);
    };

    const huy = keys.map((key) => {
      const thresholdRef = ref(db, NGUONG_CONFIG[key].path);

      const handleValue = (snapshot: any) => {
        const val = snapshot.val();
        const so = val !== null && val !== undefined ? Number(val) : null;
        setThresholds((prev) => ({ ...prev, [key]: so !== null && Number.isFinite(so) ? so : null }));
        hoanTat(key);
      };

      onValue(thresholdRef, handleValue, (error) => {
        console.error(`Lỗi khi đọc ${NGUONG_CONFIG[key].path}:`, error);
        hoanTat(key);
      });

      return () => off(thresholdRef, "value", handleValue);
    });

    return () => huy.forEach((f) => f());
  }, []);

  const openModal = (key: NguongKey) => {
    const hienTai = thresholds[key];
    setInputValue(hienTai !== null ? String(hienTai) : "");
    setEditing(key);
    setModalVisible(true);
  };

  const handleSave = useCallback(async () => {
    const cfg = NGUONG_CONFIG[editing];
    const parsed = Number(inputValue.replace(",", "."));

    if (inputValue.trim() === "" || Number.isNaN(parsed)) {
      appAlert("Giá trị không hợp lệ", `Vui lòng nhập một số hợp lệ cho "${cfg.title}".`);
      return;
    }
    if (parsed < NGUONG_MIN || parsed > NGUONG_MAX) {
      appAlert("Giá trị ngoài phạm vi", `Nhập nhiệt độ từ ${NGUONG_MIN} đến ${NGUONG_MAX}°C.`);
      return;
    }

    setSaving(true);
    try {
      await set(ref(db, cfg.path), parsed);
      setThresholds((prev) => ({ ...prev, [editing]: parsed }));
      setModalVisible(false);
    } catch (error) {
      console.error(`Lỗi khi ghi ${cfg.path}:`, error);
      appAlert("Lỗi", `Không thể lưu "${cfg.title}". Vui lòng thử lại.`);
    } finally {
      setSaving(false);
    }
  }, [inputValue, editing]);

  // Mở modal đổi mật khẩu (chỉ áp dụng cho tài khoản đăng nhập bằng Email)
  const openPasswordModal = () => {
    if (!isEmailProvider) {
      appAlert(
        "Không khả dụng",
        "Tài khoản đăng nhập bằng Google không thể dùng chức năng này."
      );
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordModalVisible(true);
  };

  // Xác thực lại người dùng bằng mật khẩu hiện tại rồi đặt mật khẩu mới.
  const handleChangePassword = useCallback(async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      appAlert("Thiếu thông tin", "Vui lòng nhập đầy đủ các trường mật khẩu.");
      return;
    }
    if (newPassword.length < 6) {
      appAlert("Mật khẩu quá ngắn", "Mật khẩu mới cần có ít nhất 6 ký tự.");
      return;
    }
    if (newPassword !== confirmPassword) {
      appAlert("Không khớp", "Mật khẩu mới và xác nhận mật khẩu không khớp nhau.");
      return;
    }

    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
      appAlert("Lỗi", "Không tìm thấy tài khoản đăng nhập.");
      return;
    }

    setChangingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      setPasswordModalVisible(false);
      appAlert("Thành công", "Mật khẩu của bạn đã được cập nhật.");
    } catch (error: any) {
      console.error("Lỗi khi đổi mật khẩu:", error);
      const message =
        error?.code === "auth/wrong-password" || error?.code === "auth/invalid-credential"
          ? "Mật khẩu hiện tại không đúng."
          : "Không thể đổi mật khẩu. Vui lòng thử lại.";
      appAlert("Lỗi", message);
    } finally {
      setChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  // Gửi email đặt lại mật khẩu cho tài khoản hiện tại (quên mật khẩu).
  const handleForgotPassword = useCallback(() => {
    if (!isEmailProvider) {
      appAlert(
        "Không khả dụng",
        "Tài khoản đăng nhập bằng Google không thể dùng chức năng này."
      );
      return;
    }

    const auth = getAuth();
    const email = auth.currentUser?.email || user?.email;

    if (!email) {
      appAlert("Lỗi", "Không tìm thấy email của tài khoản.");
      return;
    }

    appAlert(
      "Quên mật khẩu",
      `Gửi email đặt lại mật khẩu đến ${email}?`,
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Gửi",
          onPress: async () => {
            setSendingReset(true);
            try {
              await sendPasswordResetEmail(auth, email);
              appAlert("Đã gửi email", `Vui lòng kiểm tra hộp thư ${email} để đặt lại mật khẩu.`);
            } catch (error) {
              console.error("Lỗi khi gửi email đặt lại mật khẩu:", error);
              appAlert("Lỗi", "Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại.");
            } finally {
              setSendingReset(false);
            }
          },
        },
      ]
    );
  }, [user, isEmailProvider]);

  const renderNguongCard = (key: NguongKey) => {
    const cfg = NGUONG_CONFIG[key];
    const value = thresholds[key];

    return (
      <View style={styles.card} key={key}>
        <TouchableOpacity
          style={styles.cardHeader}
          onPress={() => openModal(key)}
          activeOpacity={0.7}
        >
          <View style={styles.cardIconBox}>
            <Ionicons name={cfg.icon} size={20} color={CTU_NavyBlue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{cfg.title}</Text>
            {loading ? (
              <ActivityIndicator
                size="small"
                color={COLOR_TEXT_GRAY}
                style={{ marginTop: 2, alignSelf: "flex-start" }}
              />
            ) : (
              <Text style={styles.cardSubtitle}>
                Hiện tại: {value !== null ? `${value}°C` : "Chưa cài đặt"}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLOR_TEXT_GRAY} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <StatusBar barStyle="light-content" backgroundColor={CTU_NavyBlue} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Cài đặt</Text>
        </View>
      </View>

      {/* Body */}
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <View style={styles.accountCard}>
            <View style={styles.accountAvatar}>
              <Ionicons name="person-circle" size={56} color={CTU_NavyBlue} />
            </View>
            <Text style={styles.accountName}>{displayName}</Text>
            <Text style={styles.accountProvider}>Đăng nhập bằng {providerLabel}</Text>
          </View>

          {/* Cấu hình */}
          <Text style={styles.sectionLabel}>CẤU HÌNH</Text>

          {/* Thông báo đẩy khi có cảnh báo quá nhiệt */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconBox}>
                <Ionicons name="notifications-outline" size={20} color={CTU_NavyBlue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Thông báo đẩy</Text>
                <Text style={styles.cardSubtitle}>
                  Thông báo khi quá nhiệt
                </Text>
              </View>
              <Switch
                value={pushEnabled}
                onValueChange={handleTogglePush}
                disabled={pushBusy}
                trackColor={{ false: COLOR_BORDER, true: CTU_SkyBlue }}
                thumbColor={CTU_White}
              />
            </View>
          </View>

          {/* Ngưỡng cảnh báo + ngưỡng bật chuông (hai ngưỡng riêng) */}
          {renderNguongCard("canhbao")}
          {renderNguongCard("nguyhiem")}

          {/* Bảo mật */}
          <Text style={styles.sectionLabel}>BẢO MẬT</Text>

          <TouchableOpacity style={styles.card} onPress={openPasswordModal} activeOpacity={0.7}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconBox, { backgroundColor: CTU_LightBlue }]}>
                <Ionicons name="lock-closed-outline" size={20} color={CTU_NavyBlue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Đổi mật khẩu</Text>
                <Text style={styles.cardSubtitle}>Thay đổi mật khẩu tài khoản</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLOR_TEXT_GRAY} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            onPress={handleForgotPassword}
            activeOpacity={0.7}
            disabled={sendingReset}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconBox, { backgroundColor: "#FDECEA" }]}>
                <Ionicons name="key-outline" size={20} color={CTU_Red} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Quên mật khẩu</Text>
                <Text style={styles.cardSubtitle}>Đặt lại mật khẩu qua email</Text>
              </View>
              {sendingReset ? (
                <ActivityIndicator size="small" color={COLOR_TEXT_GRAY} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={COLOR_TEXT_GRAY} />
              )}
            </View>
          </TouchableOpacity>

          {/* Đăng xuất */}
          <TouchableOpacity
            style={[styles.card, { marginTop: 10 }]}
            onPress={handleLogout}
            activeOpacity={0.75}
          >
            <View style={styles.cardHeader}>
              <View style={styles.logoutIconBox}>
                <Ionicons name="log-out-outline" size={22} color={CTU_White} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.logoutText}>Đăng xuất</Text>
                <Text style={styles.logoutSubtext}>Thoát khỏi tài khoản hiện tại</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={CTU_Red} />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modal chỉnh sửa ngưỡng nhiệt độ */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.settingsModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Ionicons
                name={NGUONG_CONFIG[editing].icon}
                size={22}
                color={CTU_NavyBlue}
              />
              <Text style={styles.modalTitle} numberOfLines={1}>
                {NGUONG_CONFIG[editing].title}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={COLOR_TEXT_GRAY} />
              </TouchableOpacity>
            </View>

            <Text style={styles.tuneFieldLabel}>Nhiệt độ (°C)</Text>
            <View style={styles.tuneInputWithIcon}>
              <TextInput
                style={styles.tuneInputInner}
                value={inputValue}
                onChangeText={setInputValue}
                keyboardType="numeric"
                placeholder={NGUONG_CONFIG[editing].placeholder}
                placeholderTextColor={COLOR_PLACEHOLDER}
                selectTextOnFocus
                autoFocus
              />
              <Text style={styles.tuneUnitInner}>°C</Text>
            </View>

            <Text style={styles.tuneHintText}>
              {NGUONG_CONFIG[editing].hint}
            </Text>

            <View style={styles.tuneBottomActions}>
              <TouchableOpacity
                style={styles.tuneBottomButton}
                onPress={() => setModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.tuneBottomButtonTextCancel}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tuneBottomButton}
                onPress={handleSave}
                activeOpacity={0.7}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={CTU_NavyBlue} />
                ) : (
                  <Text style={styles.tuneBottomButtonTextSubmit}>Lưu</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal đổi mật khẩu */}
      <Modal
        visible={passwordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPasswordModalVisible(false)}>
          <Pressable style={styles.settingsModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Ionicons name="lock-closed-outline" size={22} color={CTU_NavyBlue} />
              <Text style={styles.modalTitle} numberOfLines={1}>
                Đổi mật khẩu
              </Text>
              <TouchableOpacity
                onPress={() => setPasswordModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={COLOR_TEXT_GRAY} />
              </TouchableOpacity>
            </View>

            <Text style={styles.tuneFieldLabel}>Mật khẩu hiện tại</Text>
            <View style={styles.tuneInputWithIcon}>
              <TextInput
                style={styles.tuneInputInner}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                placeholder="Nhập mật khẩu hiện tại"
                placeholderTextColor={COLOR_PLACEHOLDER}
              />
            </View>

            <Text style={styles.tuneFieldLabel}>Mật khẩu mới</Text>
            <View style={styles.tuneInputWithIcon}>
              <TextInput
                style={styles.tuneInputInner}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder="Ít nhất 6 ký tự"
                placeholderTextColor={COLOR_PLACEHOLDER}
              />
            </View>

            <Text style={styles.tuneFieldLabel}>Xác nhận mật khẩu mới</Text>
            <View style={styles.tuneInputWithIcon}>
              <TextInput
                style={styles.tuneInputInner}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder="Nhập lại mật khẩu mới"
                placeholderTextColor={COLOR_PLACEHOLDER}
              />
            </View>

            <Text style={styles.tuneHintText}>
              Bạn cần nhập đúng mật khẩu hiện tại để xác thực trước khi đổi sang mật khẩu mới.
            </Text>

            <View style={styles.tuneBottomActions}>
              <TouchableOpacity
                style={styles.tuneBottomButton}
                onPress={() => setPasswordModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.tuneBottomButtonTextCancel}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tuneBottomButton}
                onPress={handleChangePassword}
                activeOpacity={0.7}
                disabled={changingPassword}
              >
                {changingPassword ? (
                  <ActivityIndicator size="small" color={CTU_NavyBlue} />
                ) : (
                  <Text style={styles.tuneBottomButtonTextSubmit}>Lưu</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal xác nhận đăng xuất */}
      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !loggingOut && setLogoutModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !loggingOut && setLogoutModalVisible(false)}
        >
          <Pressable style={styles.settingsModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Ionicons name="log-out-outline" size={22} color={CTU_Red} />
              <Text style={styles.modalTitle} numberOfLines={1}>
                Đăng xuất
              </Text>
              <TouchableOpacity
                onPress={() => setLogoutModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={loggingOut}
              >
                <Ionicons name="close" size={22} color={COLOR_TEXT_GRAY} />
              </TouchableOpacity>
            </View>

            <Text style={styles.tuneHintText}>
              Bạn có chắc muốn đăng xuất khỏi tài khoản hiện tại?
            </Text>

            <View style={styles.tuneBottomActions}>
              <TouchableOpacity
                style={styles.tuneBottomButton}
                onPress={() => setLogoutModalVisible(false)}
                activeOpacity={0.7}
                disabled={loggingOut}
              >
                <Text style={styles.tuneBottomButtonTextCancel}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tuneBottomButton}
                onPress={confirmLogout}
                activeOpacity={0.7}
                disabled={loggingOut}
              >
                {loggingOut ? (
                  <ActivityIndicator size="small" color={CTU_Red} />
                ) : (
                  <Text style={[styles.tuneBottomButtonTextSubmit, { color: CTU_Red }]}>
                    Đăng xuất
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLOR_BG_APP,
  },
  header: {
    backgroundColor: CTU_NavyBlue,
    paddingVertical: 15,
    paddingHorizontal: 20,
    paddingTop: 50,
    flexDirection: "row",
    alignItems: "center",
  },
  headerContent: { flex: 1 },
  headerTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: CTU_White,
    marginBottom: 4,
  },

  body: { padding: 16, paddingBottom: 32 },

  accountCard: {
    backgroundColor: CTU_White,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    elevation: 2,
    shadowColor: CTU_NavyBlue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    marginBottom: 22,
  },
  accountAvatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: CTU_LightBlue,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  accountName: {
    fontSize: 20,
    fontWeight: "700",
    color: COLOR_TEXT_PRIMARY,
    textAlign: "center",
  },
  accountProvider: {
    fontSize: 13,
    color: CTU_NavyBlue,
    marginTop: 6,
    fontWeight: "600",
    textAlign: "center",
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLOR_TEXT_GRAY,
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 4,
  },

  logoutIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: CTU_Red,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutText: {
    color: CTU_Red,
    fontSize: 16,
    fontWeight: "700",
  },
  logoutSubtext: {
    color: COLOR_TEXT_GRAY,
    fontSize: 12,
    marginTop: 2,
  },

  card: {
    backgroundColor: CTU_White,
    borderRadius: 20,
    overflow: "hidden",
    elevation: 2,
    shadowColor: CTU_NavyBlue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  cardIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: CTU_LightBlue,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: COLOR_TEXT_PRIMARY },
  cardSubtitle: { fontSize: 12, color: COLOR_TEXT_GRAY, marginTop: 2 },

  tuneFieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: COLOR_TEXT_LABEL,
    marginBottom: 8,
    marginTop: 14,
    letterSpacing: 0.2,
  },
  tuneInputWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLOR_BORDER,
    borderRadius: 12,
    backgroundColor: COLOR_BG_INPUT,
    paddingHorizontal: 14,
  },
  tuneInputInner: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 13,
    color: COLOR_TEXT_PRIMARY,
  },
  tuneUnitInner: {
    fontSize: 13,
    fontWeight: "600",
    color: COLOR_TEXT_GRAY,
    paddingLeft: 6,
    paddingVertical: 11,
  },
  tuneHintText: {
    fontSize: 13,
    color: COLOR_TEXT_HINT,
    marginTop: 10,
    lineHeight: 18,
  },
  tuneBottomActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },
  tuneBottomButton: { paddingVertical: 10, paddingHorizontal: 6 },
  tuneBottomButtonTextCancel: { fontSize: 16, fontWeight: "700", color: CTU_Black },
  tuneBottomButtonTextSubmit: { fontSize: 16, fontWeight: "700", color: CTU_NavyBlue },

  modalOverlay: {
    flex: 1,
    backgroundColor: COLOR_OVERLAY,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  settingsModal: {
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
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: "700", color: COLOR_TEXT_PRIMARY, flex: 1 },
});
