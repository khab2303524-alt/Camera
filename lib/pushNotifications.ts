// lib/pushNotifications.ts
// Đăng ký Expo Push Token và lưu lên Firebase RTDB: users/{uid}/push = { token, enabled, platform, updatedAt }
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { ref, set, update } from "firebase/database";
import { Platform } from "react-native";
import { db } from "../config/firebaseConfig";

// Hiện thông báo cả khi app đang mở
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Channel settings are persisted by Android. Use a new id so an old muted or
// low-importance channel cannot silently disable alerts after an app update.
export const ALERT_CHANNEL_ID = "overheat-alerts-v2";

async function setupAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
    name: "Cảnh báo quá nhiệt",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 300, 200, 300],
    lightColor: "#ED1C24",
    sound: "default",
  });
}

/** Xin quyền + lấy token. Trả về null nếu không đủ điều kiện. */
export async function getExpoPushToken(): Promise<string | null> {
  await setupAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") {
    throw new Error("Quyền thông báo chưa được cấp cho ứng dụng.");
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error("Không tìm thấy Expo project ID để đăng ký push token.");
  }

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

/** Bật push: lấy token và lưu lên Firebase. Trả về true nếu thành công. */
export async function enablePush(uid: string): Promise<boolean> {
  const token = await getExpoPushToken();
  if (!token) return false;
  await set(ref(db, `users/${uid}/push`), {
    token,
    enabled: true,
    platform: Platform.OS,
    updatedAt: Date.now(),
  });
  return true;
}

/** Tắt push: giữ token nhưng đặt enabled=false để server bỏ qua. */
export async function disablePush(uid: string): Promise<void> {
  await update(ref(db, `users/${uid}/push`), { enabled: false, updatedAt: Date.now() });
}
