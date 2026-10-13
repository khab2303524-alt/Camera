import Ionicons from "@expo/vector-icons/Ionicons";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from "react-native";
import { appAlert } from "../components/AppDialog";
import { useAuth } from "../context/AuthContext";

// Bảng màu đồng bộ toàn bộ app (Tone CTU & UI Template)
const CTU_NavyBlue = "#1F5CA9";
const CTU_SkyBlue = "#00AFEF";
const CTU_Red = "#ED1C24";
const CTU_White = "#FFFFFF";
const CTU_Black = "#000000";
const COLOR_TEXT_PRIMARY = "#11181C";
const COLOR_TEXT_HINT = "#64748B";
const COLOR_TEXT_GRAY = "#7A8FAD";
const COLOR_PLACEHOLDER = "#7A8FAD";
const COLOR_BG_LOGIN = "#F7FBFE";
const COLOR_BG_CARD = "#EEF2F7";
const COLOR_BORDER = "#E2E8F0";
const COLOR_OVERLAY = "rgba(0, 0, 0, 0.45)";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

function mapAuthError(code?: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "Email không hợp lệ.";
    case "auth/missing-password":
      return "Vui lòng nhập mật khẩu.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email hoặc mật khẩu không đúng.";
    case "auth/email-already-in-use":
      return "Email này đã được đăng ký.";
    case "auth/weak-password":
      return "Mật khẩu quá yếu (tối thiểu 6 ký tự).";
    case "auth/too-many-requests":
      return "Thử quá nhiều lần, vui lòng đợi một lúc rồi thử lại.";
    case "auth/network-request-failed":
      return "Lỗi mạng, kiểm tra kết nối internet.";
    default:
      return "Có lỗi xảy ra, vui lòng thử lại.";
  }
}

// Ô nhập kiểu gạch chân: icon bên trái, đường gạch nét đứt bên dưới,
// phần tử tùy chọn bên phải (VD: nút ẩn/hiện mật khẩu).
const Field = ({
  icon,
  right,
  ...props
}: TextInputProps & { icon: IoniconName; right?: React.ReactNode }) => (
  <View style={styles.field}>
    <Ionicons name={icon} size={28} color={CTU_NavyBlue} />
    <View style={styles.fieldLine}>
      <TextInput
        style={styles.fieldInput}
        placeholderTextColor={COLOR_PLACEHOLDER}
        {...props}
      />
      {right}
    </View>
  </View>
);

export default function LoginScreen() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Modal quên mật khẩu
  const [resetVisible, setResetVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState("");
  const [sendingReset, setSendingReset] = useState(false);

  const isRegister = mode === "register";

  const googleSignIn = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      console.log("Google sign-in error:", e?.code, e?.message);
      setError(mapAuthError(e?.code));
    } finally {
      setLoading(false);
    }
  };

  // Quên mật khẩu: mở modal, nhập email (điền sẵn email đang gõ ở ô Email) rồi gửi link đặt lại.
  const forgotPassword = () => {
    setError("");
    setResetEmail(email.trim());
    setResetError("");
    setResetVisible(true);
  };

  const sendReset = async () => {
    const addr = resetEmail.trim();
    if (!addr) {
      setResetError("Vui lòng nhập email.");
      return;
    }
    setResetError("");
    setSendingReset(true);
    try {
      await sendPasswordResetEmail(getAuth(), addr);
      setResetVisible(false);
      appAlert("Đã gửi email", `Vui lòng kiểm tra hộp thư ${addr} để đặt lại mật khẩu.`);
    } catch (e: any) {
      console.log("Reset password error:", e?.code, e?.message);
      setResetError(
        e?.code === "auth/user-not-found"
          ? "Không tìm thấy tài khoản với email này."
          : mapAuthError(e?.code)
      );
    } finally {
      setSendingReset(false);
    }
  };

  const submit = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError("Vui lòng nhập email và mật khẩu.");
      return;
    }
    if (isRegister && password !== confirm) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }
    setLoading(true);
    try {
      if (isRegister) await signUp(email, password, name);
      else await signIn(email, password);
      // Đăng nhập thành công -> AuthGuard trong app/_layout.tsx tự chuyển vào (tabs)
    } catch (e: any) {
      setError(mapAuthError(e?.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor={COLOR_BG_LOGIN} />

      {/* Họa tiết nền rất nhạt
      <View pointerEvents="none" style={styles.decoLayer}>
        <View style={[styles.deco, styles.decoTop]} />
        <View style={[styles.deco, styles.decoBottom]} />
      </View> */}

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Phần đầu: lời chào + logo */}
        <View style={styles.hero}>
          {!isRegister && <Text style={styles.heroGreeting}>Xin chào!</Text>}
          <Text style={styles.heroTitle}>{isRegister ? "Tạo tài khoản" : "Đăng nhập"}</Text>
        </View>

        {/* Khung nhập liệu */}
        <View style={styles.card}>
          {isRegister && (
            <Field
              icon="person-circle-outline"
              placeholder="Tên hiển thị"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          )}

          <Field
            icon="mail-outline"
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <Field
            icon="lock-closed-outline"
            placeholder="Mật khẩu"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPw}
            autoCapitalize="none"
            right={
              <TouchableOpacity
                onPress={() => setShowPw((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showPw ? "eye-off-outline" : "eye-outline"}
                  size={24}
                  color={CTU_SkyBlue}
                />
              </TouchableOpacity>
            }
          />

          {isRegister && (
            <Field
              icon="lock-closed-outline"
              placeholder="Nhập lại mật khẩu"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry={!showPw}
              autoCapitalize="none"
            />
          )}
        </View>

        {!isRegister && (
          <TouchableOpacity onPress={forgotPassword} disabled={loading} style={styles.forgot}>
            <Text style={styles.link}>Quên mật khẩu?</Text>
          </TouchableOpacity>
        )}

        {!!error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color={CTU_Red} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={submit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={CTU_White} />
          ) : (
            <Text style={styles.buttonText}>{isRegister ? "Đăng ký" : "Đăng nhập"}</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.orText}>Hoặc đăng nhập bằng</Text>

        <TouchableOpacity
          style={[styles.googleButton, loading && styles.buttonDisabled]}
          onPress={googleSignIn}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Image
            source={require("../assets/images/google-logo.png")}
            style={styles.googleIcon}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setMode(isRegister ? "login" : "register");
            setError("");
          }}
        >
          <Text style={styles.switchText}>
            {isRegister ? "Đã có tài khoản? " : "Chưa có tài khoản? "}
            <Text style={styles.switchLink}>{isRegister ? "Đăng nhập" : "Đăng ký"}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal quên mật khẩu */}
      <Modal
        visible={resetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !sendingReset && setResetVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !sendingReset && setResetVisible(false)}
        >
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Ionicons name="key-outline" size={22} color={CTU_NavyBlue} />
              <Text style={styles.modalTitle} numberOfLines={1}>
                Quên mật khẩu
              </Text>
              <TouchableOpacity
                onPress={() => setResetVisible(false)}
                disabled={sendingReset}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={COLOR_TEXT_GRAY} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalHint}>
              Nhập email tài khoản, chúng tôi sẽ gửi link đặt lại mật khẩu.
            </Text>

            <View style={{ marginTop: 14 }}>
              <Field
                icon="mail-outline"
                placeholder="Email"
                value={resetEmail}
                onChangeText={setResetEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoFocus
                onSubmitEditing={sendReset}
              />
            </View>

            {!!resetError && (
              <View style={[styles.errorBox, { marginTop: 0, marginBottom: 0 }]}>
                <Ionicons name="alert-circle-outline" size={18} color={CTU_Red} />
                <Text style={styles.errorText}>{resetError}</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setResetVisible(false)}
                disabled={sendingReset}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={sendReset}
                disabled={sendingReset}
                activeOpacity={0.7}
              >
                {sendingReset ? (
                  <ActivityIndicator size="small" color={CTU_NavyBlue} />
                ) : (
                  <Text style={styles.modalSubmitText}>Gửi</Text>
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
  flex: { flex: 1, backgroundColor: COLOR_BG_LOGIN },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingTop: 150,
    paddingBottom: 42,
  },

  decoLayer: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  deco: { position: "absolute", borderRadius: 999 },
  decoTop: {
    width: 420,
    height: 420,
    top: -150,
    alignSelf: "center",
    left: -10,
    backgroundColor: CTU_SkyBlue,
    opacity: 0.05,
  },
  decoBottom: {
    width: 460,
    height: 460,
    bottom: -220,
    right: -140,
    backgroundColor: CTU_NavyBlue,
    opacity: 0.04,
  },

  hero: { alignItems: "center", marginBottom: 26, transform: [{ translateY: -48 }] },
  heroGreeting: { fontSize: 20, color: "#555", fontWeight: "400" },
  heroTitle: { fontSize: 28, fontWeight: "700", color: CTU_NavyBlue, marginTop: 2 },
  logoImage: { width: 120, height: 120, marginTop: 14 },

  card: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 440,
    backgroundColor: COLOR_BG_CARD,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 8,
  },

  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  fieldLine: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderStyle: "solid",
    borderColor: CTU_NavyBlue,
  },
  fieldInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 16,
    color: COLOR_TEXT_PRIMARY,
  },

  forgot: { alignSelf: "flex-end", marginTop: 12, marginRight: 4 },
  link: { color: CTU_NavyBlue, fontWeight: "600", fontSize: 14 },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FDECEA",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  errorText: { flex: 1, color: CTU_Red, fontSize: 13, fontWeight: "600" },

  button: {
    backgroundColor: CTU_NavyBlue,
    borderRadius: 22,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: CTU_White, fontSize: 18, fontWeight: "700" },

  orText: {
    textAlign: "center",
    color: COLOR_TEXT_PRIMARY,
    fontSize: 16,
    marginTop: 26,
    marginBottom: 14,
  },

  googleButton: {
    alignSelf: "center",
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: COLOR_BORDER,
    backgroundColor: CTU_White,
    alignItems: "center",
    justifyContent: "center",
  },
  googleIcon: { width: 28, height: 28 },

  switchText: { textAlign: "center", marginTop: 28, color: COLOR_TEXT_PRIMARY, fontSize: 16 },
  switchLink: { color: CTU_NavyBlue, fontWeight: "700", fontSize: 16 },

  modalOverlay: {
    flex: 1,
    backgroundColor: COLOR_OVERLAY,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalBox: {
    backgroundColor: CTU_White,
    borderRadius: 20,
    padding: 20,
    width: "100%",
    maxWidth: 420,
    elevation: 8,
    shadowColor: CTU_Black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  modalTitle: { fontSize: 16, fontWeight: "700", color: COLOR_TEXT_PRIMARY, flex: 1 },
  modalHint: { fontSize: 13, color: COLOR_TEXT_HINT, marginTop: 12, lineHeight: 18 },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },
  modalButton: { paddingVertical: 10, paddingHorizontal: 6 },
  modalCancelText: { fontSize: 16, fontWeight: "700", color: CTU_Black },
  modalSubmitText: { fontSize: 16, fontWeight: "700", color: CTU_NavyBlue },
});
