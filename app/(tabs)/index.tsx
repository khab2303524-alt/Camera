import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from "react-native";
import { ref, onValue, off } from "firebase/database";
import { db } from "../../config/firebaseConfig";

type FramePayload = {
  data: string; // base64 JPEG
  timestamp: number;
};

type HistoryItem = {
  key: string; // index trong circular buffer (0..HISTORY_SLOTS-1)
} & FramePayload;

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function ThermalScreen() {
  const [latestFrame, setLatestFrame] = useState<FramePayload | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [selected, setSelected] = useState<FramePayload | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Lắng nghe ảnh mới nhất — cập nhật realtime mỗi khi Python script ghi vào frames/latest
  useEffect(() => {
    const latestRef = ref(db, "frames/latest");

    const handleValue = (snapshot: any) => {
      const val = snapshot.val();
      if (val && val.data) {
        setLatestFrame(val as FramePayload);
        setConnected(true);
      }
    };

    onValue(latestRef, handleValue, (error) => {
      console.error("Loi khi doc frames/latest:", error);
      setConnected(false);
    });

    return () => off(latestRef, "value", handleValue);
  }, []);

  // Lắng nghe lịch sử ảnh (circular buffer) để hiển thị dải thumbnail bên dưới
  useEffect(() => {
    const historyRef = ref(db, "frames/history");

    const handleValue = (snapshot: any) => {
      const val = snapshot.val();
      if (!val) {
        setHistory([]);
        return;
      }
      const items: HistoryItem[] = Object.entries(val)
        .map(([key, v]: [string, any]) => ({ key, ...v }))
        .filter((item) => item.timestamp)
        .sort((a, b) => b.timestamp - a.timestamp); // mới nhất trước
      setHistory(items);
    };

    onValue(historyRef, handleValue, (error) => {
      console.error("Loi khi doc frames/history:", error);
    });

    return () => off(historyRef, "value", handleValue);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // onValue đã tự cập nhật realtime, refresh chỉ để tạo cảm giác thao tác cho người dùng
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("vi-VN", { hour12: false });
  };

  const displayedFrame = selected ?? latestFrame;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Thermal Camera</Text>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: connected ? "#2ecc71" : "#e74c3c" },
            ]}
          />
          <Text style={styles.statusText}>
            {connected ? "Đang kết nối" : "Mất kết nối"}
          </Text>
        </View>
      </View>

      <View style={styles.imageWrapper}>
        {displayedFrame ? (
          <>
            <Image
              source={{ uri: `data:image/jpeg;base64,${displayedFrame.data}` }}
              style={styles.image}
              resizeMode="contain"
            />
            <Text style={styles.timestamp}>
              {formatTime(displayedFrame.timestamp)}
              {selected && selected !== latestFrame ? "  (lịch sử)" : ""}
            </Text>
            {selected && (
              <TouchableOpacity
                style={styles.backToLiveBtn}
                onPress={() => setSelected(null)}
              >
                <Text style={styles.backToLiveText}>← Quay lại ảnh mới nhất</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <ActivityIndicator size="large" color="#888" />
        )}
      </View>

      <Text style={styles.historyLabel}>Lịch sử ({history.length})</Text>
      <FlatList
        data={history}
        horizontal
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.historyList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => setSelected(item)}>
            <Image
              source={{ uri: `data:image/jpeg;base64,${item.data}` }}
              style={[
                styles.thumbnail,
                selected?.timestamp === item.timestamp && styles.thumbnailActive,
              ]}
              resizeMode="cover"
            />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
    paddingTop: 50,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: "#aaa",
    fontSize: 12,
  },
  imageWrapper: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  timestamp: {
    position: "absolute",
    bottom: 8,
    right: 12,
    color: "#fff",
    fontSize: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  backToLiveBtn: {
    position: "absolute",
    top: 8,
    left: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  backToLiveText: {
    color: "#fff",
    fontSize: 12,
  },
  historyLabel: {
    color: "#ccc",
    fontSize: 14,
    marginBottom: 8,
    marginTop: 4,
  },
  historyList: {
    paddingBottom: 24,
  },
  thumbnail: {
    width: SCREEN_WIDTH * 0.22,
    height: SCREEN_WIDTH * 0.16,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  thumbnailActive: {
    borderColor: "#2ecc71",
  },
});
