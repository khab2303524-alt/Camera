import { getApp, getApps, initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyAabH8aG5ijcx2DbzQrx5CW2yrDZm7qXGs",
  authDomain: "camera-mlx90640.firebaseapp.com",
  databaseURL: "https://camera-mlx90640-default-rtdb.firebaseio.com",
  projectId: "camera-mlx90640",
  storageBucket: "camera-mlx90640.firebasestorage.app",
  messagingSenderId: "549162212380",
  appId: "1:549162212380:web:d3c75f48b832ef0efd53d9",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getDatabase(app);

// initializeAuth chỉ được gọi MỘT LẦN cho mỗi app. Với Fast Refresh trong
// lúc dev, module này có thể được chạy lại trong khi "app" vẫn là cùng một
// instance (do getApps().length ở trên), khiến initializeAuth ném lỗi
// "already-initialized". Bọc try/catch để rơi về getAuth() bình thường
// trong trường hợp đó, tránh app bị crash khi hot-reload.
let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getAuth } = require("firebase/auth");
  authInstance = getAuth(app);
}

export const auth = authInstance;
