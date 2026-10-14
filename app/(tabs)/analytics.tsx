import Ionicons from "@expo/vector-icons/Ionicons";
import { off, onValue, ref } from "firebase/database";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import Svg, { Line, Text as SvgText } from "react-native-svg";
import { db } from "../../config/firebaseConfig";

// Bảng màu đồng bộ toàn bộ app (Tone CTU & UI Template)
const CTU_NavyBlue = "#1F5CA9";
const CTU_LightBlue = "#E8F4FB";
const CTU_White = "#FFFFFF";
const CTU_Red = "#ED1C24";
const CTU_Green = "#2E7D32";
const COLOR_AMBER = "#F5A623";
const COLOR_DANGER = "#B00020";

// Màu văn bản
const COLOR_TEXT_PRIMARY = "#11181C";
const COLOR_TEXT_GRAY = "#7A8FAD";

// Màu nền
const COLOR_BG_APP = "#F0F4FA";

const SCREEN_WIDTH = Dimensions.get("window").width;

// Biểu đồ nằm trong thẻ có padding 16 + body padding 16 mỗi bên (= 64 tổng).
// Dời biểu đồ sang trái CHART_DICH_TRAI px (tràn vào phần padding của thẻ) và nới rộng thêm đúng bấy nhiêu.
const CHART_DICH_TRAI = 0;
const CHART_RONG = SCREEN_WIDTH - 64 + CHART_DICH_TRAI;
// Vùng số nhiệt độ bên trái: phần vẽ biểu đồ bắt đầu cách mép chart CHART_LE_TRAI px
// (mặc định chart-kit là 64). Số nằm ở CHART_LE_TRAI - CHART_NHAN_Y_LECH, tức cách phần vẽ đúng CHART_NHAN_Y_LECH px.
// Cột số (rộng ~22px với "100°") bắt đầu ngay mép trái chart = mép trái icon phía trên.
const CHART_LE_TRAI = 34;
// Khoảng trống bên phải điểm cuối của đồ thị, dành cho nhãn giờ của điểm cuối.
const CHART_LE_PHAI = 20;
const CHART_CAO = 240;
const CHART_PADDING_TOP = 16; // mặc định của chart-kit
const CHART_NHAN_Y_LECH = 6;

// Kiểu nét của từng đường: khác nhau rõ rệt để vẫn phân biệt được khi in trắng đen.
//  Tmax: nét liền, dày | Cảnh báo: chấm | Nguy hiểm: gạch dài
const NET_TMAX = { width: 1.5, dash: undefined as number[] | undefined };
const NET_CANHBAO = { width: 1.5, dash: [2, 4] };
const NET_NGUYHIEM = { width: 1.5, dash: [10, 5] };

// Đường ngưỡng luôn dài đúng CHART_DAI_DUONG px (từ điểm đầu đến điểm cuối). Giãn nhẹ khoảng hở để
// các đoạn nét đứt chia đều và đường kết thúc bằng một đoạn nét ĐẦY ĐỦ (không bị cụt thành chấm).
const CHART_DAI_DUONG = CHART_RONG - CHART_LE_PHAI - CHART_LE_TRAI;
const netKhop = (dash: number, gap: number): number[] => {
  const n = Math.max(2, Math.round((CHART_DAI_DUONG + gap) / (dash + gap)));
  return [dash, (CHART_DAI_DUONG - n * dash) / (n - 1)];
};

// Mẫu nét nhỏ dùng cho phần chú thích, vẽ đúng kiểu nét với đường trên biểu đồ.
const MauNet = ({
  color,
  net,
}: {
  color: string;
  net: { width: number; dash?: number[] };
}) => (
  <Svg width={30} height={8}>
    <Line
      x1={0}
      y1={4}
      x2={30}
      y2={4}
      stroke={color}
      strokeWidth={net.width}
      strokeDasharray={net.dash ? net.dash.join(",") : undefined}
    />
  </Svg>
);

// PHẢI khớp giá trị bên Test.py (SO_DIEM_LICH_SU_TOIDA / KHOANG_CACH_LICH_SU).
// Mỗi phút 1 điểm, tối đa 60 điểm = 1 giờ gần nhất.
const KHOANG_CACH_DIEM_MS = 60000;

// Ngưỡng cảnh báo / nguy hiểm KHÔNG còn cố định: đọc từ Firebase
// (nhietdo/canhbao và nhietdo/nguyhiem), chỉnh trong màn hình Cài đặt.
const docSo = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Tốc độ tăng nhiệt (°C/phút): trên mức này là bất thường.
const TOC_DO_CHU_Y = 5;
const TOC_DO_NGUY_HIEM = 2;
// Điểm cách nhau 1 phút nên tính tốc độ trên ~2 điểm gần nhất (~2 phút).
// Biểu đồ + thống kê chỉ lấy khoảng này tính từ điểm dữ liệu mới nhất (1 giờ gần nhất).
const CUA_SO_HIEN_THI_MS = 60 * KHOANG_CACH_DIEM_MS;
const CUA_SO_TOC_DO_MS = 2 * KHOANG_CACH_DIEM_MS + 5000;

type TempRecord = {
  timestamp: number;
  tMax: number;
  tAvg: number | null;
};

const dinhDangGio = (ts: number, giay = false) =>
  new Date(ts).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    ...(giay ? { second: "2-digit" } : {}),
  });

const dinhDangTuoi = (ms: number) => {
  const phut = Math.floor(ms / 60000);
  if (phut < 60) return `${phut} phút`;
  const gio = Math.floor(phut / 60);
  const du = phut % 60;
  return du ? `${gio} giờ ${du} phút` : `${gio} giờ`;
};

const dinhDangThoiLuong = (ms: number) => {
  const giay = Math.round(ms / 1000);
  if (giay < 60) return `${giay} giây`;
  const phut = Math.floor(giay / 60);
  const du = giay % 60;
  return du ? `${phut} phút ${du} giây` : `${phut} phút`;
};

// Tốc độ tăng của Tmax (°C/phút) trên cửa sổ ~2 phút gần nhất.
const tinhTocDo = (pts: TempRecord[]) => {
  if (pts.length < 2) return 0;
  const cuoi = pts[pts.length - 1];
  const dau = pts.find((p) => cuoi.timestamp - p.timestamp <= CUA_SO_TOC_DO_MS) ?? pts[pts.length - 2];
  const dt = (cuoi.timestamp - dau.timestamp) / 60000;
  return dt > 0 ? (cuoi.tMax - dau.tMax) / dt : 0;
};

export default function AnalyticsScreen() {
  const [tatCaDiem, setTatCaDiem] = useState<TempRecord[]>([]);
  // Đồng hồ hiện tại, cập nhật mỗi 30 giây để cảnh báo "dữ liệu cũ" tự cập nhật.
  const [bayGio, setBayGio] = useState(() => Date.now());
  const [dangCanhBao, setDangCanhBao] = useState(false);
  const [nguongCanhBao, setNguongCanhBao] = useState<number | null>(null);
  const [nguongNguyHiem, setNguongNguyHiem] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const lichsuRef = ref(db, "giamsat/lichsu");

    const handleValue = (snapshot: any) => {
      const val = snapshot.val();
      if (!Array.isArray(val) || val.length === 0) {
        setTatCaDiem([]);
        setLoading(false);
        return;
      }

      const diem: TempRecord[] = val
        .filter((it: any) => it && it.timestamp != null && it.max_temp != null)
        .map((it: any) => ({
          timestamp: it.timestamp,
          tMax: it.max_temp,
          // avg_temp là trường tùy chọn: Pi đẩy thêm thì app tự hiển thị.
          tAvg: it.avg_temp != null ? it.avg_temp : null,
        }))
        .sort((a: TempRecord, b: TempRecord) => a.timestamp - b.timestamp);

      // Lưu toàn bộ; việc cắt lấy 1 giờ gần nhất (tính từ bây giờ) làm ở bên dưới.
      setTatCaDiem(diem);
      setLoading(false);
    };

    onValue(lichsuRef, handleValue, (error) => {
      console.error("Lỗi đọc lịch sử giám sát:", error);
      setLoading(false);
    });

    return () => off(lichsuRef, "value", handleValue);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setBayGio(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Firebase giữ cả những điểm rất cũ nên chỉ lấy 1 giờ tính từ điểm mới nhất.
  const dataPoints = useMemo(() => {
    if (tatCaDiem.length === 0) return tatCaDiem;
    const tMoiNhat = tatCaDiem[tatCaDiem.length - 1].timestamp;
    return tatCaDiem.filter((p) => tMoiNhat - p.timestamp <= CUA_SO_HIEN_THI_MS);
  }, [tatCaDiem]);

  // Tuổi của điểm mới nhất so với đồng hồ điện thoại; từ 3 phút trở lên coi là dữ liệu cũ.
  const tuoiDuLieuMs =
    tatCaDiem.length > 0 ? bayGio - tatCaDiem[tatCaDiem.length - 1].timestamp : 0;
  const duLieuCu = tuoiDuLieuMs >= 3 * KHOANG_CACH_DIEM_MS;

  // Cờ cảnh báo đọc riêng để cập nhật ngay lập tức, không phụ thuộc nhịp lịch sử.
  useEffect(() => {
    const canhBaoRef = ref(db, "giamsat/canhbao");

    const handleValue = (snapshot: any) => {
      setDangCanhBao(!!snapshot.val());
    };

    onValue(canhBaoRef, handleValue);
    return () => off(canhBaoRef, "value", handleValue);
  }, []);

  // Hai ngưỡng đọc riêng: cảnh báo (nhietdo/canhbao) và nguy hiểm/bật chuông (nhietdo/nguyhiem).
  useEffect(() => {
    const canhBaoRef = ref(db, "nhietdo/canhbao");
    const nguyHiemRef = ref(db, "nhietdo/nguyhiem");

    const hCanhBao = (snapshot: any) => setNguongCanhBao(docSo(snapshot.val()));
    const hNguyHiem = (snapshot: any) => setNguongNguyHiem(docSo(snapshot.val()));

    onValue(canhBaoRef, hCanhBao);
    onValue(nguyHiemRef, hNguyHiem);

    return () => {
      off(canhBaoRef, "value", hCanhBao);
      off(nguyHiemRef, "value", hNguyHiem);
    };
  }, []);

  const soDiem = dataPoints.length;

  // ---- Dữ liệu vẽ: lấy mẫu lại đều từng phút ----
  // chart-kit rải điểm đều theo CHỈ SỐ chứ không theo thời gian: nếu Pi mất mẫu hoặc lệch nhịp
  // thì thang giờ bị sai. Nội suy về lưới đều 1 phút/điểm để vị trí ngang tỉ lệ đúng với thời gian.
  const diemVe = (() => {
    const goc = dataPoints.map((p) => ({ t: p.timestamp, v: p.tMax }));
    if (goc.length < 2) return goc;
    const t0 = goc[0].t;
    const n = Math.round((goc[goc.length - 1].t - t0) / KHOANG_CACH_DIEM_MS);
    if (n < 1 || n > 360) return goc;
    const luoi: { t: number; v: number }[] = [];
    let j = 0;
    for (let k = 0; k <= n; k++) {
      const t = t0 + k * KHOANG_CACH_DIEM_MS;
      while (j < goc.length - 2 && goc[j + 1].t < t) j++;
      const a = goc[j];
      const b = goc[j + 1];
      const f = b.t === a.t ? 0 : Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
      luoi.push({ t, v: a.v + (b.v - a.v) * f });
    }
    return luoi;
  })();
  const soDiemVe = diemVe.length;
  const giaTriVe = soDiemVe ? diemVe.map((p) => p.v) : [0];

  // Vị trí ngang (chỉ số, có phần lẻ) của một thời điểm trên đường vẽ.
  const viTriNgang = (t: number) => {
    for (let i = 0; i < soDiemVe - 1; i++) {
      if (t <= diemVe[i + 1].t) {
        const d = diemVe[i + 1].t - diemVe[i].t;
        return i + (d > 0 ? (t - diemVe[i].t) / d : 0);
      }
    }
    return Math.max(0, soDiemVe - 1);
  };

  // ---- Thang thời gian ----
  // Chia đoạn [tDau, tCuoi] thành nKhoang khoảng BẰNG NHAU (tối đa 6) nên các vạch cách đều,
  // hai đầu trục đều có nhãn giờ và bố cục cân đối hai bên.
  const tDau = soDiemVe ? diemVe[0].t : 0;
  const tCuoi = soDiemVe ? diemVe[soDiemVe - 1].t : 0;
  const khoangPhut = (tCuoi - tDau) / 60000;
  const buocGoiY =
    [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440].find((b) => khoangPhut / b <= 6) ?? 1440;
  const nKhoang = soDiemVe < 2 ? 0 : Math.max(1, Math.min(6, Math.round(khoangPhut / buocGoiY)));
  const buocPhut = nKhoang ? Math.max(1, Math.round(khoangPhut / nKhoang)) : 1;
  const tMoc = (k: number) => tDau + (k * (tCuoi - tDau)) / Math.max(1, nKhoang);
  // Nhãn làm tròn về phút để các nhãn liền nhau chênh nhau số phút tròn.
  const nhanGio = (t: number) => dinhDangGio(Math.round(t / 60000) * 60000);
  // chart-kit chừa 1 khoảng trống bên phải điểm cuối (rất to khi ít điểm). Nới chart rộng thêm
  // đúng bấy nhiêu rồi cắt phần thừa (khung có overflow hidden) để điểm cuối nằm sát mép phải.
  const nVe = Math.max(1, giaTriVe.length);
  const chartWidth =
    nVe > 1
      ? CHART_LE_TRAI + ((CHART_RONG - CHART_LE_PHAI - CHART_LE_TRAI) * nVe) / (nVe - 1)
      : CHART_RONG;
  // Vạch lớn k = 0..nKhoang, vạch nhỏ nằm giữa mỗi khoảng.
  const mocLon = Array.from({ length: nKhoang + 1 }, (_, k) => tMoc(k));
  const mocNho = Array.from({ length: nKhoang }, (_, k) => tMoc(k + 0.5));
  // Vị trí x (px) của một thời điểm trên SVG của chart-kit, dùng cho lớp lưới dọc nằm DƯỚI đường dữ liệu.
  const xLuoi = (t: number) =>
    CHART_LE_TRAI + (viTriNgang(t) * (chartWidth - CHART_LE_TRAI)) / Math.max(1, soDiemVe);

  const tMaxValues = soDiem ? dataPoints.map((p) => p.tMax) : [0];

  // ---- Thông số tóm tắt ----
  const diemCuoi = soDiem ? dataPoints[soDiem - 1] : null;
  const diemDinh = soDiem
    ? dataPoints.reduce((m, p) => (p.tMax > m.tMax ? p : m), dataPoints[0])
    : null;
  const tocDo = tinhTocDo(dataPoints);
  const deltaT = diemCuoi && diemCuoi.tAvg != null ? diemCuoi.tMax - diemCuoi.tAvg : null;
  const soDiemVuot =
    nguongCanhBao != null ? dataPoints.filter((p) => p.tMax >= nguongCanhBao).length : 0;
  const thoiGianVuotMs = soDiemVuot * KHOANG_CACH_DIEM_MS;

  const mauTocDo =
    tocDo >= TOC_DO_NGUY_HIEM ? CTU_Red : tocDo >= TOC_DO_CHU_Y ? COLOR_AMBER : CTU_NavyBlue;
  const iconTocDo = "trending-up";

  // ---- Trục Y cố định (chỉ nới ra khi dữ liệu vượt biên) ----
  const dataMin = Math.min(...tMaxValues);
  const dataMax = Math.max(...tMaxValues);
  const mocNguong = [nguongCanhBao, nguongNguyHiem].filter((v): v is number => v != null);
  // Thang đều: bước chia tròn, hai đầu trục cũng nằm đúng trên bội số của bước,
  // nên mọi khoảng cách giữa các vạch bằng nhau (vd 20-40-60-80-100, 0-20-...-100).
  const yThap = Math.min(20, dataMin, ...mocNguong);
  const yCao = Math.max(100, dataMax, ...mocNguong);
  const buocY =
    [10, 20, 25, 50, 100, 200, 500].find(
      (b) => (Math.ceil(yCao / b) * b - Math.floor(yThap / b) * b) / b <= 8,
    ) ?? 500;
  const yMin = Math.floor(yThap / buocY) * buocY;
  const segments = Math.max(2, Math.round((Math.ceil(yCao / buocY) * buocY - yMin) / buocY));
  const yMax = yMin + segments * buocY;

  const datasets: any[] = [
    {
      data: giaTriVe,
      // chart-kit vẽ đường với color(0.2) (mờ 20%) nên phải bỏ qua tham số opacity.
      color: () => CTU_Red,
      strokeWidth: NET_TMAX.width, // nét liền (không có strokeDashArray)
    },
  ];
  if (nguongCanhBao != null) {
    datasets.push({
      data: giaTriVe.map(() => nguongCanhBao),
      color: () => COLOR_AMBER,
      strokeWidth: NET_CANHBAO.width,
      strokeDashArray: netKhop(NET_CANHBAO.dash[0], NET_CANHBAO.dash[1]),
      withDots: false,
    });
  }
  if (nguongNguyHiem != null) {
    datasets.push({
      data: giaTriVe.map(() => nguongNguyHiem),
      color: () => COLOR_DANGER,
      strokeWidth: NET_NGUYHIEM.width,
      strokeDashArray: netKhop(NET_NGUYHIEM.dash[0], NET_NGUYHIEM.dash[1]),
      withDots: false,
    });
  }
  // Ghim biên trục Y, vô hình.
  datasets.push({ data: [yMin, yMax], color: () => "rgba(0,0,0,0)", strokeWidth: 0, withDots: false });

  // Trang trí biểu đồ: trục giờ tự vẽ (vùng vẽ cao 3/4 chiều cao, theo công thức của chart-kit).
  const veNhanNguong = ({ width, height, paddingTop, paddingRight }: any) => {
    const pr = typeof paddingRight === "number" ? paddingRight : CHART_LE_TRAI;
    const day = paddingTop + 0.75 * height; // đường trục ngang (đáy vùng vẽ)
    const xTai = (t: number) => pr + (viTriNgang(t) * (width - pr)) / Math.max(1, soDiemVe);
    const lon = mocLon.map((T, k) => ({ T, k, x: xTai(T) }));

    return (
      <>
        {/* Trục giờ tự vẽ: đường trục, vạch dọc mờ, vạch chia lớn/nhỏ và nhãn nằm ngay dưới trục */}
        {soDiemVe > 1 && (
          <Line x1={pr} x2={width} y1={day} y2={day} stroke="#B8C6DD" strokeWidth={1} />
        )}
        {mocNho.map((T) => {
          const x = xTai(T);
          return (
            <Line key={`nho-${T}`} x1={x} x2={x} y1={day} y2={day + 4} stroke="#9DB0CF" strokeWidth={1} />
          );
        })}
        {lon.map((m) => (
          <React.Fragment key={`lon-${m.k}`}>
            <Line x1={m.x} x2={m.x} y1={day} y2={day + 8} stroke="#4A5C7A" strokeWidth={1.5} />
            {/* Nhãn vạch cuối vẽ bằng Text phủ bên dưới (SVG có thể hẹp hơn khung). */}
            {m.k < nKhoang && (
              <SvgText
                x={m.x}
                y={day + 21}
                fontSize={11}
                fontWeight="700"
                fill="#4A5C7A"
                textAnchor="middle"
              >
                {nhanGio(m.T)}
              </SvgText>
            )}
          </React.Fragment>
        ))}
      </>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={CTU_NavyBlue} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Thống kê</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Trạng thái cảnh báo hiện tại (giamsat/canhbao)
        <View style={styles.card}>
          <View style={styles.statusCardInner}>
            <View
              style={[
                styles.cardIconBox,
                { backgroundColor: dangCanhBao ? "#FDECEA" : "#EAF7EE", marginBottom: 0 },
              ]}
            >
              <Ionicons
                name={dangCanhBao ? "alert-circle" : "checkmark-circle"}
                size={20}
                color={dangCanhBao ? CTU_Red : CTU_Green}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>
                {dangCanhBao ? "Đang có cảnh báo quá nhiệt" : "Nhiệt độ bình thường"}
              </Text>
              <Text style={styles.cardSubtitle}>
                {dangCanhBao ? "Cần kiểm tra thiết bị" : "Không có gì bất thường"}
              </Text>
            </View>
          </View>
        </View> */}

        {/* Biểu đồ biến thiên nhiệt độ */}
        <View style={styles.card}>
          <View style={styles.chartHeader}>
            <View style={[styles.cardIconBox, { backgroundColor: "#FDECEA", marginBottom: 0 }]}>
              <Ionicons name="pulse-outline" size={20} color={CTU_Red} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Nhiệt độ theo thời gian</Text>
              <Text style={styles.cardSubtitle}>{`Nhiệt độ cao nhất trong 1 giờ gần nhất`}</Text>
              {duLieuCu && (
                <Text style={[styles.cardSubtitle, { color: COLOR_AMBER, fontWeight: "600" }]}>
                  {`Dữ liệu mới nhất cách đây ${dinhDangTuoi(tuoiDuLieuMs)}`}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.chartWrapper}>
            {loading ? (
              <ActivityIndicator size="large" color={CTU_NavyBlue} style={{ paddingVertical: 60 }} />
            ) : soDiem === 0 ? (
              <Text style={styles.emptyText}>
                Chưa có dữ liệu lịch sử. Kiểm tra thiết bị đang chạy và ghi lên Firebase.
              </Text>
            ) : (
              <>
              {/* Khung cắt: mọi đường (lưới, trục, đường dữ liệu) dừng đúng ở điểm cuối (+1px cho nét không bị xén).
                  Nhãn giờ cuối nằm ngoài khung này nên không bị cắt. */}
              <View style={{ width: CHART_RONG - CHART_LE_PHAI + 1, overflow: "hidden" }}>
              {/* Lưới dọc vẽ ở lớp riêng nằm dưới biểu đồ (nền biểu đồ để trong suốt) nên không đè lên đường dữ liệu. */}
              <Svg
                width={chartWidth}
                height={CHART_CAO}
                style={{ position: "absolute", left: -CHART_DICH_TRAI, top: 0 }}
              >
                {mocLon.map((T, k) =>
                  k > 0 && k < nKhoang ? (
                    <Line
                      key={`luoi-${k}`}
                      x1={xLuoi(T)}
                      x2={xLuoi(T)}
                      y1={CHART_PADDING_TOP}
                      y2={CHART_PADDING_TOP + 0.75 * CHART_CAO}
                      stroke="#CFD8E8"
                      strokeWidth={1}
                    />
                  ) : null,
                )}
              </Svg>
              <LineChart
                data={{ labels: giaTriVe.map(() => ""), datasets }}
                width={chartWidth}
                height={CHART_CAO}
                yAxisSuffix="°"
                chartConfig={{
                  backgroundColor: CTU_White,
                  backgroundGradientFrom: CTU_White,
                  backgroundGradientTo: CTU_White,
                  backgroundGradientFromOpacity: 0,
                  backgroundGradientToOpacity: 0,
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(237, 28, 36, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(31, 45, 74, ${opacity})`,
                  propsForBackgroundLines: {
                    stroke: "#CFD8E8",
                    strokeWidth: 1,
                    // undefined ghi đè nét đứt mặc định của chart-kit -> đường liền
                    strokeDasharray: undefined,
                  },
                  propsForLabels: { fontSize: 11, fontWeight: "600" },
                  propsForVerticalLabels: { fontSize: 11, fontWeight: "700" },
                }}
                withDots={false}
                withVerticalLabels={false}
                yLabelsOffset={CHART_NHAN_Y_LECH}
                decorator={veNhanNguong}
                withVerticalLines={false}
                withHorizontalLines={true}
                withShadow={false}
                segments={segments}
                fromZero={false}
                bezier={false}
                style={{ ...styles.chart, alignSelf: "flex-start", marginLeft: -CHART_DICH_TRAI, paddingRight: CHART_LE_TRAI }}
              />
              </View>
              {/* Nhãn giờ của điểm cuối: Text phủ lên (SVG có thể hẹp hơn khung nên không vẽ trong SVG) */}
              {soDiemVe > 1 && (
                <Text
                  style={[
                    styles.nhanCuoi,
                    {
                      left: CHART_RONG - CHART_LE_PHAI - 20,
                      top: CHART_PADDING_TOP + 0.75 * CHART_CAO + 10,
                    },
                  ]}
                >
                  {nhanGio(tCuoi)}
                </Text>
              )}
              </>
            )}
          </View>

          {/* Chú thích (mẫu nét khớp với đường trên biểu đồ) */}
          <View style={styles.legendWrap}>
            <View style={styles.legendItem}>
              <MauNet color={CTU_Red} net={NET_TMAX} />
              <Text style={styles.legendText}>Nhiệt độ cao nhất</Text>
            </View>
            {nguongCanhBao != null && (
              <View style={styles.legendItem}>
                <MauNet color={COLOR_AMBER} net={NET_CANHBAO} />
                <Text style={styles.legendText}>{`Cảnh báo ${nguongCanhBao}°C`}</Text>
              </View>
            )}
            {nguongNguyHiem != null && (
              <View style={styles.legendItem}>
                <MauNet color={COLOR_DANGER} net={NET_NGUYHIEM} />
                <Text style={styles.legendText}>{`Nguy hiểm ${nguongNguyHiem}°C`}</Text>
              </View>
            )}
          </View>

          <View style={styles.legendRow}>
            <Text style={styles.legendText}>Thấp nhất – cao nhất</Text>
            <Text style={styles.legendRange}>
              {soDiem ? `${dataMin.toFixed(0)}° – ${dataMax.toFixed(0)}°C` : "--"}
            </Text>
          </View>
        </View>
        {/* Thẻ tóm tắt: đỉnh + tốc độ tăng */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={[styles.cardIconBox, { backgroundColor: "#FDECEA" }]}>
              <Ionicons name="thermometer-outline" size={20} color={CTU_Red} />
            </View>
            <Text style={styles.cardLabel}>Đỉnh trong 1 giờ</Text>
            <Text style={[styles.cardValue, { color: CTU_Red }]}>
              {diemDinh ? `${diemDinh.tMax.toFixed(1)}°C` : "--"}
            </Text>
            <Text style={styles.cardNote}>
              {diemDinh ? `Lúc ${dinhDangGio(diemDinh.timestamp, true)}` : "Chưa có dữ liệu"}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={[styles.cardIconBox, { backgroundColor: CTU_LightBlue }]}>
              <Ionicons name={iconTocDo} size={20} color={mauTocDo} />
            </View>
            <Text style={styles.cardLabel}>Tốc độ tăng nhiệt</Text>
            <Text style={[styles.cardValue, { color: mauTocDo }]}>
              {tocDo > 0 ? "+" : ""}
              {tocDo.toFixed(1)}°/phút
            </Text>
            <Text style={styles.cardNote}>
              {tocDo >= TOC_DO_NGUY_HIEM
                ? "Tăng rất nhanh"
                : tocDo >= TOC_DO_CHU_Y
                  ? "Tăng nhanh, cần chú ý"
                  : "Ổn định"}
            </Text>
          </View>
        </View>

        {/* Thẻ tóm tắt: chênh lệch + thời gian vượt ngưỡng */}
        {/* <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={[styles.cardIconBox, { backgroundColor: CTU_LightBlue }]}>
              <Ionicons name="git-compare-outline" size={20} color={CTU_NavyBlue} />
            </View>
            <Text style={styles.cardLabel}>Nhiệt độ cao nhất so với nhiệt độ trung bình</Text>
            <Text style={[styles.cardValue, { color: CTU_NavyBlue }]}>
              {deltaT != null ? `${deltaT.toFixed(1)}°C` : "--"}
            </Text>
            <Text style={styles.cardNote}>
              {deltaT == null
                ? "Chưa có avg_temp"
                : deltaT >= 10
                  ? "Có nhiệt độ nóng bất thường"
                  : "Nhiệt độ khá đồng đều"}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <View
              style={[
                styles.cardIconBox,
                { backgroundColor: soDiemVuot ? "#FFF4E0" : "#EAF7EE" },
              ]}
            >
              <Ionicons
                name="time-outline"
                size={20}
                color={soDiemVuot ? COLOR_AMBER : CTU_Green}
              />
            </View>
            <Text style={styles.cardLabel}>
              {nguongCanhBao != null ? `Trên ngưỡng ${nguongCanhBao}°C` : "Trên ngưỡng cảnh báo"}
            </Text>
            <Text
              style={[styles.cardValue, { color: soDiemVuot ? COLOR_AMBER : CTU_Green }]}
            >
              {nguongCanhBao == null
                ? "--"
                : soDiemVuot
                  ? dinhDangThoiLuong(thoiGianVuotMs)
                  : "0 giây"}
            </Text>
            <Text style={styles.cardNote}>
              {nguongCanhBao == null ? "Chưa cài ngưỡng" : "Trong 1 giờ gần nhất"}
            </Text>
          </View> */}
        {/* </View> */}
      </ScrollView>
    </View>
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
  headerSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "600",
  },
  body: {
    padding: 16,
    gap: 14,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: CTU_White,
    padding: 16,
    borderRadius: 20,
    elevation: 2,
    shadowColor: CTU_NavyBlue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  cardIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  cardLabel: {
    fontSize: 12,
    color: COLOR_TEXT_GRAY,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  cardNote: {
    fontSize: 11,
    color: COLOR_TEXT_GRAY,
    marginTop: 4,
  },
  card: {
    backgroundColor: CTU_White,
    borderRadius: 20,
    padding: 16,
    elevation: 2,
    shadowColor: CTU_NavyBlue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  statusCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLOR_TEXT_PRIMARY,
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLOR_TEXT_GRAY,
    marginTop: 2,
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  nhanCuoi: {
    position: "absolute",
    width: 40,
    textAlign: "center",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: "#4A5C7A",
  },
  chartWrapper: {
    width: CHART_RONG,
    alignSelf: "center",
    overflow: "hidden",
  },
  chart: {
    borderRadius: 16,
  },
  emptyText: {
    fontSize: 13,
    color: COLOR_TEXT_GRAY,
    textAlign: "center",
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  legendWrap: {
    flexDirection: "column",
    alignItems: "flex-start",
    rowGap: 6,
    marginTop: 10,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F5",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendText: {
    fontSize: 12,
    color: COLOR_TEXT_GRAY,
    fontWeight: "600",
  },
  legendRange: {
    fontSize: 12,
    color: COLOR_TEXT_PRIMARY,
    fontWeight: "700",
  },
});
