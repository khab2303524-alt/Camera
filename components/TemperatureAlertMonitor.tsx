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
    let pushEnabled = false;
    let resettingAlert = false;

    const handleEnabled = (snapshot: DataSnapshot) => {
      pushEnabled = snapshot.val() === true;
    };

    const handleAlert = async (snapshot: DataSnapshot) => {
      const alertActive = snapshot.val() === true;
      if (!alertActive || resettingAlert) return;

      resettingAlert = true;
      try {
        if (pushEnabled) {
          const permission = await Notifications.getPermissionsAsync();
          if (permission.status !== "granted") {
            console.warn("Không thể hiển thị cảnh báo: quyền thông báo chưa được cấp.");
          } else {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: "Cảnh báo quá nhiệt",
                body: "Nhiệt độ đã vượt ngưỡng cảnh báo.",
                sound: "default",
                data: { type: "temperature-alert" },
              },
              trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: 1,
                repeats: false,
                channelId: ALERT_CHANNEL_ID,
              },
            });
          }
        }

        // Raspberry Pi bật cờ; app reset ngay sau khi đã xử lý lần cảnh báo này.
        await set(alertRef, false);
      } catch (error) {
        console.error("Lỗi khi xử lý và reset cảnh báo nhiệt độ:", error);
      } finally {
        resettingAlert = false;
      }
    };

    onValue(enabledRef, handleEnabled, (error) => {
      console.error("Lỗi khi đọc trạng thái thông báo đẩy:", error);
    });
    onValue(alertRef, handleAlert, (error) => {
      console.error("Lỗi khi đọc trạng thái cảnh báo nhiệt độ:", error);
    });

    return () => {
      off(enabledRef, "value", handleEnabled);
      off(alertRef, "value", handleAlert);
    };
  }, [user?.uid]);

  return null;
}
