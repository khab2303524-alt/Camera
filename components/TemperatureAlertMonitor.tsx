import { useAuth } from "@/context/AuthContext";
import { DataSnapshot, off, onValue, ref, set } from "firebase/database";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { db } from "@/config/firebaseConfig";
import { ALERT_CHANNEL_ID } from "@/lib/pushNotifications";

export function TemperatureAlertMonitor() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.uid) return;

    const enabledRef = ref(db, `users/${user.uid}/push/enabled`);
    const alertRef = ref(db, "giamsat/canhbao");
    const dangerRef = ref(db, "giamsat/nguyhiem");
    let pushEnabled = false;
    let resettingAlert = false;
    let resettingDanger = false;

    const handleEnabled = (snapshot: DataSnapshot) => {
      pushEnabled = snapshot.val() === true;
    };

    const notify = async (title: string, body: string, type: string) => {
      const permission = await Notifications.getPermissionsAsync();
      if (permission.status !== "granted") {
        console.warn("Không thể hiển thị cảnh báo: quyền thông báo chưa được cấp.");
        return;
      }
      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: "default", data: { type } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 1,
          repeats: false,
          channelId: ALERT_CHANNEL_ID,
        },
      });
    };

    const handleAlert = async (snapshot: DataSnapshot) => {
      if (snapshot.val() !== true || resettingAlert) return;

      resettingAlert = true;
      try {
        if (pushEnabled) {
          await notify("Cảnh báo quá nhiệt", "Nhiệt độ đã vượt ngưỡng cảnh báo.", "temperature-alert");
        }
        // Raspberry Pi bật cờ; app reset ngay sau khi đã xử lý lần cảnh báo này.
        await set(alertRef, false);
      } catch (error) {
        console.error("Lỗi khi xử lý và reset cảnh báo nhiệt độ:", error);
      } finally {
        resettingAlert = false;
      }
    };

    const handleDanger = async (snapshot: DataSnapshot) => {
      if (snapshot.val() !== true || resettingDanger) return;

      resettingDanger = true;
      try {
        if (pushEnabled) {
          await notify("NGUY HIỂM: nhiệt độ quá cao", "Nhiệt độ đã vượt ngưỡng nguy hiểm!", "temperature-danger");
        }
        await set(dangerRef, false);
      } catch (error) {
        console.error("Lỗi khi xử lý và reset nguy hiểm nhiệt độ:", error);
      } finally {
        resettingDanger = false;
      }
    };

    onValue(enabledRef, handleEnabled, (error) => {
      console.error("Lỗi khi đọc trạng thái thông báo đẩy:", error);
    });
    onValue(alertRef, handleAlert, (error) => {
      console.error("Lỗi khi đọc trạng thái cảnh báo nhiệt độ:", error);
    });
    onValue(dangerRef, handleDanger, (error) => {
      console.error("Lỗi khi đọc trạng thái nguy hiểm nhiệt độ:", error);
    });

    return () => {
      off(enabledRef, "value", handleEnabled);
      off(alertRef, "value", handleAlert);
      off(dangerRef, "value", handleDanger);
    };
  }, [user?.uid]);

  return null;
}
