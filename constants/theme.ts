/**
 * TASARIM SİSTEMİ — "Saha Gecesi"
 *
 * Kimlik: gece oynanan halı saha maçı. Floodlight altında koyu yeşil-siyah zemin,
 * ışıkta parlayan çim, yüksek kontrast lime vurgu. Sinematik ve sportif.
 *
 * ⚠️ KOYU TEMA AYRI BİR MOD DEĞİL — uygulamanın kimliği bu. İleride istenirse
 * AÇIK tema opsiyonel eklenti olarak gelir. Bu yüzden renkler semantik isimlerle
 * tanımlı (bg / surface / text / accent), ham hex değil: ikinci bir tema eklemek
 * ekranları yeniden yazmayı gerektirmesin.
 *
 * KULLANIM KURALI: ekranlarda inline hex/spacing YAZILMAZ. Her değer buradan gelir.
 * Bkz. YOL_HARITASI.md — Faz 1.
 */

import { Platform } from 'react-native';

/* ─────────────────────────────────────────────────────────────
 * 1. HAM PALET (doğrudan kullanma — semantik katmandan geç)
 * ───────────────────────────────────────────────────────────── */

const palette = {
  // Zemin: neredeyse siyah, içinde çim yeşili tonu var (nötr gri DEĞİL)
  night900: '#070B09',
  night800: '#0A0F0D',
  night700: '#121A17',
  night600: '#18231F',
  night500: '#1F2E28',
  night400: '#2A3D35',
  night300: '#3A5248',

  // Floodlight: ışığın rengi. Ana vurgu.
  lime500: '#C6FF3D',
  lime600: '#A8DC2C',
  lime400: '#D6FF6E',

  // Çim yeşili: olumlu/aktif durumlar
  turf500: '#22E07A',
  turf600: '#16B863',

  // Metin
  chalk100: '#F1F5F3',
  chalk300: '#97A9A1',
  chalk500: '#64756D',

  // Durum renkleri
  amber500: '#FFB020',
  red500: '#FF5A5A',
  blue500: '#4FA8FF',

  white: '#FFFFFF',
  black: '#000000',
} as const;

/* ─────────────────────────────────────────────────────────────
 * 2. SEMANTİK RENKLER — ekranlarda kullanılacak olanlar
 * ───────────────────────────────────────────────────────────── */

export const colors = {
  /** Sayfa zemini (en arka katman) */
  bg: palette.night800,
  /** Sayfanın daha da koyu bölgeleri: header arkası, modal backdrop tabanı */
  bgDeep: palette.night900,
  /** Kart / liste satırı yüzeyi */
  surface: palette.night700,
  /** Kart içindeki ikincil yüzey: input, chip, ikon kutusu */
  surfaceAlt: palette.night600,
  /** Basılı/seçili yüzey */
  surfaceActive: palette.night500,

  /** Ayırıcı çizgi ve kart kenarı — koyu temada yüksekliği BU verir, gölge değil */
  border: palette.night500,
  /** Vurgulu kenar: seçili kart, odaklı input */
  borderStrong: palette.night300,

  /** Ana metin */
  text: palette.chalk100,
  /** İkincil metin: alt satır, açıklama */
  textMuted: palette.chalk300,
  /** Silik metin: zaman damgası, placeholder. ⚠️ Yalnızca büyük veya
   *  dekoratif metinde — küçük puntoda kontrast sınırda kalır. */
  textFaint: palette.chalk500,

  /** ANA VURGU — floodlight lime. Birincil buton, aktif sekme, odak. */
  accent: palette.lime500,
  accentDim: palette.lime600,
  accentSoft: palette.lime400,
  /** ⚠️ Lime ÇOK parlak: üzerine yazılan metin KOYU olmalı, beyaz değil. */
  accentInk: palette.night900,

  /** Olumlu / aktif / "kesin var" */
  success: palette.turf500,
  successDim: palette.turf600,
  /** Uyarı / "belki" / yedek */
  warning: palette.amber500,
  /** Hata / "yok" / yıkıcı işlem */
  danger: palette.red500,
  /** Bilgi / nötr vurgu */
  info: palette.blue500,

  /** Modal arkası perde */
  backdrop: 'rgba(4, 7, 6, 0.72)',
} as const;

/* ─────────────────────────────────────────────────────────────
 * 3. TAKIM RENKLERİ — SEMANTİK, KİMLİKTEN BAĞIMSIZ
 * ───────────────────────────────────────────────────────────── */

/**
 * ⚠️ DEĞİŞTİRME. Bu iki renk saha tarafını ayırt ediyor ve kullanıcı zihninde
 * yerleşik. Kimlik değişse de sabit kalır — bkz. DURUM.md "Takım Kimliği".
 *
 * ⚠️ BİLİNEN ÇAKIŞMA RİSKİ: teamB (#10B981) yeşil; koyu yeşil zemin ve
 * colors.success (#22E07A) ile aynı aileden. Saha ekranında (Faz 2.6) A/B
 * ayrımının okunaklı kaldığı DOĞRULANMALI. Çözüm gerekirse rengi değil,
 * dolgu/kontur muamelesini değiştir (dolu rozet + koyu metin).
 */
export const team = {
  A: '#3B82F6',
  B: '#10B981',
  /** Yeni kurulan takımların varsayılan marka rengi (teams.color).
   *  Değiştirmek YALNIZCA yeni takımları etkiler; mevcut kayıtlar durur. */
  defaultBrand: '#22C55E',
} as const;

/* ─────────────────────────────────────────────────────────────
 * 4. ARALIK (4'ün katları)
 * ───────────────────────────────────────────────────────────── */

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
} as const;

/* ─────────────────────────────────────────────────────────────
 * 5. KÖŞE YARIÇAPI
 * ───────────────────────────────────────────────────────────── */

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

/* ─────────────────────────────────────────────────────────────
 * 6. YÜKSEKLİK — koyu temada GÖLGE ÇALIŞMAZ
 *
 * Siyah zeminde siyah gölge görünmez. Yükseklik hissi iki şeyle verilir:
 *   (a) yüzey rengini bir kademe açmak,
 *   (b) ince bir kenar çizgisi.
 * Vurgulu öğelerde ayrıca renkli "glow" kullanılır (lime ışık hissi).
 * ───────────────────────────────────────────────────────────── */

export const elevation = {
  /** Düz yüzey — kart, liste satırı */
  flat: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  /** Yükseltilmiş — modal, sheet, seçili kart */
  raised: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  /** Vurgulu ışıma — birincil buton, aktif durum. iOS'ta shadow, Android'de
   *  elevation renkli gölgeyi desteklemediği için kenarla telafi edilir. */
  glow: Platform.select({
    ios: {
      shadowColor: colors.accent,
      shadowOpacity: 0.35,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 0 },
    },
    default: {
      borderWidth: 1,
      borderColor: colors.accentDim,
    },
  }),
} as const;

/* ─────────────────────────────────────────────────────────────
 * 7. TİPOGRAFİ
 *
 * Şu an sistem fontu (iOS: SF Pro, Android: Roboto) ağır kesimlerle
 * kullanılıyor — sıfır bağımlılık, sıfır bundle maliyeti.
 * `display` slotu ileride özel bir kondense font takmak için ayrıldı:
 * `expo-font` zaten kurulu, değişiklik tek yerden yapılır.
 * ───────────────────────────────────────────────────────────── */

const family = Platform.select({
  ios: { sans: 'System', display: 'System', mono: 'ui-monospace' },
  default: { sans: 'sans-serif', display: 'sans-serif-condensed', mono: 'monospace' },
})!;

export const type = {
  /** Ekran başlığı — büyük, sıkı, iddialı */
  display: {
    fontFamily: family.display,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
    color: colors.text,
  },
  h1: {
    fontFamily: family.display,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800' as const,
    letterSpacing: -0.3,
    color: colors.text,
  },
  h2: {
    fontFamily: family.sans,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
    color: colors.text,
  },
  h3: {
    fontFamily: family.sans,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700' as const,
    color: colors.text,
  },
  body: {
    fontFamily: family.sans,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500' as const,
    color: colors.text,
  },
  bodyStrong: {
    fontFamily: family.sans,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700' as const,
    color: colors.text,
  },
  caption: {
    fontFamily: family.sans,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
    color: colors.textMuted,
  },
  /** Küçük büyük-harf etiket: "KESİN VAR", "YEDEK", bölüm başlıkları */
  micro: {
    fontFamily: family.sans,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
  /** Skor / sayaç — hizalı rakam, skorboard hissi */
  score: {
    fontFamily: family.display,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800' as const,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'] as const,
    color: colors.text,
  },
} as const;

/* ─────────────────────────────────────────────────────────────
 * 8. HAREKET
 * ───────────────────────────────────────────────────────────── */

export const motion = {
  fast: 140,
  base: 220,
  slow: 360,
} as const;

/* ─────────────────────────────────────────────────────────────
 * 9. YARDIMCI
 * ───────────────────────────────────────────────────────────── */

/** #RRGGBB + alfa → rgba(). Vurgu renginin soluk zemin hâli için. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export const theme = { colors, team, spacing, radius, elevation, type, motion, alpha } as const;

/* ─────────────────────────────────────────────────────────────
 * ESKİ — Expo şablonundan kalan dosyalar (explore.tsx, modal.tsx,
 * themed-text, themed-view) bunları import ediyor. Uygulamanın kendisi
 * KULLANMIYOR. O dosyalar temizlenince buradan da silinecek.
 * ───────────────────────────────────────────────────────────── */

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
