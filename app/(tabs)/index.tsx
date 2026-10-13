import { off, onValue, ref } from "firebase/database";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../config/firebaseConfig";

// URL Web App của Apps Script (phải trùng với URL_APPS_SCRIPT trong file Python).
// Nếu deploy lại và URL đổi thì nhớ cập nhật ở cả 2 nơi.
const URL_APPS_SCRIPT =
  "https://script.google.com/macros/s/AKfycbw0rQpHJ_u_DuJeVTMfl7N9vm-7zNbaoy-1Y4TWQ1P_2aX1HPKtLMBKjHPQKJK4vyRZfw/exec";
const SO_LO_LICH_SU_TOIDA = 500; // mỗi lô = 1 phút (~60 ảnh); Apps Script giữ 8 giờ ≈ 480 lô
const TOC_DO_PHAT_MS = 1000; // phát lại lô: 1 ảnh/giây (đúng nhịp Pi chụp)
const CHU_KY_LAM_MOI_MS = 60000; // 60s: nhịp tự động lấy lại danh sách ảnh lịch sử
// Quá ngần này ms kể từ lúc ĐIỆN THOẠI nhận được ảnh mới gần nhất mà chưa có ảnh mới => mất kết nối.
// Tính theo giờ nhận trên điện thoại (không dùng timestamp của Pi) nên không bị lệch đồng hồ.
// Camera gửi ảnh mỗi ~1s; Pi đôi khi khựng vài giây khi đẩy lô lên Drive => để dư 15s.
const NGUONG_MAT_KET_NOI_MS = 10000;

// Bảng màu đồng bộ với app (theo tone CTU)
const CTU_NavyBlue = "#1F5CA9";
const CTU_SkyBlue = "#00AFEF";
const CTU_Gold = "#FFF200";
const CTU_LightBlue = "#E8F4FB";
const CTU_Red = "#ED1C24";
const COLOR_GREEN = "#22C55E";
const CTU_White = "#FFFFFF";
const CTU_TextDark = "#1B1B1F";

type FramePayload = {
  data: string; // base64 JPEG
  timestamp: number;
};

// Lịch sử lưu theo "lô" mỗi phút trên Google Drive (qua Apps Script):
// danh sách chỉ có thời gian + nhiệt độ max; bấm vào một lô mới tải ~60 ảnh của phút đó.
type HistoryItem = {
  key: string; // tên file lô trên Drive
  start: number; // ms, ảnh đầu lô
  end: number; // ms, ảnh cuối lô
  maxTemp: number | null;
  thumbnailUrl: string | null; // ảnh nhiệt đầu tiên của lô (Drive); null với lô cũ chưa có ảnh
  thumbnailId: string | null; // id file ảnh đại diện trên Drive (dùng link dự phòng)
};

type LoFrame = {
  ts: number;
  max: number;
  tmin?: number; // biên thang màu của khung này (°C)
  tmax?: number;
  d: string; // base64 JPEG
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const CARD_WIDTH = SCREEN_WIDTH - 32;
const THUMB_WIDTH = 84;
const THUMB_HEIGHT = THUMB_WIDTH * (3 / 4); // tỉ lệ 4:3 giống ảnh nhiệt

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleTimeString("vi-VN", { hour12: false });
};

const mmss = (ms: number) => {
  const tong = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(tong / 60);
  const sec = tong % 60;
  return `${m}:${sec < 10 ? "0" : ""}${sec}`;
};

const formatClock = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleTimeString("vi-VN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Hiển thị ảnh "không chớp": giữ ảnh cũ trên màn hình, nạp ảnh mới ở lớp ẩn phía sau,
// chỉ đổi sang ảnh mới SAU KHI nó đã giải mã xong (onLoad). Nhờ vậy giữa 2 ảnh
// không có khoảnh khắc trống như khi đổi thẳng source của <Image>.
type FrameViewProps = {
  uri: string;
  style?: any;
};

const FrameView = memo(function FrameView({ uri, style }: FrameViewProps) {
  const [shown, setShown] = useState<string | null>(null); // ảnh đang hiển thị (đã nạp xong)

  return (
    <View style={style}>
      {shown !== null && (
        <Image
          source={{ uri: shown }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          fadeDuration={0}
        />
      )}
      {uri !== shown && (
        // Lớp nạp ngầm: gần như trong suốt (không dùng đúng 0 vì một số máy Android
        // bỏ qua việc nạp view có opacity = 0).
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { opacity: 0.01 }]}
          resizeMode="contain"
          fadeDuration={0}
          onLoad={() => setShown(uri)}
        />
      )}
    </View>
  );
});

// Danh sách lịch sử tách riêng + React.memo: khi có ảnh mới mỗi ~giây (hoặc "now" đổi)
// thì danh sách này KHÔNG bị render lại, nhường thời gian cho việc vẽ ảnh trực tiếp.
type HistoryListProps = {
  history: HistoryItem[];
  selectedKey: string | null;
  onSelect: (item: HistoryItem) => void;
  refreshing: boolean;
  onRefresh: () => void;
};

// Ảnh đại diện của 1 lô: thử link thumbnail của Drive, lỗi thì thử link tải trực tiếp file
// (ảnh vốn đã nhỏ), lỗi nữa thì hiện giờ thay vì để ô đen trống.
const Thumb = memo(function Thumb({ item }: { item: HistoryItem }) {
  const [lan, setLan] = useState(0);

  const nguon: string[] = [];
  if (item.thumbnailUrl) nguon.push(item.thumbnailUrl);
  if (item.thumbnailId) {
    nguon.push(`https://drive.google.com/uc?export=view&id=${item.thumbnailId}`);
  }

  const uri = nguon[lan];
  if (!uri) {
    return (
      <View style={styles.thumbFallback}>
        <Text style={styles.itemClock} allowFontScaling={false}>
          {formatClock(item.start)}
        </Text>
        <Text style={styles.thumbReason} allowFontScaling={false}>
          {nguon.length === 0 ? "Chưa có ảnh" : "Tải ảnh lỗi"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.thumbnailWrapper}>
      <Image
        source={{ uri }}
        style={styles.thumbnail}
        resizeMode="contain"
        onError={() => setLan((l) => l + 1)}
      />
    </View>
  );
});

const HistoryList = memo(function HistoryList({
  history,
  selectedKey,
  onSelect,
  refreshing,
  onRefresh,
}: HistoryListProps) {
  return (
    <FlatList
      key="history-list-1col"
      data={history}
      keyExtractor={(item) => item.key}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.historyList}
      initialNumToRender={12}
      windowSize={7}
      removeClippedSubviews
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={CTU_NavyBlue}
          colors={[CTU_NavyBlue]}
        />
      }
      renderItem={({ item }) => {
        const active = selectedKey === item.key;
        return (
          <TouchableOpacity
            onPress={() => onSelect(item)}
            activeOpacity={0.8}
            style={styles.itemContainer}
          >
            <View style={styles.itemTimeBlock}>
              <Thumb item={item} />
            </View>
            <View style={[styles.itemRight, active && styles.itemRightActive]}>
              <View style={styles.itemInfo}>
                <Text
                  style={[styles.itemTitle, active && styles.itemTitleActive]}
                  numberOfLines={1}
                  allowFontScaling={false}
                >
                  {formatTime(item.start)} – {formatTime(item.end)}
                </Text>
                {item.maxTemp != null && (
                  <Text
                    style={[styles.itemTemp, active && styles.itemTempActive]}
                  >
                    Max: {item.maxTemp}°C
                  </Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
});

export default function ThermalScreen() {
  const [latestFrame, setLatestFrame] = useState<FramePayload | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [listenError, setListenError] = useState(false);
  const [now, setNow] = useState(() => Date.now()); // đồng hồ để tính độ "cũ" của ảnh
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);

  // Phát lại 1 lô lịch sử
  const [loData, setLoData] = useState<{
    key: string;
    frames: LoFrame[];
  } | null>(null);
  const [loIndex, setLoIndex] = useState(0);
  const [dangPhat, setDangPhat] = useState(false);
  const [dangTaiLo, setDangTaiLo] = useState(false);
  const [loiTaiLo, setLoiTaiLo] = useState(false);
  const [barWidth, setBarWidth] = useState(0);
  const cacheLo = useRef<Record<string, LoFrame[]>>({});

  const lastTsRef = useRef(0);
  // Giờ (trên điện thoại) lúc nhận được ảnh MỚI gần nhất — dùng để xét "còn kết nối".
  const [lastArrival, setLastArrival] = useState(0);

  useEffect(() => {
    const latestRef = ref(db, "hinhanh/moinhat");

    const handleValue = (snapshot: any) => {
      const val = snapshot.val();
      if (val && val.data) {
        // Bỏ qua dữ liệu trùng (cùng timestamp) để không render + giải mã lại ảnh vô ích.
        if (val.timestamp === lastTsRef.current) return;
        // Lần đầu Firebase thường trả ảnh cũ trong cache => chưa tính là "đang kết nối";
        // phải thấy thêm 1 ảnh có timestamp khác thì mới chắc camera đang gửi.
        const laLanDau = lastTsRef.current === 0;
        lastTsRef.current = val.timestamp;
        setLatestFrame(val as FramePayload);
        if (!laLanDau) setLastArrival(Date.now());
        setListenError(false);
      }
    };

    onValue(latestRef, handleValue, (error) => {
      console.error("Loi khi doc frames/latest:", error);
      setListenError(true);
    });

    return () => off(latestRef, "value", handleValue);
  }, []);

  // Mỗi giây cập nhật "now" để trạng thái tự chuyển sang "Mất kết nối"
  // khi không còn ảnh mới (không cần Firebase phát sự kiện).
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Kết nối = đọc Firebase không lỗi VÀ vừa nhận được ảnh mới trong NGUONG_MAT_KET_NOI_MS.
  // Không so timestamp của Pi với đồng hồ điện thoại vì 2 đồng hồ có thể lệch nhau vài giây,
  // làm trạng thái nhảy qua lại quanh ngưỡng.
  const connected =
    !listenError &&
    lastArrival > 0 &&
    now - lastArrival <= NGUONG_MAT_KET_NOI_MS;

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(
        `${URL_APPS_SCRIPT}?limit=${SO_LO_LICH_SU_TOIDA}`
      );

      // Apps Script đôi khi bận (Pi đang gửi ảnh cùng lúc) và trả về
      // trang HTML lỗi thay vì JSON — bỏ qua lần này, đợi lần poll sau.
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("application/json")) {
        console.warn("[Drive] Apps Script tam thoi ban, bo qua lan lay nay");
        return;
      }

      const json = await res.json();

      if (json.status !== "ok") {
        console.warn("Loi tu Apps Script:", json.message);
        return;
      }

      const items: HistoryItem[] = (json.items || []).map((it: any) => ({
        key: it.key,
        start: it.start,
        end: it.end,
        maxTemp: it.maxTemp ?? null,
        thumbnailUrl: it.thumbnailUrl ?? null,
        thumbnailId: it.thumbnailId ?? null,
      }));
      setHistory(items);
    } catch (error) {
      console.warn("Loi khi lay anh lich su tu Drive:", error);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    const timer = setInterval(fetchHistory, CHU_KY_LAM_MOI_MS);
    return () => clearInterval(timer);
  }, [fetchHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  }, [fetchHistory]);

  // Tải nội dung 1 lô (~60 ảnh). Giữ cache vài lô gần nhất để bấm lại không phải tải lại.
  const taiLo = useCallback(async (key: string): Promise<LoFrame[]> => {
    const cache = cacheLo.current;
    if (cache[key]) return cache[key];

    const res = await fetch(`${URL_APPS_SCRIPT}?lo=${encodeURIComponent(key)}`);
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok || !contentType.includes("application/json")) {
      throw new Error("Apps Script tam thoi ban");
    }
    const json = await res.json();
    if (json.status === "error") throw new Error(json.message);

    const frames: LoFrame[] = json.frames || [];
    const keys = Object.keys(cache);
    if (keys.length >= 5) delete cache[keys[0]];
    cache[key] = frames;
    return frames;
  }, []);

  useEffect(() => {
    if (!selected) {
      setLoData(null);
      setLoIndex(0);
      setDangPhat(false);
      setDangTaiLo(false);
      setLoiTaiLo(false);
      return;
    }

    let huy = false;
    setDangTaiLo(true);
    setLoiTaiLo(false);
    setDangPhat(false);

    taiLo(selected.key)
      .then((frames) => {
        if (huy) return;
        setLoData({ key: selected.key, frames });
        setLoIndex(0);
        setDangTaiLo(false);
        setDangPhat(frames.length > 1);
      })
      .catch((err) => {
        if (huy) return;
        console.warn("Loi khi tai lo anh:", err);
        setDangTaiLo(false);
        setLoiTaiLo(true);
      });

    return () => {
      huy = true;
    };
  }, [selected, taiLo]);

  const soAnhLo = loData ? loData.frames.length : 0;

  useEffect(() => {
    if (!dangPhat || soAnhLo < 2) return;
    const timer = setInterval(() => {
      setLoIndex((i) => Math.min(i + 1, soAnhLo - 1));
    }, TOC_DO_PHAT_MS);
    return () => clearInterval(timer);
  }, [dangPhat, soAnhLo]);

  useEffect(() => {
    if (soAnhLo > 0 && loIndex >= soAnhLo - 1) setDangPhat(false);
  }, [loIndex, soAnhLo]);

  const onBamPhat = useCallback(() => {
    if (soAnhLo === 0) return;
    if (dangPhat) {
      setDangPhat(false);
      return;
    }
    if (loIndex >= soAnhLo - 1) setLoIndex(0);
    setDangPhat(true);
  }, [dangPhat, loIndex, soAnhLo]);

  const buocAnh = useCallback(
    (delta: number) => {
      setDangPhat(false);
      setLoIndex((i) => Math.max(0, Math.min(soAnhLo - 1, i + delta)));
    },
    [soAnhLo]
  );

  // Ảnh mới nhất (Firebase) là base64; ảnh lịch sử (Drive) là URL —
  // gộp về 1 dạng chung để phần hiển thị không cần biết nguồn gốc.
  // useMemo: chuỗi data-URI (vài chục KB) chỉ được ghép 1 lần cho mỗi ảnh mới, không ghép lại
  // mỗi lần "now" đổi (1 giây/lần); object source ổn định để <Image> không bị nạp lại.
  const displayedFrame = useMemo(() => {
    if (selected && loData && loData.key === selected.key) {
      const fr = loData.frames[loIndex];
      if (fr) {
        return {
          uri: `data:image/jpeg;base64,${fr.d}`,
          timestamp: fr.ts,
          isHistory: true,
          extra: `Max ${fr.max}°C`,
        };
      }
    }
    if (latestFrame) {
      return {
        uri: `data:image/jpeg;base64,${latestFrame.data}`,
        timestamp: latestFrame.timestamp,
        isHistory: false,
        extra: null as string | null,
      };
    }
    return null;
  }, [selected, loData, loIndex, latestFrame]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={CTU_NavyBlue} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Giám sát</Text>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: connected ? COLOR_GREEN : CTU_Red },
            ]}
          />
          <Text style={styles.statusText}>
            {connected ? "Đã kết nối" : "Mất kết nối"}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        {/* Khung hiển thị ảnh lớn - nền đen bao quanh 4 cạnh */}
        <View style={styles.imageWrapper}>
          {displayedFrame ? (
            <>
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.badge,
                    displayedFrame.isHistory
                      ? styles.badgeHistory
                      : styles.badgeLive,
                  ]}
                >
                  {!displayedFrame.isHistory && (
                    <View style={styles.badgeDot} />
                  )}
                  <Text
                    style={[
                      styles.badgeText,
                      displayedFrame.isHistory && styles.badgeTextHistory,
                    ]}
                    allowFontScaling={false}
                  >
                    {displayedFrame.isHistory ? "LỊCH SỬ" : "TRỰC TIẾP"}
                  </Text>
                </View>
                <View style={styles.badgeRight}>
                  <View style={styles.badgeTime}>
                    <Text style={styles.badgeTimeText} allowFontScaling={false}>
                      {formatTime(displayedFrame.timestamp)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.zoomBtn}
                    onPress={() => setFullscreenVisible(true)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.zoomBtnText}>⛶</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <FrameView uri={displayedFrame.uri} style={styles.image} />
            </>
          ) : (
            <ActivityIndicator size="large" color={CTU_SkyBlue} />
          )}
        </View>

        {/* Bảng điều khiển phát lại: chỉ hiện khi đang xem một lô lịch sử */}
        {selected && (
          <View style={styles.playerCard}>
            <View style={styles.playerHead}>
              <TouchableOpacity
                style={styles.liveBtn}
                onPress={() => setSelected(null)}
                activeOpacity={0.8}
              >
                <View style={styles.liveBtnArrow} />
                <Text style={styles.liveBtnText} allowFontScaling={false}>
                  Trực tiếp
                </Text>
              </TouchableOpacity>
              <View style={styles.playerHeadText}>
                <Text
                  style={styles.playerTitle}
                  numberOfLines={1}
                  allowFontScaling={false}
                >
                  {formatClock(selected.start)} – {formatClock(selected.end)}
                </Text>
                {displayedFrame?.extra ? (
                  <Text
                    style={styles.playerExtra}
                    numberOfLines={1}
                    allowFontScaling={false}
                  >
                    {displayedFrame.extra}
                  </Text>
                ) : null}
              </View>
            </View>

            {dangTaiLo && (
              <View style={styles.playerStatusRow}>
                <ActivityIndicator size="small" color={CTU_NavyBlue} />
                <Text style={[styles.playerNote, styles.playerLoadingText]}>
                  Đang tải ảnh...
                </Text>
              </View>
            )}
            {loiTaiLo && (
              <Text style={[styles.playerNote, { color: CTU_Red }]}>
                Không tải được ảnh, thử lại sau ít giây.
              </Text>
            )}

            {!dangTaiLo &&
              !loiTaiLo &&
              soAnhLo > 0 &&
              loData &&
              loData.key === selected.key && (
                <>
                  <TouchableOpacity
                    activeOpacity={1}
                    style={styles.progressTouch}
                    onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
                    onPress={(e) => {
                      if (barWidth <= 0) return;
                      const ratio = e.nativeEvent.locationX / barWidth;
                      setDangPhat(false);
                      setLoIndex(
                        Math.max(
                          0,
                          Math.min(soAnhLo - 1, Math.floor(ratio * soAnhLo))
                        )
                      );
                    }}
                  >
                    <View style={styles.progressTrack} pointerEvents="none">
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${((loIndex + 1) / soAnhLo) * 100}%` },
                        ]}
                      />
                    </View>
                  </TouchableOpacity>

                  <View style={styles.controlsRow}>
                    <Text style={styles.playerTime} allowFontScaling={false}>
                      {mmss(loData.frames[loIndex].ts - loData.frames[0].ts)} /{" "}
                      {mmss(
                        loData.frames[soAnhLo - 1].ts - loData.frames[0].ts
                      )}
                    </Text>
                    <View style={styles.controlsCenter}>
                      <TouchableOpacity
                        onPress={() => buocAnh(-1)}
                        style={styles.ctrlBtn}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.ctrlBtnText} allowFontScaling={false}>
                          −1s
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={onBamPhat}
                        style={styles.ctrlPlay}
                        activeOpacity={0.8}
                      >
                        {dangPhat ? (
                          <View style={styles.pauseIcon}>
                            <View style={styles.pauseBar} />
                            <View style={styles.pauseBar} />
                          </View>
                        ) : (
                          <View style={styles.playIcon} />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => buocAnh(1)}
                        style={styles.ctrlBtn}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.ctrlBtnText} allowFontScaling={false}>
                          +1s
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <Text
                      style={[styles.playerTime, styles.playerTimeRight]}
                      allowFontScaling={false}
                    >
                      {loIndex + 1}/{soAnhLo}
                    </Text>
                  </View>
                </>
              )}
          </View>
        )}

        <View style={styles.historyHeader}>
          <Text style={styles.historyLabel}>
            Lịch sử ({history.length})
          </Text>
          <Text style={styles.historyHint}>Chọn thẻ muốn xem</Text>
        </View>

        {/* Danh sách lịch sử hiển thị dạng lưới cuộn dọc */}
        <HistoryList
          history={history}
          selectedKey={selected?.key ?? null}
          onSelect={setSelected}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      </View>

      {/* Xem toàn màn hình, ảnh xoay ngang cho dễ nhìn */}
      <Modal
        visible={fullscreenVisible}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFullscreenVisible(false)}
      >
        <View style={styles.fullscreenContainer}>
          {displayedFrame && (
            <FrameView
              uri={displayedFrame.uri}
              style={styles.fullscreenImage}
            />
          )}
          <TouchableOpacity
            style={styles.fullscreenCloseBtn}
            onPress={() => setFullscreenVisible(false)}
            activeOpacity={0.75}
          >
            <Text style={styles.fullscreenCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CTU_LightBlue,
  },
  header: {
    backgroundColor: CTU_NavyBlue,
    paddingTop: 54,
    paddingBottom: 18,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    color: CTU_White,
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
    color: CTU_White,
    fontSize: 12,
    opacity: 0.85,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  imageWrapper: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: "#000000",
    borderRadius: 16,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "stretch",
    padding: 10,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  image: {
    flex: 1,
    width: "100%",
  },
  zoomBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginLeft: 8,
    backgroundColor: "rgba(255,255,255,0.14)",
    justifyContent: "center",
    alignItems: "center",
  },
  zoomBtnText: {
    color: CTU_White,
    fontSize: 16,
    lineHeight: 18,
  },
  badgeRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  infoLeft: {
    flex: 1,
    alignItems: "flex-start",
  },
  textOnlyRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  textOnlyBtn: {
    color: CTU_NavyBlue,
    fontSize: 13,
    fontWeight: "600",
  },
  textOnlyLabel: {
    color: CTU_TextDark,
    fontSize: 13,
    fontWeight: "600",
  },
  backToLiveArrow: {
    width: 0,
    height: 0,
    marginRight: 6,
    backgroundColor: "transparent",
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderRightWidth: 6,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: CTU_NavyBlue,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  thumbReason: {
    color: "#8E9BB5",
    fontSize: 10,
    marginTop: 2,
  },
  itemClock: {
    color: CTU_White,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  playerBox: {
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  playerBtn: {
    minWidth: 38,
    height: 34,
    borderRadius: 8,
    backgroundColor: CTU_NavyBlue,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    paddingHorizontal: 6,
  },
  playerBtnText: {
    color: CTU_White,
    fontSize: 13,
    fontWeight: "700",
  },
  progressTouch: {
    height: 26,
    justifyContent: "center",
    marginTop: 8,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D5DDEC",
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: CTU_NavyBlue,
  },
  playerCount: {
    color: CTU_TextDark,
    fontSize: 12,
    fontWeight: "600",
    minWidth: 44,
    textAlign: "right",
  },
  playerNote: {
    color: CTU_TextDark,
    fontSize: 12,
    marginTop: 4,
  },
  badgeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 28,
  },
  badgeLive: {
    backgroundColor: "rgba(34,197,94,0.22)",
  },
  badgeHistory: {
    backgroundColor: CTU_Gold,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLOR_GREEN,
    marginRight: 6,
  },
  badgeText: {
    color: CTU_White,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  badgeTextHistory: {
    color: CTU_TextDark,
  },
  badgeTime: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 28,
    justifyContent: "center",
  },
  badgeTimeText: {
    color: CTU_White,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.4,
    fontVariant: ["tabular-nums"],
  },
  playerCard: {
    backgroundColor: CTU_White,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  playerHead: {
    flexDirection: "row",
    alignItems: "center",
  },
  playerHeadText: {
    flex: 1,
    marginLeft: 12,
  },
  playerTitle: {
    color: CTU_TextDark,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "right",
  },
  playerExtra: {
    color: "#5B6785",
    fontSize: 12,
    marginTop: 2,
    textAlign: "right",
  },
  liveBtn: {
    flexDirection: "row",
    alignItems: "center",
    height: 34,
    borderRadius: 17,
    backgroundColor: CTU_LightBlue,
    paddingHorizontal: 14,
  },
  liveBtnArrow: {
    width: 0,
    height: 0,
    marginRight: 7,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderRightWidth: 7,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: CTU_NavyBlue,
  },
  liveBtnText: {
    color: CTU_NavyBlue,
    fontSize: 13,
    fontWeight: "800",
  },
  playerLoadingText: {
    marginTop: 0,
    marginLeft: 8,
  },
  playerStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  controlsCenter: {
    flexDirection: "row",
    alignItems: "center",
  },
  ctrlBtn: {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 10,
    backgroundColor: CTU_LightBlue,
    justifyContent: "center",
    alignItems: "center",
  },
  ctrlBtnText: {
    color: CTU_NavyBlue,
    fontSize: 12,
    fontWeight: "800",
  },
  ctrlPlay: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: CTU_NavyBlue,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 8,
  },
  // Icon vẽ bằng View để "phát" và "dừng" luôn cùng kích thước (18x20), không phụ thuộc font.
  playIcon: {
    width: 0,
    height: 0,
    marginLeft: 4, // tam giác lệch trọng tâm nên đẩy nhẹ sang phải cho cân
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderLeftWidth: 16,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: CTU_White,
  },
  pauseIcon: {
    width: 18,
    height: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pauseBar: {
    width: 6,
    height: 20,
    borderRadius: 2,
    backgroundColor: CTU_White,
  },
  playerTime: {
    width: 66,
    color: "#5B6785",
    fontSize: 12,
    fontWeight: "600",
  },
  playerTimeRight: {
    textAlign: "right",
  },
  itemNowPlaying: {
    color: COLOR_GREEN,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  historyHint: {
    color: "#5B6785",
    fontSize: 12,
    marginBottom: 8,
  },
  historyLabel: {
    color: CTU_TextDark,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  historyList: {
    paddingBottom: 24,
  },
  itemContainer: {
    width: CARD_WIDTH,
    flexDirection: "row",
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 10,
  },
  itemTimeBlock: {
    width: 104,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  itemRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DDE3EE",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  itemRightActive: {
    backgroundColor: CTU_NavyBlue,
  },
  thumbnailWrapper: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    backgroundColor: "#000000",
    borderRadius: 8,
    overflow: "hidden",
    padding: 4,
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  itemInfo: {
    flex: 1,
    justifyContent: "center",
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#8E9BB5",
    letterSpacing: 0.2,
  },
  itemTitleActive: {
    color: CTU_White,
  },
  itemTemp: {
    fontSize: 13,
    fontWeight: "600",
    color: CTU_NavyBlue,
    marginTop: 4,
  },
  itemTempActive: {
    color: CTU_Gold,
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenImage: {
    width: SCREEN_HEIGHT,
    height: SCREEN_WIDTH,
    transform: [{ rotate: "90deg" }],
  },
  fullscreenCloseBtn: {
    position: "absolute",
    top: 44,
    right: 24,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  fullscreenCloseText: {
    color: CTU_White,
    fontSize: 20,
    fontWeight: "700",
  },
});