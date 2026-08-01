/**
 * DEĞİŞİKLİKLER (v2 — Yoklama Sistemi Yenilemesi)
 * ─────────────────────────────────────────────────
 * 1. Serbest Oyuncu Modu KALDIRILDI
 * 2. KAPTAN OY ÖZELLEŞTIRME (Supabase polls tablosu)
 * 3. SUPABASE POLL ENTEGRASYONU (isCaptain kontrolü eklendi)
 * 4. BİLDİRİM ROZETİ (Okunmamış bildirim sayısı)
 * 5. KİŞİSEL OY EKRANI (Oyuncular PlayerVoteScreen'e yönlenir)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session } from '@supabase/supabase-js';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import * as Clipboard from 'expo-clipboard';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image, Keyboard,
  KeyboardAvoidingView, Linking,
  Modal, Platform, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

// Senin Bileşenlerin
import Auth from '../../components/Auth';
import MatchRatingScreen, { RatablePlayer } from '../../components/MatchRatingScreen';
import MatchStatsScreen from '../../components/MatchStatsScreen';
import PlayerVoteScreen from '../../components/PlayerVoteScreen';
import { supabase } from '../../supabase';

// Uygulama ön plandayken de bildirim göster
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Takvim Ayarları
LocaleConfig.locales['tr'] = {
  monthNames: ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'],
  monthNamesShort: ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'],
  dayNames: ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'],
  dayNamesShort: ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'],
  today: 'Bugün'
};
LocaleConfig.defaultLocale = 'tr';

const SCREEN_W = Dimensions.get('window').width;
const FIELD_W = SCREEN_W - 40;
const FIELD_H = FIELD_W * 1.45;
const HALF_FIELD_H = FIELD_W * 0.75;

const COLORS = {
  primary: '#4F46E5', primaryLight: '#E0E7FF',
  bg: '#F9FAFB', card: '#FFFFFF',
  textMain: '#111827', textMuted: '#6B7280', border: '#E5E7EB',
  success: '#10B981', successLight: '#D1FAE5',
  warning: '#F59E0B', warningLight: '#FEF3C7',
  danger: '#EF4444', dangerLight: '#FEE2E2',
  fieldDark: '#226322', fieldLine: '#4ADE80',
  selectHighlight: '#FBBF24',
};

// --- TİPLER ---
type Position = 'KL' | 'DEF' | 'ORT' | 'FOR';
interface PlayerStats { pas: number; sut: number; fizik: number; hiz: number; }
interface PlayerInfo {
  id: string; name: string; pos: Position;
  secPos?: Position | null;
  rating: number; stats: PlayerStats;
  hasPaid?: boolean; isGuest?: boolean; statsKnown?: boolean;
}

interface MatchInfo {
  name: string; location: string; dateStr: string;
  startTime: string; endTime: string;
  price?: number; teamSize?: number;
  formation?: Formation;   // maç formatına göre seçilen slot yapısı
  lat?: number; lng?: number;
}

interface PollSettings {
  optionYesLabel: string;
  optionSubLabel: string;
  optionNoLabel:  string;
}

const DEFAULT_POLL_SETTINGS: PollSettings = {
  optionYesLabel: 'Kesin Var',
  optionSubLabel: 'Yedek',
  optionNoLabel:  'Yok',
};

interface FieldPlayer extends PlayerInfo { fieldPos: Position; fieldOrder: number; }

// Formasyon = saha oyuncularının DEF-ORT-FOR dağılımı.
// Kaleci HER ZAMAN ayrıdır, bu sayılara dahil değildir.
// Bu yüzden: takım mevcudu = 1 (KL) + def + ort + forv
type Formation =
  // 6v6 → 1 KL + 5 saha
  | '2-2-1' | '3-1-1' | '3-0-2'
  // 7v7 → 1 KL + 6 saha (eski/varsayılan set — mevcut kayıtlar bunları kullanıyor)
  | '3-2-1' | '2-3-1' | '3-1-2' | '2-2-2'
  // 8v8 → 1 KL + 7 saha
  | '3-3-1' | '4-2-1' | '2-3-2';

// Maç formatı → o formatta seçilebilecek formasyonlar.
// Her formasyonun def+ort+forv toplamı, teamSize - 1 (kaleci) olmalı.
const MATCH_FORMATS: { teamSize: number; formations: Formation[] }[] = [
  { teamSize: 6, formations: ['2-2-1', '3-1-1', '3-0-2'] },
  { teamSize: 7, formations: ['3-2-1', '2-3-1', '3-1-2', '2-2-2'] },
  { teamSize: 8, formations: ['3-3-1', '4-2-1', '2-3-2'] },
];

// ─── TAKIM KİMLİĞİ (logo + marka rengi) ──────────────────────────────────
// Takım rengi MARKA rengidir, saha tarafı rengi DEĞİL: takım her maç kendi
// içinde A/B diye bölünüyor ve A/B'nin kendi sabit renkleri var. Bu yüzden
// takım rengi yalnızca kimlik alanlarında (Takımım şeridi, ana ekran, takım
// listesi, paylaşım görseli) kullanılır.
const TEAM_LOGO_BUCKET = 'team_logos';
const DEFAULT_TEAM_COLOR = '#22C55E';
// Tam renk seçici yerine hazır palet — ek bağımlılık yok, sonuç daha derli toplu.
const TEAM_COLORS = [
  '#22C55E', '#3B82F6', '#EF4444', '#F59E0B', '#8B5CF6',
  '#EC4899', '#14B8A6', '#0EA5E9', '#84CC16', '#1F2937',
];

// Takım logosu rozeti. Logo yoksa takım renginde, adın baş harfiyle placeholder.
// Uygulamanın 4 ayrı yerinde kullanılıyor → tek kaynak.
function TeamLogo({ team, size = 40, borderColor }: {
  team?: { name?: string | null; logo_url?: string | null; color?: string | null } | null;
  size?: number;
  borderColor?: string;
}) {
  const color   = team?.color || DEFAULT_TEAM_COLOR;
  const initial = (team?.name || '?').trim().charAt(0).toUpperCase();
  const base = {
    width: size, height: size, borderRadius: size / 2,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    overflow: 'hidden' as const,
    ...(borderColor ? { borderWidth: 2, borderColor } : {}),
  };
  if (team?.logo_url) {
    return <Image source={{ uri: team.logo_url }} style={base} resizeMode="cover" />;
  }
  return (
    <View style={[base, { backgroundColor: color }]}>
      <Text style={{ color: '#FFF', fontWeight: '800', fontSize: size * 0.44 }}>{initial}</Text>
    </View>
  );
}

// --- POZİSYON BAZLI NİTELİK SİSTEMİ ---
// NOT: Bu, sahadaki yerleşim için kullanılan `Position` (KL/DEF/ORT/FOR)
// tipinden AYRI bir kavram — oyuncunun "hangi mevkilerde iyi olduğu" ve
// nitelik formunda hangi alanların gösterileceğini belirler.
type SkillPosition = 'KALECI' | 'DEFANS' | 'ON_LIBERO' | 'ORTA_SAHA' | 'FORVET_ARKASI' | 'FORVET';

const SKILL_POSITIONS: { code: SkillPosition; label: string }[] = [
  { code: 'KALECI',        label: 'Kaleci' },
  { code: 'DEFANS',        label: 'Defans' },
  { code: 'ON_LIBERO',     label: 'Ön Libero' },
  { code: 'ORTA_SAHA',     label: 'Orta Saha' },
  { code: 'FORVET_ARKASI', label: 'Forvet Arkası' },
  { code: 'FORVET',        label: 'Forvet' },
];

const SKILL_POSITION_LABELS: Record<SkillPosition, string> =
  Object.fromEntries(SKILL_POSITIONS.map(p => [p.code, p.label])) as Record<SkillPosition, string>;

// Mevki gösterimi. Yeni kayıtlar SkillPosition KODU tutar (ON_LIBERO…) →
// okunur etikete çevrilir. Eski kayıtlarda ham metin olabilir (KL/DEF/ORT/FOR)
// → olduğu gibi gösterilir. Boşsa '—'.
function positionLabel(v?: string | null): string {
  if (!v) return '—';
  return SKILL_POSITION_LABELS[v as SkillPosition] ?? v;
}

// ── NİTELİK SİSTEMİ (sadeleştirilmiş) ────────────────────────────────────────
// Saha oyuncularının HEPSİ aynı 6 niteliğe sahiptir; mevkiye göre fark yalnızca
// OVR AĞIRLIĞINDADIR (defansın şutu da girilir/oylanır ama OVR'ına az katkı
// yapar, forvetin şutu çok katkı yapar). Kaleci kendi 6 niteliğine sahiptir.
// "Kondisyon" bu 6'nın DIŞINDA, özel bir niteliktir: form/oylamada AYRI
// gösterilir ve OVR'a ağırlık olarak değil ÇARPAN olarak girer (bkz.
// conditionFactor + computeOverall).
const OUTFIELD_ATTRIBUTES   = ['Şut', 'Pas', 'Top Kontrolü', 'Markaj', 'Hız', 'Fiziksel Güç'];
// Kalecilik nitelikleri — kaleci mevkili oyuncular + o maçta played_as_goalkeeper
// işaretli saha oyuncuları için oylama setine eklenir.
const GOALKEEPER_ATTRIBUTES = ['Uzanış', 'Tutuş', 'Dağıtım', 'Refleks', 'Hız', 'Pozisyon'];
const CONDITION_ATTR = 'Kondisyon';

// Ana mevkiye göre BECERİ niteliği seti (Kondisyon HARİÇ).
function skillAttributesFor(primary: SkillPosition | ''): string[] {
  return primary === 'KALECI' ? GOALKEEPER_ATTRIBUTES : OUTFIELD_ATTRIBUTES;
}

// Eski (sadeleştirme öncesi) nitelik adlarını yenilerine eşler — mevcut
// oyuncuların OVR'ı sıfırlanmasın diye okuma anında uygulanır. Çoğu ad zaten
// aynı (Pas, Markaj, Hız, Fiziksel Güç, Top Kontrolü, Kondisyon); yalnızca
// birkaç yeniden adlandırma var. Eşlenmeyen eski nitelikler (Kafa Topu, Enerji…)
// düşer, gerçekten yeni olanlar (Uzanış…) girilene kadar 60 sayılır.
const ATTR_RENAMES: Record<string, string> = {
  'Şut Gücü':      'Şut',
  Kurtarış:        'Tutuş',
  'Pozisyon Alma': 'Pozisyon',
};
function migrateAttributeNames(attributes: Record<string, any> | null | undefined): Record<string, number> {
  const src = attributes || {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(src)) {
    const nk = ATTR_RENAMES[k] || k;
    const num = Number(v);
    if (Number.isFinite(num) && out[nk] === undefined) out[nk] = num;
  }
  return out;
}

// Mevkiye göre nitelik AĞIRLIKLARI — OVR (overall_rating) bu tablodan
// ağırlıklı ortalama ile hesaplanır. Ağırlıklar relatif (1–5); kod
// Σ(değer×ağırlık)/Σağırlık ile 0–99'a normalize eder. İkincil mevki bu
// ağırlıklara SECONDARY_WEIGHT_FACTOR katsayısıyla harmanlanır (bkz.
// computeOverall) — Defans+Forvet oyuncusunun şutu, saf Defans'a göre OVR'ına
// daha çok yansır. İlk sürüm makul varsayılanlar; ince ayar sonradan.
const SECONDARY_WEIGHT_FACTOR = 0.5;
const POSITION_WEIGHTS: Record<SkillPosition, Record<string, number>> = {
  // Kaleci — kendi 6'sı üzerinden.
  KALECI: {
    Refleks: 5, Tutuş: 5, Uzanış: 4, Pozisyon: 4, Dağıtım: 3, Hız: 1,
  },
  // Saha mevkileri — [Şut, Pas, Top Kontrolü, Markaj, Hız, Fiziksel Güç] üzerinden.
  DEFANS: {
    Markaj: 5, 'Fiziksel Güç': 4, Hız: 3, 'Top Kontrolü': 2, Pas: 2, Şut: 1,
  },
  ON_LIBERO: {
    Pas: 5, Markaj: 4, 'Top Kontrolü': 3, 'Fiziksel Güç': 3, Hız: 2, Şut: 2,
  },
  ORTA_SAHA: {
    Pas: 5, 'Top Kontrolü': 4, Hız: 3, Şut: 3, Markaj: 2, 'Fiziksel Güç': 2,
  },
  FORVET_ARKASI: {
    Şut: 4, Pas: 4, 'Top Kontrolü': 4, Hız: 3, 'Fiziksel Güç': 2, Markaj: 1,
  },
  FORVET: {
    Şut: 5, Hız: 4, 'Top Kontrolü': 3, 'Fiziksel Güç': 3, Pas: 2, Markaj: 1,
  },
};

// Pozisyon bazlı nitelik sisteminin 6 mevkisini, saha yerleşimi/formasyon
// tarafında kullanılan eski 4'lü `Position` (KL/DEF/ORT/FOR) kovasına
// eşler — "Kadroları Kur" bu kovayı kullanarak slot atar.
const SKILL_TO_FIELD_SLOT: Record<SkillPosition, Position> = {
  KALECI:        'KL',
  DEFANS:        'DEF',
  ON_LIBERO:     'DEF',   // Defans–Orta Saha arası; sweeper kökenli, savunma ağırlıklı kova
  ORTA_SAHA:     'ORT',
  FORVET_ARKASI: 'FOR',   // "İkinci Forvet" — hücum ağırlıklı kova
  FORVET:        'FOR',
};

// Formda/oylamada gösterilecek nitelik listesi: ana mevkinin 6 beceri niteliği
// + ayrı gösterilen Kondisyon (her zaman SON sırada). İkincil mevki artık nitelik
// SETİNİ değiştirmez — yalnızca OVR ağırlığına harmanlanır (bkz. computeOverall).
function getAttributeFieldsFor(primary: SkillPosition | '', _secondary?: SkillPosition | ''): string[] {
  return [...skillAttributesFor(primary || ''), CONDITION_ATTR];
}

// Kondisyon (1-99) → OVR ÇARPANI. Nötr nokta 60 (faktör 1.0). Yüksek kondisyon
// hafif artı (99→~1.05), düşük kondisyon eksi (1→~0.90) getirir; düşükte ceza
// biraz daha diktir. Mevkiden BAĞIMSIZ — herkese aynı etki. Aralık sonra ayarlanır.
function conditionFactor(attributes: Record<string, any> | null | undefined): number {
  const raw = Number((attributes || {})[CONDITION_ATTR]);
  const k = Number.isFinite(raw) ? Math.min(99, Math.max(1, raw)) : 60;
  return k >= 60
    ? 1 + ((k - 60) / 39) * 0.05
    : 1 - ((60 - k) / 59) * 0.10;
}

// Ağırlıklı OVR (0–99). Beceri niteliklerinin (Kondisyon HARİÇ) ağırlıklı
// ortalaması × Kondisyon çarpanı. Ağırlık = ana mevki + SECONDARY_WEIGHT_FACTOR ×
// ikincil mevki → Defans+Forvet oyuncusunun şutu saf Defans'a göre daha çok yansır.
// Girilmemiş nitelik 60 sayılır (hiç nitelik girmemiş oyuncu ~60 OVR ile başlar).
function computeOverall(
  attributes: Record<string, any> | null | undefined,
  primary: SkillPosition | '' | null | undefined,
  secondary?: SkillPosition | '' | null,
): number {
  const attrs = migrateAttributeNames(attributes);
  const pw = primary   ? POSITION_WEIGHTS[primary   as SkillPosition] : null;
  const sw = secondary ? POSITION_WEIGHTS[secondary as SkillPosition] : null;

  let skillOVR: number;
  if (pw) {
    let wSum = 0, vSum = 0;
    for (const attr of skillAttributesFor(primary as SkillPosition)) {
      const w = (pw[attr] || 0) + (sw ? (sw[attr] || 0) * SECONDARY_WEIGHT_FACTOR : 0);
      if (w <= 0) continue;
      const raw = Number(attrs[attr]);
      const val = Number.isFinite(raw) ? raw : 60;
      vSum += val * w;
      wSum += w;
    }
    skillOVR = wSum ? vSum / wSum : 60;
  } else {
    // Mevki yok — beceri niteliklerinin (Kondisyon hariç) düz ortalaması, o da yoksa 60.
    const vals = OUTFIELD_ATTRIBUTES.map(n => Number(attrs[n])).filter(n => Number.isFinite(n));
    skillOVR = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 60;
  }

  return Math.min(99, Math.max(1, Math.round(skillOVR * conditionFactor(attrs))));
}

// Saha yerleşimi (posScore) ve maç-içi oyuncu kartı için, nitelik setinden 4
// özet stat türetir. Eski jenerik pace/shooting/passing/physical kolonları
// kaldırıldı; değerler attributes jsonb'sinden okunur. İlgili nitelik yoksa 60.
function deriveStats(attributes: Record<string, any> | null | undefined) {
  const a = migrateAttributeNames(attributes);
  const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 60; };
  return {
    pas:   num(a['Pas']),
    sut:   num(a['Şut']),
    fizik: num(a['Fiziksel Güç']),
    hiz:   num(a['Hız']),
  };
}

// Maç sonu oylamasında OVR YUMUŞATMA katsayısı (0-1). Tek maç OVR'ı uçurmasın:
//   yeni_nitelik = eski + OVR_K × (maç_ortalaması_0-99 − eski)
// Sonra ince ayar için tek yerden değiştir.
const OVR_K = 0.18;
// Oylama penceresi: maç bitişinden (polls.finished_at) sonra kaç saat açık kalır.
const RATING_WINDOW_HOURS = 24;

// 1-10 oy ortalamasını 0-99 nitelik ölçeğine taşır (10→99, 5→~50, 1→~10).
function ratingToAttrScale(avg10: number): number {
  return Math.round(Math.min(99, Math.max(1, (avg10 / 10) * 99)));
}

// --- YARDIMCI FONKSİYONLAR ---
function parseFormation(f: Formation) {
  const [d, o, fw] = f.split('-').map(Number);
  return { def: d, ort: o, forv: fw };
}

// Formasyonun saha slot listesi — kaleci HARİÇ.
// Örn. '2-2-1' → ['DEF','DEF','ORT','ORT','FOR']
function formationSlots(f: Formation): Position[] {
  const { def, ort, forv } = parseFormation(f);
  return [
    ...Array(def).fill('DEF'),
    ...Array(ort).fill('ORT'),
    ...Array(forv).fill('FOR'),
  ] as Position[];
}

// Takım mevcudu = 1 kaleci + saha oyuncuları
function teamSizeOf(f: Formation): number {
  const { def, ort, forv } = parseFormation(f);
  return 1 + def + ort + forv;
}

function formationsForTeamSize(teamSize?: number): Formation[] {
  return (MATCH_FORMATS.find(m => m.teamSize === teamSize) ?? MATCH_FORMATS[1]).formations;
}

function defaultFormationFor(teamSize?: number): Formation {
  return formationsForTeamSize(teamSize)[0];
}

// Bir maç için geçerli formasyon: kaydedilmiş formasyon o formatın
// seçenekleri arasında değilse (örn. format sonradan değiştirilmişse)
// formatın varsayılanına düş.
function effectiveFormation(m: MatchInfo): Formation {
  const allowed = formationsForTeamSize(m.teamSize);
  return m.formation && allowed.includes(m.formation) ? m.formation : allowed[0];
}

// ─── OTOMATİK FORMASYON ÖNERİSİ ──────────────────────────────────────────
// Maç kurulurken formasyon seçmek işe yaramıyordu: o an kimin geleceği belli
// değil. 3-2-1 seçilip sahaya 4 net defans (takım başına 2) çıkınca üçüncü DEF
// slotunu forvet dolduruyordu. Bu yüzden formasyon artık GERÇEK havuza bakılarak
// kadro kurulurken seçilir.
//
// Maliyet mantığı:
//  - EKSİK (slot > arz) kötü; ikincil mevkisi o kovaya uyan biriyle kapanıyorsa
//    ucuz, kimse uymuyorsa pahalı.
//  - FAZLA (arz > slot) daha az kötü — oyuncu başka çizgide oynar.
//  - Defans eksiği orta saha/forvet eksiğinden DAHA pahalı: forvetin defansta
//    oynaması, defansın ileride oynamasından daha çok zarar veriyor.
//  - Çift forvet ayrıca cezalı: 4 forvet var diye 2-2-2'ye geçmek yerine,
//    forvet arkası/ikincil orta saha oynayabilenlerle 2-3-1 tercih edilir.
const SHORTAGE_WEIGHT: Record<Position, number> = { KL: 1, DEF: 1.5, ORT: 1, FOR: 1 };
const SECONDARY_COVER_COST = 1;   // eksik, ikincil mevkiyle kapanıyorsa
const NO_COVER_COST        = 3;   // eksik, kimse o mevkiyi oynayamıyorsa
const SURPLUS_COST         = 0.5; // fazlalık (oyuncu başka çizgide oynar)
const EXTRA_STRIKER_COST   = 3;   // 1'den fazla forvet slotu başına

// Forvet Arkası saha kovası olarak FOR sayılır (SKILL_TO_FIELD_SLOT) ama
// pratikte orta saha çizgisini de doldurabilir — 2-3-1'in "3"ü buradan çıkıyor.
function canCover(p: PlayerInfo, pos: Position): boolean {
  if (p.secPos === pos) return true;
  if (pos !== 'ORT') return false;
  const raw = [(p as any)._rawPrimary, (p as any)._rawSecondary];
  return raw.includes('FORVET_ARKASI') || raw.includes('ORTA_SAHA');
}

function suggestFormation(pool: PlayerInfo[], teamSize?: number): Formation {
  const candidates = formationsForTeamSize(teamSize);
  const { outfield } = getGoaliesAndOutfield(pool);
  if (outfield.length === 0) return candidates[0];

  // Havuz iki takıma bölünecek → takım başına arz
  const supply = (pos: Position) => outfield.filter(p => p.pos === pos).length / 2;
  const cover  = (pos: Position) => outfield.filter(p => p.pos !== pos && canCover(p, pos)).length / 2;

  let best = candidates[0];
  let bestCost = Infinity;
  for (const f of candidates) {
    const { def, ort, forv } = parseFormation(f);
    const need: Record<string, number> = { DEF: def, ORT: ort, FOR: forv };
    let cost = forv > 1 ? (forv - 1) * EXTRA_STRIKER_COST : 0;
    (['DEF', 'ORT', 'FOR'] as Position[]).forEach(pos => {
      const have = supply(pos);
      if (need[pos] > have) {
        const gap      = need[pos] - have;
        const covered  = Math.min(gap, cover(pos));
        cost += SHORTAGE_WEIGHT[pos] * (covered * SECONDARY_COVER_COST + (gap - covered) * NO_COVER_COST);
      } else {
        cost += (have - need[pos]) * SURPLUS_COST;
      }
    });
    if (cost < bestCost - 1e-9) { bestCost = cost; best = f; }
  }
  return best;
}

const INITIAL_PLAYERS: PlayerInfo[] = [
  { id: '1', name: 'Ahmet',  pos: 'FOR', rating: 85, stats: { pas: 80, sut: 90, fizik: 85, hiz: 85 } },
  { id: '2', name: 'Burak',  pos: 'DEF', rating: 78, stats: { pas: 75, sut: 65, fizik: 85, hiz: 85 } },
  { id: '3', name: 'Can',    pos: 'ORT', rating: 83, stats: { pas: 88, sut: 80, fizik: 75, hiz: 88 } },
];

// Tam 24 saat (00:00–23:30, 30 dk aralıklarla) — gece maçları da seçilebilsin
const TIME_OPTIONS: string[] = [];
for (let h = 0; h <= 23; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2,'0')}:00`);
  TIME_OPTIONS.push(`${String(h).padStart(2,'0')}:30`);
}
const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const DAYS   = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];

// ─── ROL SİSTEMİ ─────────────────────────────────────────────────────────────
type TeamMemberRole = 'captain' | 'deputy' | 'player';

function getUserRole(members: { user_id: string; role: TeamMemberRole }[], userId: string): TeamMemberRole | null {
  return members.find((m) => m.user_id === userId)?.role ?? null;
}
function isCaptainRole(members: any[], userId: string): boolean {
  return getUserRole(members, userId) === 'captain';
}
function isDeputy(members: any[], userId: string): boolean {
  return getUserRole(members, userId) === 'deputy';
}
function isManager(members: any[], userId: string): boolean {
  const r = getUserRole(members, userId);
  return r === 'captain' || r === 'deputy';
}

type Vote   = 'yes' | 'sub' | 'no' | null;
type Screen = 'home' | 'create' | 'votes' | 'votes_player' | 'kadro' | 'players' | 'taktik' | 'settings' | 'profile_setup' | 'my_team' | 'stats_entry' | 'rate_match';

function formatDateStr(str: string) {
  const [y,m,d] = str.split('-').map(Number);
  const date = new Date(y,m-1,d);
  return `${DAYS[date.getDay()]}, ${d} ${MONTHS[m-1]} ${y}`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function matchDaysLabel(dateStr: string): string {
  const today = todayStr();
  if (dateStr === today) return 'Bugün';
  const [ty, tm, td] = today.split('-').map(Number);
  const [my, mm, md] = dateStr.split('-').map(Number);
  const diff = Math.round(
    (new Date(my, mm - 1, md).getTime() - new Date(ty, tm - 1, td).getTime()) / 86400000
  );
  if (diff === 1) return 'Yarın';
  if (diff > 1) return `${diff} gün sonra`;
  return `${Math.abs(diff)} gün önce`;
}

// Yedek (bench) listesini de saha ile aynı mantıkla — mevki kategorisine
// göre gruplu, kategori içinde rating'e göre azalan — sıralar. Sahaya
// atanmayan oyuncular rastgele/ekleniş sırasında kalmasın diye kullanılır.
const FIELD_POS_ORDER: Position[] = ['KL', 'DEF', 'ORT', 'FOR'];
function sortByFieldPosition(list: PlayerInfo[]): PlayerInfo[] {
  return [...list].sort((a, b) => {
    const orderDiff = FIELD_POS_ORDER.indexOf(a.pos) - FIELD_POS_ORDER.indexOf(b.pos);
    if (orderDiff !== 0) return orderDiff;
    return b.rating - a.rating;
  });
}

function posScore(p: PlayerInfo, targetPos: Position): number {
  const st = p.stats ?? { pas: 70, sut: 70, fizik: 70, hiz: 70 };
  let score = 0;
  if (targetPos === 'DEF') score = (st.fizik * 1.5 + st.hiz + st.pas * 0.5);
  if (targetPos === 'ORT') score = (st.pas * 1.5 + st.hiz + st.fizik * 0.5);
  if (targetPos === 'FOR') score = (st.sut * 1.5 + st.hiz + st.pas * 0.5);
  if (p.pos === targetPos) score += 1000;
  else if (p.secPos === targetPos) score += 500;
  return -score;
}

function getGoaliesAndOutfield(pool: PlayerInfo[]) {
  let goalies  = pool.filter(p => p?.pos === 'KL');
  let outfield = pool.filter(p => p?.pos !== 'KL');
  if (goalies.length >= 2) {
    goalies.sort((a,b) => b.rating - a.rating);
    outfield.push(...goalies.slice(2));
    goalies = goalies.slice(0, 2);
  } else if (goalies.length === 1) {
    outfield.sort((a,b) => a.rating - b.rating);
    const g = outfield.shift();
    if (g) goalies.push(g);
  } else {
    outfield.sort((a,b) => a.rating - b.rating);
    const g1 = outfield.shift();
    const g2 = outfield.shift();
    if (g1) goalies.push(g1);
    if (g2) goalies.push(g2);
  }
  const forcedGoalies = goalies.filter(Boolean).map(g => ({ ...g, fieldPos: 'KL' as Position }));
  return { goalies: forcedGoalies, outfield };
}

// ─── TEK KAYNAK: slot listesi → mevkiye göre oyuncu ataması ───────────────
// Verilen slot listesindeki (KL hariç) her slota, o slota en uygun oyuncuyu
// atar. Öncelik sırası posScore üzerinden:
//   1) ana mevki eşleşmesi (+1000)
//   2) ikincil mevki eşleşmesi (+500)
//   3) son çare — ham stat/rating
// Slotlar "kıtlık" sırasına göre işlenir: arz(o mevkideki oyuncu sayısı) −
// talep(o mevkideki slot sayısı) farkı en düşük olan slot ÖNCE doldurulur.
// Böylece elde tek bir gerçek defans + 3 DEF slotu varsa, o defansı önce DEF
// slotu kapar; aksi halde daha erken işlenen bir ORT slotu onu ikincil mevki
// bonusuyla (+500) kapıp defansı boşta bırakabilirdi.
// Slot, en azından bir mevki taşır; çağıran taraf ek alan (ör. takım tarafı)
// ekleyebilir ve atama sonucunda o slotu geri alır.
function assignToSlots<T extends { pos: Position }>(
  players: PlayerInfo[],
  slots: T[],
): { player: PlayerInfo; slot: T }[] {
  const pool = [...players];
  const assigned: { player: PlayerInfo; slot: T }[] = [];
  const open = [...slots];

  console.log('SLOTLAR:', JSON.stringify(slots.map(sl => sl.pos)));
  console.log('OYUNCULAR:', JSON.stringify(pool.map(p => ({
    ad: p.name,
    ham_primary:   (p as any)._rawPrimary ?? null,
    ham_secondary: (p as any)._rawSecondary ?? null,
    ham_legacy:    (p as any)._rawLegacy ?? null,
    cozulmus_pos:    p.pos,
    cozulmus_secPos: p.secPos ?? null,
  })), null, 1));

  // Bir tur: verilen eşleşme kuralına uyan oyuncusu OLAN slotları doldurur.
  // Uyan oyuncusu olmayan slot bu turda BOŞ BIRAKILIR — sonraki tura kalır.
  const takeRound = (
    label: string,
    matches: (p: PlayerInfo, pos: Position) => boolean,
  ) => {
    for (let i = open.length - 1; i >= 0; i--) {
      const slot = open[i];
      const cands = pool.filter(p => matches(p, slot.pos));
      if (cands.length === 0) continue;
      cands.sort((x, y) => posScore(x, slot.pos) - posScore(y, slot.pos));
      const chosen = cands[0];
      pool.splice(pool.indexOf(chosen), 1);
      open.splice(i, 1);
      assigned.push({ player: chosen, slot });
      console.log('ATAMA:', chosen.name, '->', slot.pos,
        `| oyuncu.pos=${chosen.pos} secPos=${chosen.secPos ?? '-'} | ${label}`);
    }
  };

  // 1) ANA MEVKİ — tam eşleşen herkes önce kendi slotuna oturur.
  // 2) İKİNCİL MEVKİ — kalan slotlar için.
  // 3) SON ÇARE — kalan slotlara kalan oyuncular (ham stat/rating).
  //
  // Turlar KRİTİK: eskiden slotlar "kıtlık" sırasına göre tek geçişte
  // işleniyordu; arzı sıfır olan bir mevkinin slotu (ör. kadroda hiç defans
  // yokken DEF slotu) EN ÖNCE işlenip son-çare fallback'iyle tam eşleşen bir
  // oyuncuyu (ör. bir ORT'yi) kendi slotundan çalıyordu. Fallback artık
  // ilk değil, son sırada.
  takeRound('ANA MEVKİ ✓', (p, pos) => p.pos === pos);
  takeRound('İKİNCİL MEVKİ', (p, pos) => p.secPos === pos);
  open.forEach(slot => {
    if (pool.length === 0) return;
    pool.sort((x, y) => posScore(x, slot.pos) - posScore(y, slot.pos));
    const chosen = pool.shift()!;
    assigned.push({ player: chosen, slot });
    console.log('ATAMA:', chosen.name, '->', slot.pos,
      `| oyuncu.pos=${chosen.pos} secPos=${chosen.secPos ?? '-'} | SON ÇARE (uygun mevkide oyuncu kalmadı)`);
  });

  return assigned;
}

function applyFormation(team: PlayerInfo[], formation: Formation): FieldPlayer[] {
  const validTeam = team.filter(Boolean);
  if (validTeam.length === 0) return [];

  // Kaleci ayrılır — formasyon sayılarına dahil değildir
  let klIndex = validTeam.findIndex(p => (p as FieldPlayer).fieldPos === 'KL' || p.pos === 'KL');
  if (klIndex === -1) {
    let minR = Infinity;
    validTeam.forEach((p, i) => { if (p.rating < minR) { minR = p.rating; klIndex = i; } });
  }
  const kl   = klIndex >= 0 ? validTeam[klIndex] : undefined;
  const rest = validTeam.filter((_, i) => i !== klIndex);

  // Slot'tan fazla oyuncu varsa kimse sessizce kaybolmasın diye listeyi
  // en esnek kova (DEF) ile tamamla
  const slots = formationSlots(formation);
  while (slots.length < rest.length) slots.push('DEF');

  const counters: Record<string, number> = { DEF: 0, ORT: 0, FOR: 0 };
  const result: FieldPlayer[] = assignToSlots(rest, slots.map(pos => ({ pos })))
    .map(({ player, slot }) => {
      const order = counters[slot.pos] ?? 0;
      counters[slot.pos] = order + 1;
      return { ...player, fieldPos: slot.pos, fieldOrder: order };
    });
  if (kl) result.unshift({ ...kl, fieldPos: 'KL', fieldOrder: 0 });
  return result;
}

// ─── TAKIM ÇEŞİTLİLİĞİ ────────────────────────────────────────────────────
// Sorun: kadro kurma TAMAMEN deterministikti (oyuncular rating'e göre sıralanıp
// hep `scoreA <= scoreB` kuralıyla dağıtılıyordu) → aynı havuz + aynı formasyon
// her zaman BİREBİR aynı kadroyu veriyordu. Üstüne güç dengesi tek başına da
// aynı ikilileri tekrar tekrar bir araya getirmeye eğilimli. Sonuç: aynı çekirdek
// her hafta aynı tarafta oynuyordu.
//
// Çözüm: son maçların açıklanmış kadrolarına bakıp "bu ikili yine aynı takımda"
// durumunu MALİYET olarak cezalandırmak; sonra dengeli kurulmuş kadro üzerinde
// aynı mevki kovasındaki oyuncuları takas ederek maliyeti düşürmek.
const PAIR_HISTORY_MATCHES = 3;   // geçmişte kaç maça bakılır
const PAIR_DECAY           = 0.65; // son maç 1.0, önceki 0.65, ondan önceki ~0.42
type DiversityLevel = 'off' | 'mid' | 'high';
// λ = "bir tam tekrar-ikili kaç OVR'lık dengesizliğe bedel". off = eski davranış.
const DIVERSITY_LAMBDA: Record<DiversityLevel, number> = { off: 0, mid: 8, high: 20 };
const VARIANT_COUNT    = 3;   // her turda kaç varyasyon sunulur
const VARIANT_RESTARTS = 150; // rastgele başlangıçlı tırmanış sayısı
// Aday kabul bandı (OVR puanı cinsinden). En iyi çözümden bu kadar sapan
// kadrolar da "yeterince iyi" sayılıp seçeneklere girer — havuz dar olduğunda
// tek/çok az varyasyon çıkmasını bu önlüyor.
const VARIANT_SPREAD = 15;

// Varyasyon HAM bölünme olarak saklanır (kim hangi takımda), diziliş değil.
// Formasyon uygulama anında geçerli formationA/formationB ile yapılır; aksi
// halde V2'ye geçince saha görünümünde elle değiştirilen formasyon sıfırlanıyordu.
type TeamVariant = { rawA: PlayerInfo[]; rawB: PlayerInfo[]; sig: string; cost: number };

// Bir bölünmenin kimliği. A/B etiketleri keyfi — tarafları yer değişmiş aynı
// bölünme AYNI kadrodur, iki varyasyon sayılmamalı. Bu yüzden kanonik imza:
// iki tarafın sıralı id listelerinden alfabetik küçük olanı başa alınır.
function splitSignature(A: PlayerInfo[], B: PlayerInfo[]): string {
  const a = A.map(p => p.id).sort().join(',');
  const b = B.map(p => p.id).sort().join(',');
  return a < b ? `${a}#${b}` : `${b}#${a}`;
}
const DIVERSITY_LABELS: Record<DiversityLevel, string> = { off: 'Kapalı', mid: 'Orta', high: 'Yüksek' };

type PairWeights = Record<string, number>;
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// Geçmiş kadro satırlarından ikili birliktelik ağırlıkları.
// pollOrder: en YENİ maç 0. sırada — indeks büyüdükçe ağırlık üstel azalır.
function buildPairWeights(
  rows: { pollId: string; side: string | null; playerId: string | null }[],
  pollOrder: string[],
): PairWeights {
  const w: PairWeights = {};
  pollOrder.forEach((pid, idx) => {
    const decay = Math.pow(PAIR_DECAY, idx);
    (['A', 'B'] as const).forEach(side => {
      const ids = rows
        .filter(r => r.pollId === pid && r.side === side && r.playerId)
        .map(r => r.playerId as string);
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const k = pairKey(ids[i], ids[j]);
          w[k] = (w[k] || 0) + decay;
        }
    });
  });
  return w;
}

// Bir takımdaki tüm ikililerin geçmiş ağırlığı toplamı = "ne kadar tanıdık kadro".
function repeatScore(team: PlayerInfo[], w: PairWeights): number {
  let s = 0;
  for (let i = 0; i < team.length; i++)
    for (let j = i + 1; j < team.length; j++) s += w[pairKey(team[i].id, team[j].id)] || 0;
  return s;
}

function teamsCost(A: PlayerInfo[], B: PlayerInfo[], w: PairWeights, lambda: number): number {
  const sum = (t: PlayerInfo[]) => t.reduce((n, p) => n + (p.rating || 0), 0);
  return Math.abs(sum(A) - sum(B)) + lambda * (repeatScore(A, w) + repeatScore(B, w));
}

// Dengeli kurulmuş bölünme üzerinde YEREL ARAMA. Yalnızca AYNI mevki kovasındaki
// (a.pos === b.pos) A↔B oyuncuları takas edilir → mevki kotası ve formasyon
// yapısı hiç bozulmaz, sadece kimin kiminle oynadığı değişir. Kaleciler
// (fieldPos='KL') sabit kalır — tek gerçek kaleci varsa takas kadroyu bozardı.
// Rastgele başlangıçlı çoklu tırmanış BİRDEN ÇOK farklı yerel optimum toplar;
// kaptan bunlar arasından (V1/V2/V3) seçer.
function collectSplits(rawA: PlayerInfo[], rawB: PlayerInfo[], w: PairWeights, lambda: number) {
  const isKL = (p: PlayerInfo) => (p as FieldPlayer).fieldPos === 'KL';
  const swappable = (A: PlayerInfo[], B: PlayerInfo[]): [number, number][] => {
    const out: [number, number][] = [];
    A.forEach((a, i) => {
      if (isKL(a)) return;
      B.forEach((b, j) => { if (!isKL(b) && a.pos === b.pos) out.push([i, j]); });
    });
    return out;
  };
  const swap = (A: PlayerInfo[], B: PlayerInfo[], i: number, j: number) => {
    const t = A[i]; A[i] = B[j]; B[j] = t;
  };
  // Aramanın gezdiği HER durum aday havuzuna girer — sadece tırmanış bitiş
  // noktalarını (yerel optimum) toplamak çok az farklı kadro veriyordu.
  const visited: { A: PlayerInfo[]; B: PlayerInfo[]; c: number }[] = [];
  const record = (A: PlayerInfo[], B: PlayerInfo[]) =>
    visited.push({ A: [...A], B: [...B], c: teamsCost(A, B, w, lambda) });

  const climb = (A: PlayerInfo[], B: PlayerInfo[]) => {
    for (let step = 0; step < 200; step++) {
      record(A, B);
      const base = teamsCost(A, B, w, lambda);
      let bestGain = 1e-9;
      let bestPair: [number, number] | null = null;
      for (const [i, j] of swappable(A, B)) {
        const A2 = [...A], B2 = [...B];
        swap(A2, B2, i, j);
        const gain = base - teamsCost(A2, B2, w, lambda);
        if (gain > bestGain + 1e-9) { bestGain = gain; bestPair = [i, j]; }
        // Eşit kazançta rastgele seç → aynı havuzda hep aynı sonuca kilitlenme
        else if (bestPair && Math.abs(gain - bestGain) < 1e-9 && Math.random() < 0.5) bestPair = [i, j];
      }
      if (!bestPair) break;
      swap(A, B, bestPair[0], bestPair[1]);
    }
  };

  // Çok sayıda rastgele başlangıçlı tırmanış. 14 oyuncu için milisaniyeler
  // sürer, bol tutmak sorun değil.
  for (let r = 0; r < VARIANT_RESTARTS; r++) {
    const A = [...rawA], B = [...rawB];
    if (r > 0) {
      // Rastgele başlangıç sarsıntısı — aramanın farklı bölgelere gitmesi için
      const cand = swappable(A, B);
      const n = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n && cand.length > 0; k++) {
        const [i, j] = cand[Math.floor(Math.random() * cand.length)];
        swap(A, B, i, j);
      }
    }
    climb(A, B);
    record(A, B);
  }
  if (visited.length === 0) return [];

  // En iyiden en fazla VARIANT_SPREAD sapan tüm FARKLI kadrolar aday olur.
  // Sadece optimumu almak tek kadro, sadece yerel optimumları almak 4-6 kadro
  // veriyordu; bu bant onlarca gerçek seçenek üretiyor ve hepsi hâlâ dengeli.
  const minCost = Math.min(...visited.map(v => v.c));
  const found = new Map<string, { A: PlayerInfo[]; B: PlayerInfo[]; c: number; sig: string }>();
  for (const v of visited) {
    if (v.c > minCost + VARIANT_SPREAD) continue;
    const sig = splitSignature(v.A, v.B);
    if (!found.has(sig)) found.set(sig, { ...v, sig });
  }
  return [...found.values()].sort((x, y) => x.c - y.c);
}

// Tek bir "en iyi" kadro yerine BİRBİRİNDEN FARKLI birkaç iyi kadro üretir.
// excludeSigs = daha önce gösterilmiş varyasyonlar → "Yeni Varyasyonlar"
// butonu aynı kadroları tekrar getirmesin. Havuz küçükse üretilebilecek farklı
// varyasyon sayısı da sınırlıdır; o durumda daha az (hatta 0) sonuç döner.
function buildTeamVariants(
  pool: PlayerInfo[],
  formation: Formation,
  pairW: PairWeights = {},
  lambda = 0,
  count = VARIANT_COUNT,
  excludeSigs: string[] = [],
): TeamVariant[] {
  const base = greedySplit(pool, formation);
  const finish = (A: PlayerInfo[], B: PlayerInfo[], sig: string, cost: number): TeamVariant =>
    ({ rawA: A, rawB: B, sig, cost });

  // Çeşitlilik kapalı → tek, saf dengeli kadro (eski davranış).
  if (lambda <= 0) {
    const sig = splitSignature(base.rawA, base.rawB);
    if (excludeSigs.includes(sig)) return [];
    return [finish(base.rawA, base.rawB, sig, teamsCost(base.rawA, base.rawB, pairW, 0))];
  }

  return collectSplits(base.rawA, base.rawB, pairW, lambda)
    .filter(r => !excludeSigs.includes(r.sig))
    .slice(0, count)
    .map(r => finish(r.A, r.B, r.sig, r.c));
}

// Güç dengesine + mevki kotasına göre ham bölünme. Çeşitlilik aramasının
// BAŞLANGIÇ noktası; tek başına deterministiktir (aynı havuz → aynı bölünme).
function greedySplit(pool: PlayerInfo[], formation: Formation) {
  const perTeam = teamSizeOf(formation);
  const { def, ort, forv } = parseFormation(formation);
  const quota: Record<string, number> = { DEF: def, ORT: ort, FOR: forv };

  const { goalies, outfield } = getGoaliesAndOutfield(pool);
  const rawA: PlayerInfo[] = goalies[0] ? [goalies[0]] : [];
  const rawB: PlayerInfo[] = goalies[1] ? [goalies[1]] : [];
  let scoreA = goalies[0]?.rating ?? 0; let scoreB = goalies[1]?.rating ?? 0;

  const pushA = (p: PlayerInfo) => { rawA.push(p); scoreA += p.rating; };
  const pushB = (p: PlayerInfo) => { rawB.push(p); scoreB += p.rating; };
  // Kaleci fieldPos='KL' ile işaretli — mevki kotasına sayılmamalı
  const countPos = (team: PlayerInfo[], pos: Position) =>
    team.filter(p => (p as FieldPlayer).fieldPos !== 'KL' && p.pos === pos).length;

  const grouped: Record<string, PlayerInfo[]> = {
    DEF: outfield.filter(p => p?.pos === 'DEF').sort((a,b) => b.rating - a.rating),
    ORT: outfield.filter(p => p?.pos === 'ORT').sort((a,b) => b.rating - a.rating),
    FOR: outfield.filter(p => p?.pos === 'FOR').sort((a,b) => b.rating - a.rating),
  };

  // 1. TUR — her mevki grubunu, o mevkinin formasyondaki KOTASI kadar iki
  // takıma rating dengesine göre dağıt. Kota dolduğunda oyuncu artıklara düşer.
  //
  // Eski kod tüm grupları FOR→ORT→DEF sırasıyla TEK bir 7 kapasitesine karşı
  // işliyordu; forvet+ortasaha fazlaysa takımlar DEF grubuna sıra gelmeden
  // dolup taşıyor ve defanslar kadroya HİÇ giremiyordu (asıl bug buydu).
  const leftovers: PlayerInfo[] = [];
  (['DEF','ORT','FOR'] as Position[]).forEach(pos => {
    grouped[pos].forEach((p: PlayerInfo) => {
      const aCan = rawA.length < perTeam && countPos(rawA, pos) < quota[pos];
      const bCan = rawB.length < perTeam && countPos(rawB, pos) < quota[pos];
      if (aCan && bCan) { if (scoreA <= scoreB) pushA(p); else pushB(p); }
      else if (aCan) pushA(p);
      else if (bCan) pushB(p);
      else leftovers.push(p);
    });
  });

  // 2. TUR — kotası dolan mevkilerden artanlar kalan boşlukları doldurur
  // (örn. 6 forvet ama toplam 2 forvet slotu varsa, artan 4 forvet buradan
  // yerleşir; applyFormation onları uygun slota dağıtır)
  leftovers.sort((a, b) => b.rating - a.rating).forEach(p => {
    if (rawA.length < perTeam && rawB.length < perTeam) {
      if (scoreA <= scoreB) pushA(p); else pushB(p);
    } else if (rawA.length < perTeam) pushA(p);
    else if (rawB.length < perTeam) pushB(p);
  });

  return { rawA, rawB };
}

// Yeni pozisyon sistemi (primary_position/secondary_position) doluysa onu
// kullanır — SKILL_TO_FIELD_SLOT ile eski 4'lü kovaya çevirir. Henüz
// nitelik formu doldurulmamış oyuncular için eski `position` alanına düşer.
function resolveFieldPos(primary: any, legacy: any): Position {
  const sp = primary as SkillPosition;
  if (sp && SKILL_TO_FIELD_SLOT[sp]) return SKILL_TO_FIELD_SLOT[sp];
  return ((legacy as Position) || 'ORT') as Position;
}
function resolveSecPos(secondary: any): Position | null {
  const sp = secondary as SkillPosition;
  return (sp && SKILL_TO_FIELD_SLOT[sp]) ? SKILL_TO_FIELD_SLOT[sp] : null;
}

function memberToPlayerInfo(m: any): PlayerInfo {
  return {
    id: String(m.user_id || m.id || ''),
    name: String(m.display_name || m.name || 'İsimsiz'),
    pos: resolveFieldPos(m.primary_position, m.position),
    secPos: resolveSecPos(m.secondary_position),
    rating: m.overall_rating != null ? Number(m.overall_rating) : computeOverall(m.attributes, m.primary_position, m.secondary_position),
    stats: deriveStats(m.attributes),
    // teşhis logları için ham DB değerleri
    _rawPrimary: m.primary_position ?? null,
    _rawSecondary: m.secondary_position ?? null,
    _rawLegacy: m.position ?? null,
  } as PlayerInfo;
}

function guestToPlayerInfo(g: any): PlayerInfo {
  return {
    id: String(g.id || ''),
    name: String(g.name || 'Misafir'),
    pos: resolveFieldPos(g.primary_position, g.position),
    secPos: resolveSecPos(g.secondary_position),
    rating: g.overall_rating != null ? Number(g.overall_rating) : computeOverall(g.attributes, g.primary_position, g.secondary_position),
    stats: deriveStats(g.attributes),
    isGuest: true,
    _rawPrimary: g.primary_position ?? null,
    _rawSecondary: g.secondary_position ?? null,
    _rawLegacy: g.position ?? null,
  } as PlayerInfo;
}

// --- MODALLAR ---
function TimePickerModal({ visible, selected, onSelect, onClose }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.modalOverlay}>
        <View style={s.modalBox}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Saat seç</Text>
            <TouchableOpacity onPress={onClose}><Text style={s.modalClose}>Kapat</Text></TouchableOpacity>
          </View>
          <FlatList data={TIME_OPTIONS} keyExtractor={t => t} renderItem={({ item }) => (
            <TouchableOpacity style={[s.timeOption, item === selected && s.timeOptionActive]}
              onPress={() => { onSelect(item); onClose(); }}>
              <Text style={[s.timeOptionText, item === selected && s.timeOptionTextActive]}>{item}</Text>
            </TouchableOpacity>
          )} />
        </View>
      </View>
    </Modal>
  );
}

function LocationPickerModal({ visible, onClose, onSelect }: any) {
  // Varsayılan olarak Türkiye/Ankara merkezli başlasın
  const [marker, setMarker] = useState({ latitude: 39.92077, longitude: 32.85411 }); 

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.card }}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>Haritadan Konum Seç</Text>
          <TouchableOpacity onPress={onClose}><Text style={s.modalClose}>Kapat</Text></TouchableOpacity>
        </View>
        <MapView
          style={{ flex: 1 }}
          initialRegion={{ ...marker, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
          onPress={(e) => setMarker(e.nativeEvent.coordinate)}
        >
          <Marker coordinate={marker} />
        </MapView>
        <View style={{ padding: 20, paddingBottom: 40 }}>
           <TouchableOpacity style={s.btnPrimary} onPress={async () => {
             try {
               const adres = await Location.reverseGeocodeAsync({
                 latitude: marker.latitude, longitude: marker.longitude,
               });
               const okunabilirAdres = [adres[0]?.district, adres[0]?.subregion, adres[0]?.city]
                 .filter(Boolean).join(', ');
               onSelect(
                 okunabilirAdres || `${marker.latitude.toFixed(2)}°N, ${marker.longitude.toFixed(2)}°E`,
                 marker.latitude,
                 marker.longitude
               );
             } catch {
               onSelect(
                 `${marker.latitude.toFixed(2)}°N, ${marker.longitude.toFixed(2)}°E`,
                 marker.latitude,
                 marker.longitude
               );
             }
             onClose();
           }}>
             <Text style={s.btnPrimaryText}>Bu Konumu Onayla</Text>
           </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function CalendarModal({ visible, selected, onSelect, onClose }: any) {
  const today = todayStr();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.modalOverlay}>
        <View style={[s.modalBox, { paddingBottom: 16 }]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Tarih seç</Text>
            <TouchableOpacity onPress={onClose}><Text style={s.modalClose}>Kapat</Text></TouchableOpacity>
          </View>
          <Calendar
            current={selected || today} minDate={today}
            onDayPress={(day: any) => { onSelect(day.dateString); onClose(); }}
            markedDates={{ [selected]: { selected: true, selectedColor: COLORS.primary } }}
            theme={{ selectedDayBackgroundColor: COLORS.primary, todayTextColor: COLORS.primary, arrowColor: COLORS.primary, textDayFontWeight: '500' }}
          />
        </View>
      </View>
    </Modal>
  );
}

function MatchDetailModal({ visible, match, onClose, poolSize }: any) {
  const activeCount  = poolSize || 1;
  const maxCapacity  = match.teamSize ? (match.teamSize * 2) : activeCount;
  const divisor      = Math.min(activeCount, maxCapacity);
  const pp           = Math.ceil((match.price || 0) / Math.max(divisor, 1));
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.modalOverlay}>
        <View style={[s.modalBox, { paddingBottom: 32 }]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Maç Detayları</Text>
            <TouchableOpacity onPress={onClose}><Text style={s.modalClose}>Kapat</Text></TouchableOpacity>
          </View>
          <View style={{ padding: 24, gap: 16 }}>
            {[
              { icon: '⚽', label: 'Maç Adı',   val: match.name },
              { icon: '📍', label: 'Konum',     val: match.location },
              { icon: '📅', label: 'Tarih',     val: formatDateStr(match.dateStr) },
              { icon: '🕐', label: 'Saat',      val: `${match.startTime} – ${match.endTime}` },
              { icon: '🏟️', label: 'Format',    val: match.teamSize ? `${match.teamSize} vs ${match.teamSize}` : 'Belirtilmedi' },
              { icon: '💵', label: 'Ücret',     val: `${match.price || 0} ₺ (Kişi Başı: ~${pp} ₺)` },
            ].map((row, i) => (
              <View key={i}>
                {i > 0 && <View style={{ height: 1, backgroundColor: COLORS.border, marginBottom: 16 }} />}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <Text style={{ fontSize: 24, width: 36 }}>{row.icon}</Text>
                  <View>
                    <Text style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: '600', marginBottom: 2 }}>{row.label}</Text>
                    <Text style={{ fontSize: 16, color: COLORS.textMain, fontWeight: '700' }}>{row.val}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PlayerStatModal({ visible, player, teamColor, onClose }: any) {
  if (!player) return null;
  const isA   = teamColor === 'A';
  const cardBg = isA ? '#1E3A5F' : '#1A4731';
  const accent = isA ? '#3B82F6' : '#34D399';
  const bars = [
    { label: 'PAS',   value: player.stats.pas,   color: '#6366F1' },
    { label: 'ŞUT',   value: player.stats.sut,   color: '#EF4444' },
    { label: 'FİZİK', value: player.stats.fizik, color: '#10B981' },
    { label: 'HIZ',   value: player.stats.hiz,   color: '#F59E0B' },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.modalOverlay}>
        <View style={[s.statCardModal, { backgroundColor: cardBg }]}>
          <View style={[s.statCardAccentLine, { backgroundColor: accent }]} />
          <TouchableOpacity onPress={onClose} style={s.statCardCloseBtn}>
            <Text style={s.statCardCloseText}>✕</Text>
          </TouchableOpacity>
          <View style={[s.statCardAvatar, { borderColor: accent, backgroundColor: cardBg }]}>
            <Text style={[s.statCardAvatarText, { color: accent }]}>{player.name[0]}</Text>
          </View>
          <Text style={s.statCardName}>{player.name}</Text>
          <View style={[s.statCardBadge, { backgroundColor: accent + '33', borderColor: accent }]}>
            <Text style={[s.statCardBadgeText, { color: accent }]}>
              {(player as FieldPlayer).fieldPos ?? player.pos}  •  Takım {isA ? 'A' : 'B'}
            </Text>
          </View>
          <View style={s.statCardRatingBox}>
            <Text style={[s.statCardRatingNum, { color: accent }]}>{player.rating}</Text>
            <Text style={s.statCardRatingLabel}>GENEL</Text>
          </View>
          <View style={s.statCardBars}>
            {bars.map(b => (
              <View key={b.label} style={s.statBarRow}>
                <Text style={s.statBarLabel}>{b.label}</Text>
                <View style={s.statBarTrack}>
                  <View style={[s.statBarFill, { width: `${b.value}%` as any, backgroundColor: b.color }]} />
                </View>
                <Text style={[s.statBarValue, { color: b.color }]}>{b.value}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── SAHA BİLEŞENLERİ ────────────────────────────────────────────────────────

function FullField({
  teamA, teamB, substitutes, selectedId, onTap, onLongPress, onSubTap, onMoveToBench, onMoveToField, votes, fieldRef, matchInfo,
}: {
  teamA: FieldPlayer[]; teamB: FieldPlayer[]; substitutes: PlayerInfo[];
  selectedId: string | null;
  onTap: (p: FieldPlayer) => void;
  onLongPress: (p: FieldPlayer) => void;
  onSubTap: (p: PlayerInfo) => void;
  onMoveToBench: () => void;
  onMoveToField: (team: 'A' | 'B') => void;
  votes: Record<string, Vote>;
  fieldRef: any;
  // Paylaşılan görsele gömülen maç bilgisi şeridi. WhatsApp grup sohbetinde
  // caption (metin) düştüğü için bilgiyi görselin İÇİNE basıyoruz.
  matchInfo?: {
    name: string; dateStr: string; startTime: string; endTime: string; location: string;
    price: number; perPerson: number; teamSize?: number;
    // Takım kimliği — paylaşılan görselin üst şeridine logo + isim basılır
    team?: { name?: string | null; logo_url?: string | null; color?: string | null } | null;
  };
}) {
  const pad = 16;
  const W = FIELD_W; const H = FIELD_H;
  const innerW = W - pad * 2; const innerH = H - pad * 2;
  const cx = W / 2; const midY = H / 2;
  const goalW = innerW * 0.38; const boxH = 48; const goalH = 16;

  const getPos = (team: FieldPlayer[], isTop: boolean) => {
    const grouped: Record<Position, FieldPlayer[]> = { KL: [], DEF: [], ORT: [], FOR: [] };
    team.forEach(p => {
      if (!p) return;
      const fp = p.fieldPos as Position;
      if (grouped[fp]) grouped[fp].push(p); else grouped.ORT.push(p);
    });
    Object.values(grouped).forEach(g => g.sort((a, b) => (a.fieldOrder ?? 0) - (b.fieldOrder ?? 0)));
    const halfH = innerH / 2;
    const yMap = isTop
      ? { KL: pad + halfH * 0.10, DEF: pad + halfH * 0.35, ORT: pad + halfH * 0.65, FOR: pad + halfH * 0.90 }
      : { KL: H-(pad + halfH*0.10), DEF: H-(pad+halfH*0.35), ORT: H-(pad+halfH*0.65), FOR: H-(pad+halfH*0.90) };
    const dots: { x: number; y: number; p: FieldPlayer }[] = [];
    (['KL','DEF','ORT','FOR'] as Position[]).forEach(pos => {
      const grp = grouped[pos]; const n = grp.length;
      grp.forEach((p, i) => dots.push({ x: pad + (innerW/(n+1))*(i+1), y: (yMap as any)[pos], p }));
    });
    return dots;
  };

  const dotsA = getPos(teamA ?? [], true);
  const dotsB = getPos(teamB ?? [], false);

  const renderDot = (x: number, y: number, p: FieldPlayer, isTeamA: boolean) => {
    if (!p || !p.id) return null;
    const displayName = p.name ?? '?';
    const isSel = p.id === selectedId;
    const dotStyle = isTeamA ? s.playerDotA : s.playerDotB;
    return (
      <TouchableOpacity key={p.id} onPress={() => onTap(p)} onLongPress={() => onLongPress(p)}
        style={{ position: 'absolute', left: x-25, top: y-15, alignItems: 'center', width: 50,
          opacity: votes[p.id] === 'sub' ? 0.75 : 1 }}>
        <View style={[dotStyle, isSel && s.playerDotSelected,
          votes[p.id] === 'sub' && { borderColor: COLORS.warning, borderWidth: 3 }]}>
          <Text style={s.playerDotText}>{displayName[0]}</Text>
        </View>
        <View style={[s.playerLabelBox, isSel && { backgroundColor: COLORS.selectHighlight }]}>
          <Text style={s.playerLabelText} numberOfLines={1}>{displayName}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const isSubSelected = substitutes.some(p => p.id === selectedId);

  return (
    <View ref={fieldRef} collapsable={false}
      style={{ width: '100%', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 20, ...s.shadow }}>
      {matchInfo && (
        <View style={{ width: '100%', marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {matchInfo.team && (
            <TeamLogo team={matchInfo.team} size={44} borderColor={matchInfo.team.color || DEFAULT_TEAM_COLOR} />
          )}
          <View style={{ flex: 1 }}>
            {matchInfo.team?.name ? (
              <Text style={{ fontSize: 11, fontWeight: '800', color: matchInfo.team.color || DEFAULT_TEAM_COLOR, letterSpacing: 0.5 }} numberOfLines={1}>
                {matchInfo.team.name.toUpperCase()}
              </Text>
            ) : null}
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }} numberOfLines={1}>⚽ {matchInfo.name}</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B5563', marginTop: 3 }} numberOfLines={2}>
              📅 {formatDateStr(matchInfo.dateStr)}  ⏰ {matchInfo.startTime}-{matchInfo.endTime}   📍 {matchInfo.location}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#4B5563', marginTop: 3 }}>
              💵 Kasa {matchInfo.price || 0}₺ · Kişi başı ~{matchInfo.perPerson}₺{matchInfo.teamSize ? `   🏟️ ${matchInfo.teamSize}v${matchInfo.teamSize}` : ''}
            </Text>
          </View>
        </View>
      )}
      <View style={{ width: W, height: H, borderRadius: 16, overflow: 'hidden', backgroundColor: COLORS.fieldDark, marginBottom: 12 }}>
        <Svg width={W} height={H} style={{ position: 'absolute' }}>
          <Rect x={0} y={0} width={W} height={H} fill={COLORS.fieldDark} />
          <Rect x={pad} y={pad} width={innerW} height={innerH} fill="none" stroke={COLORS.fieldLine} strokeWidth={2} opacity={0.6} />
          <Line x1={pad} y1={midY} x2={W-pad} y2={midY} stroke={COLORS.fieldLine} strokeWidth={1.5} opacity={0.6} />
          <Circle cx={cx} cy={midY} r={28} fill="none" stroke={COLORS.fieldLine} strokeWidth={1.5} opacity={0.6} />
          <Circle cx={cx} cy={midY} r={4} fill={COLORS.fieldLine} opacity={0.6} />
          <Rect x={cx-goalW/2} y={pad} width={goalW} height={boxH} fill="none" stroke={COLORS.fieldLine} strokeWidth={1.5} opacity={0.6} />
          <Rect x={cx-goalW/2} y={H-pad-boxH} width={goalW} height={boxH} fill="none" stroke={COLORS.fieldLine} strokeWidth={1.5} opacity={0.6} />
          <Rect x={cx-goalW*0.38} y={pad-goalH} width={goalW*0.76} height={goalH} fill="none" stroke={COLORS.fieldLine} strokeWidth={1.5} opacity={0.8} />
          <Rect x={cx-goalW*0.38} y={H-pad} width={goalW*0.76} height={goalH} fill="none" stroke={COLORS.fieldLine} strokeWidth={1.5} opacity={0.8} />
        </Svg>
        {(dotsA ?? []).map(({ x, y, p }) => renderDot(x, y, p, true))}
        {(dotsB ?? []).map(({ x, y, p }) => renderDot(x, y, p, false))}
      </View>

      <View style={{ width: '100%', backgroundColor: '#F3F4F6', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#E5E7EB' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#4B5563' }}>🔶 Yedek Kulübesi ({substitutes.length})</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {selectedId && !isSubSelected && (
              <TouchableOpacity onPress={onMoveToBench} style={{ backgroundColor: COLORS.danger, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700' }}>⬇ Yedeğe Çek</Text>
              </TouchableOpacity>
            )}
            {selectedId && isSubSelected && (
              <>
                <TouchableOpacity onPress={() => onMoveToField('A')} style={{ backgroundColor: '#3B82F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700' }}>⬆ A'ya Al</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onMoveToField('B')} style={{ backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700' }}>⬆ B'ye Al</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
        {substitutes.length === 0 ? (
          <Text style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 8, fontStyle: 'italic' }}>
            Kulübede oyuncu yok. Sahadaki birini seçip yedeğe çekebilirsiniz.
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {substitutes.map(sub => {
              const isSel = sub.id === selectedId;
              return (
                <TouchableOpacity key={sub.id} onPress={() => onSubTap(sub)}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isSel ? '#F59E0B' : '#FFF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: isSel ? 2 : 1, borderColor: isSel ? '#92400E' : '#D1D5DB' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isSel ? '#FFF' : COLORS.textMain }}>{sub.name}</Text>
                  <Text style={{ fontSize: 10, color: isSel ? '#FEF3C7' : COLORS.textMuted, marginLeft: 4 }}>({sub.pos})</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}


function navigasyonAc(lat: number, lng: number) {
  const url = Platform.select({
    ios: `maps://app?daddr=${lat},${lng}`,
    android: `google.navigation:q=${lat},${lng}`,
  }) || `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  Linking.canOpenURL(url).then(supported => {
    Linking.openURL(supported ? url : webUrl);
  }).catch(() => Linking.openURL(webUrl));
}

// ─── ANA UYGULAMA ────────────────────────────────────────────────────────────
export default function Index() {
  const [session, setSession]     = useState<Session | null>(null);
  const [hasTeam, setHasTeam]     = useState<boolean | null>(null);
  const [nickname, setNickname]   = useState('');
  const [position, setPosition]   = useState('');
  const [profileCompleted, setProfileCompleted] = useState(false);
  const [avatar, setAvatar]       = useState('default');
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [foot, setFoot]           = useState('Sağ');

  // Takım kimliği düzenleme (kaptan + yardımcı)
  const [showTeamEditModal, setShowTeamEditModal] = useState(false);
  const [teamEditName, setTeamEditName]           = useState('');
  const [teamEditColor, setTeamEditColor]         = useState(DEFAULT_TEAM_COLOR);
  const [teamEditLogo, setTeamEditLogo]           = useState<string | null>(null);
  const [teamLogoBusy, setTeamLogoBusy]           = useState(false);
  const [teamEditSaving, setTeamEditSaving]       = useState(false);

  // Kadro çeşitliliği — son maçlardan tekrar eden ikilileri ne kadar dağıtsın
  const [diversity, setDiversity] = useState<DiversityLevel>('mid');
  // Kadro varyasyonları: tek kadro yerine birkaç farklı seçenek üretilip
  // kaptana sunulur (V1/V2/V3). variantSeen = bu turda daha önce gösterilmiş
  // imzalar; "Yeni Varyasyonlar" aynılarını tekrar getirmesin diye.
  const [teamVariants, setTeamVariants] = useState<TeamVariant[]>([]);
  const [variantIndex, setVariantIndex] = useState(0);
  const [variantSeen, setVariantSeen]   = useState<string[]>([]);
  const [variantCtx, setVariantCtx]     = useState<
    { subs: PlayerInfo[]; pool: PlayerInfo[]; formation: Formation; pairW: PairWeights; lambda: number } | null
  >(null);

  // Yoklama ayarları
  const [pollSettings, setPollSettings] = useState<PollSettings>(DEFAULT_POLL_SETTINGS);
  const [showPollSettings, setShowPollSettings] = useState(false);
  const [activePollId, setActivePollId]   = useState<string | null>(null);
  const [teamsRevealed, setTeamsRevealed] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  
  // Kaptan state'i (Supabase'den çekilen role göre belirleniyor)
  const [isCaptain, setIsCaptain] = useState(false);
  const [myRole, setMyRole] = useState<TeamMemberRole | null>(null);

  const [myTeamInfo, setMyTeamInfo]     = useState<any>(null);
  const [myTeamMembers, setMyTeamMembers] = useState<any[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [pendingInviteInfo, setPendingInviteInfo] = useState<{ code: string; teamName: string; teamId: string } | null>(null);

  // Takımım ekranı
  const [myTeamTab, setMyTeamTab]               = useState<'members' | 'guests'>('members');
  const [guestPlayers, setGuestPlayers]         = useState<any[]>([]);
  const [selectedPlayerCard, setSelectedPlayerCard] = useState<any | null>(null);
  const [cardIsGuest, setCardIsGuest]           = useState(false);

  // Pozisyon bazlı nitelik formu (detaylı nitelikler modalı)
  const [showAttrModal, setShowAttrModal]       = useState(false);
  const [attrTarget, setAttrTarget]             = useState<any | null>(null);
  const [attrIsGuest, setAttrIsGuest]           = useState(false);
  const [attrPrimary, setAttrPrimary]           = useState<SkillPosition | ''>('');
  const [attrSecondary, setAttrSecondary]       = useState<SkillPosition | ''>('');
  const [attrVals, setAttrVals]                 = useState<Record<string, string>>({});
  const [attrSaving, setAttrSaving]             = useState(false);

  const [showGuestAddModal, setShowGuestAddModal] = useState(false);
  const [newGuestName, setNewGuestName]         = useState('');
  const [userTeams, setUserTeams]               = useState<any[]>([]);
  // teamId → o takımda oy vermediğin aktif yoklama var mı (Takımım'da kırmızı daire)
  const [teamAlerts, setTeamAlerts]             = useState<Record<string, boolean>>({});
  const [showTeamSwitchModal, setShowTeamSwitchModal] = useState(false);
  const [showMyTeamPickerModal, setShowMyTeamPickerModal] = useState(false);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showJoinTeamModal, setShowJoinTeamModal] = useState(false);
  const [newTeamName, setNewTeamName]           = useState('');
  const [myVote, setMyVote]                     = useState<Vote>(null);
  const [pollSummary, setPollSummary]           = useState<{ yes_count: number; sub_count: number; no_count: number; wait_count: number; total_members: number } | null>(null);
  const [isReady, setIsReady]           = useState(false);
  const [screen, setScreen]             = useState<Screen>('home');
  const [refreshing, setRefreshing]     = useState(false);

  const [match, setMatch] = useState<MatchInfo>({
    name: 'Haftalık maç', dateStr: todayStr(), startTime: '21:00', endTime: '22:00',
    location: 'Çankaya Halı Saha', price: 1400
  });
  const [editMatch, setEditMatch] = useState<MatchInfo>(match);
  const [showMapModal, setShowMapModal] = useState(false);

  const [players, setPlayers]   = useState<PlayerInfo[]>([]);
  const [votes, setVotes]       = useState<Record<string, Vote>>({});
  const [pollVotesMap, setPollVotesMap]       = useState<Record<string, Vote>>({});
  const [guestVotesLocal, setGuestVotesLocal] = useState<Record<string, Vote>>({});
  
  // Wizard adımı — create ekranı için (1: maç bilgisi, 2: yoklama ayarları)
  const [wizardStep, setWizardStep] = useState(1);

  // Modallar ve Seçiciler
  const [showCal, setShowCal]   = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker]     = useState(false);
  const [showMatchDetail, setShowMatchDetail] = useState(false);
  const [voteDetailModal, setVoteDetailModal] = useState<{ visible: boolean; type: Vote | 'wait' }>({ visible: false, type: 'wait' });
  const [statModal, setStatModal] = useState<{ visible: boolean; player: PlayerInfo | null; teamColor: 'A' | 'B' | null }>({ visible: false, player: null, teamColor: null });

  // Kadro
  const [teamA, setTeamA]             = useState<FieldPlayer[]>([]);
  const [teamB, setTeamB]             = useState<FieldPlayer[]>([]);
  const [substitutes, setSubstitutes] = useState<PlayerInfo[]>([]);
  const [savedSubstitutes, setSavedSubstitutes] = useState<PlayerInfo[]>([]);
  const [savedTeamA, setSavedTeamA]   = useState<FieldPlayer[]>([]);
  const [savedTeamB, setSavedTeamB]   = useState<FieldPlayer[]>([]);
  const [kadroStale, setKadroStale]   = useState(false);
  const [hasChanges, setHasChanges]   = useState(false);

  const [formationA, setFormationA]   = useState<Formation>('3-2-1');
  const [formationB, setFormationB]   = useState<Formation>('3-2-1');
  const [kadroTab, setKadroTab]       = useState<'field' | 'list'>('field');
  const [taktikTeam, setTaktikTeam]   = useState<'A' | 'B'>('A');

  const [selectedForSwap, setSelectedForSwap] = useState<any>(null);
  
  // Oyuncu Düzenleme
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName]     = useState('');
  const [newPos, setNewPos]       = useState<Position>('ORT');
  const [newSecPos, setNewSecPos] = useState<Position | null>(null);
  const [newPas, setNewPas]       = useState('');
  const [newSut, setNewSut]       = useState('');
  const [newFizik, setNewFizik]   = useState('');
  const [newHiz, setNewHiz]       = useState('');

  // Maç istatistikleri
  const [lastMatchStat, setLastMatchStat] = useState<any>(null);
  const [goalMap, setGoalMap]             = useState<Record<string, number>>({});
  const [matchesStarted, setMatchesStarted] = useState<number>(0);
  const [myTotalGoals, setMyTotalGoals]     = useState<number>(0);

  // Maç sonu performans oylaması
  const [ratingMatch, setRatingMatch]         = useState<{ pollId: string; teamId: string } | null>(null);
  const [ratingPlayers, setRatingPlayers]     = useState<RatablePlayer[]>([]);
  const [ratingAlreadyVoted, setRatingAlreadyVoted] = useState(false);

  const fieldRef         = useRef<View>(null);
  const playersScrollRef = useRef<ScrollView>(null);
  const playersScrollY   = useRef<number>(0);
  // Nitelik modalı: odaklanan alanı ortaya kaydırmak için konum takibi.
  // attrFieldsBaseY = nitelik listesinin (gap View) içerik tepesinden ofseti;
  // attrFieldY[field] = her alanın o listedeki y'si. Toplamı = mutlak scroll y.
  const attrScrollRef    = useRef<any>(null);
  const attrFieldsBaseY  = useRef<number>(0);
  const attrFieldY        = useRef<Record<string, number>>({});
  // İptal/yeni maç sırasında bayat (stale) Supabase kadro fetch'lerinin
  // yanlış poll'un state'ini/AsyncStorage'ını ezmesini önlemek için
  const activePollIdRef  = useRef<string | null>(null);

  // ─── Kullanıcı Değişiminde State Sıfırlama ───
  function resetUserState() {
    setNickname('');
    setPosition('');
    setProfileCompleted(false);
    setAvatar('default');
    setFoot('Sağ');
    setIsCaptain(false);
    setMyRole(null);
    setHasTeam(null);
    setMyTeamInfo(null);
    setMyTeamMembers([]);
    setUserTeams([]);
    setActivePollId(null);
    setMyVote(null);
    setPollSummary(null);
    setUnreadNotifCount(0);
    setPendingInviteInfo(null);
    setGuestPlayers([]);
    setMatchesStarted(0);
    setMyTotalGoals(0);
    setRatingMatch(null);
    setRatingPlayers([]);
    setRatingAlreadyVoted(false);
    setScreen('home');
  }

  // ─── Supabase / Profil Yükleme Fonksiyonları ───
  async function fetchProfile(userId: string) {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (data) {
        if (data.display_name)    setNickname(data.display_name);
        if (data.main_position)   setPosition(data.main_position);
        if (data.avatar_url)      setAvatar(data.avatar_url);
        if (data.preferred_foot)  setFoot(data.preferred_foot);
        if (data.display_name && data.main_position) {
          setProfileCompleted(true);
        } else {
          setScreen('profile_setup');
        }

        if (data.pending_invite_code) {
          const { data: invite } = await supabase
            .from('team_invites')
            .select('team_id, expires_at, teams(name)')
            .eq('code', data.pending_invite_code)
            .single();
          if (invite && (!invite.expires_at || new Date(invite.expires_at) > new Date())) {
            setPendingInviteInfo({
              code: data.pending_invite_code,
              teamName: (invite.teams as any)?.name || 'Takım',
              teamId: invite.team_id,
            });
          } else {
            await supabase.from('profiles').update({ pending_invite_code: null }).eq('id', userId);
          }
        }
      }
    } catch (e) { console.log('Profil yüklenemedi:', e); }
  }

  async function fetchUnreadNotifs(userId: string) {
    try {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);
      setUnreadNotifCount(count || 0);
    } catch { /* sessiz hata */ }
  }

  async function fetchActivePoll(teamId: string): Promise<string | null> {
    try {
      const { data } = await supabase
        .from('polls')
        .select('id, option_yes_label, option_sub_label, option_no_label, teams_revealed, match_date')
        .eq('team_id', teamId)
        .eq('is_active', true)
        .maybeSingle();

      if (data) {
        // Saat bazlı otomatik arşivleme — sadece pasifleştir, kayıtları silme
        if (data.match_date) {
          // Bitiş/başlangıç saatini önce polls'ta yok, @match'ten oku; yoksa 23:59 kullan
          let timeStr = '23:59';
          try {
            const smRaw = await AsyncStorage.getItem('@match');
            if (smRaw) {
              const sm = JSON.parse(smRaw);
              timeStr = sm.endTime || sm.startTime || '23:59';
            }
          } catch { /* AsyncStorage okunamazsa 23:59 kalır */ }

          const [yy, mm, dd] = data.match_date.split('-').map(Number);
          const [hh, min]    = timeStr.split(':').map(Number);
          const matchEnd     = new Date(yy, mm - 1, dd, hh, min, 0);

          if (matchEnd < new Date()) {
            // Maç saati geçti. Sadece pasifleştirmek YETMEZ: maç-sonu performans
            // oylaması penceresi ancak is_finished=true + finished_at ile açılır
            // (bkz. fetchOpenRatingMatch). Kaptan "Maçı Bitir"e basmadan maç kendi
            // kendine bittiğinde de oylama gelsin diye burada BİTMİŞ işaretliyoruz.
            // finished_at yalnızca bir kez set edilir (finished_at IS NULL guard'ı)
            // → tekrar tekrar açılışta finished_at ileri kaymaz, 24h pencere sabit.
            await supabase.from('polls')
              .update({ is_active: false, is_finished: true, finished_at: new Date().toISOString() })
              .eq('id', data.id)
              .is('finished_at', null);
            activePollIdRef.current = null;
            setActivePollId(null);
            setTeamsRevealed(false);
            setSavedTeamA([]); setSavedTeamB([]); setSavedSubstitutes([]);
            await AsyncStorage.multiRemove(['@teamA', '@teamB', '@substitutes', '@formationA', '@formationB']);
            // Oylamayı aynı açılışta göster — home effect'inin ayrıca çağırmasını bekleme
            if (session?.user?.id) fetchOpenRatingMatch(session.user.id, teamId);
            return null;
          }
        }
        // Farklı bir maça geçildiyse (poll id değiştiyse) önceki maçtan kalma
        // kadro state'i/AsyncStorage'ı temizle — asıl veri aşağıdaki Supabase
        // yükleme effect'i tarafından bu maçın gerçek match_lineups'undan doldurulur
        if (activePollIdRef.current !== data.id) {
          activePollIdRef.current = data.id;
          setSavedTeamA([]); setSavedTeamB([]); setSavedSubstitutes([]);
          await AsyncStorage.multiRemove(['@teamA', '@teamB', '@substitutes', '@formationA', '@formationB']);
        }
        setActivePollId(data.id);
        setTeamsRevealed(data.teams_revealed ?? false);
        setPollSettings({
          optionYesLabel: data.option_yes_label,
          optionSubLabel: data.option_sub_label,
          optionNoLabel:  data.option_no_label,
        });
        return data.id;
      }
    } catch { /* sorgu hatası — aşağıda aktif yoklama yokmuş gibi temizlenir */ }
    // Bu takımda aktif yoklama YOK — önceki takımdan sızan poll/kadro state'ini
    // temizle. Aksi halde (ör. A'da oyuncu, B'de kaptan) B'ye geçince A'nın
    // aktif poll'u state'te kalıp "Maçı Bitir" gibi yetkileri yanlışlıkla açar.
    activePollIdRef.current = null;
    setActivePollId(null);
    setTeamsRevealed(false);
    setSavedTeamA([]); setSavedTeamB([]); setSavedSubstitutes([]);
    setTeamA([]); setTeamB([]); setSubstitutes([]);
    setKadroStale(false); setHasChanges(false);
    await AsyncStorage.multiRemove(['@teamA', '@teamB', '@substitutes', '@formationA', '@formationB', '@match']);
    return null;
  }

  async function fetchMatchesStarted(userId: string, teamId: string, pollId?: string | null) {
    try {
      let query = supabase
        .from('match_lineups')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .eq('lineup', 'field');
      if (pollId) query = query.neq('poll_id', pollId);
      const { count } = await query;
      setMatchesStarted(count ?? 0);
    } catch { /* sessiz hata */ }
  }

  // Oyuncunun bu takımda oynanmış (bitmiş) maçlarda attığı TOPLAM gol.
  // Kaynak: match_goals — bu tablo sadece maç sonu istatistik girilince yazılır,
  // yani aktif/iptal maçlar doğal olarak hariçtir. match_stats!inner(team_id)
  // ile takıma göre filtrelenir ("sahada başladığın maç" ile aynı mantık).
  async function fetchMyTotalGoals(userId: string, teamId: string) {
    try {
      const { data } = await supabase
        .from('match_goals')
        .select('goals, match_stats!inner(team_id)')
        .eq('player_id', userId)
        .eq('match_stats.team_id', teamId);
      const total = (data ?? []).reduce((sum: number, row: any) => sum + (row.goals ?? 0), 0);
      setMyTotalGoals(total);
    } catch { /* sessiz hata */ }
  }

  // ─── MAÇ SONU PERFORMANS OYLAMASI ─────────────────────────────────────────

  // O maçta lineup='field' olan oyuncuları (voter HARİÇ) puanlanabilir liste
  // olarak hazırlar. Her oyuncunun nitelik seti kendi primary/secondary
  // mevkisinden (getAttributeFieldsFor) gelir; played_as_goalkeeper ise
  // kalecilik nitelikleri de eklenir.
  async function buildRatablePlayers(pollId: string, teamId: string, voterId: string): Promise<RatablePlayer[]> {
    const { data: rows } = await supabase
      .from('match_lineups')
      .select('user_id, guest_id, display_name, position, played_as_goalkeeper')
      .eq('poll_id', pollId)
      .eq('lineup', 'field');
    if (!rows) return [];
    const others = rows.filter((r: any) => r.user_id !== voterId); // kendisi hariç

    const memberIds = others.filter((r: any) => r.user_id).map((r: any) => r.user_id);
    const guestIds  = others.filter((r: any) => r.guest_id).map((r: any) => r.guest_id);
    const [memRes, gstRes] = await Promise.all([
      memberIds.length
        ? supabase.from('team_members').select('user_id, primary_position, secondary_position').eq('team_id', teamId).in('user_id', memberIds)
        : Promise.resolve({ data: [] as any[] }),
      guestIds.length
        ? supabase.from('guest_players').select('id, primary_position, secondary_position').in('id', guestIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const memMap = new Map((memRes.data || []).map((m: any) => [m.user_id, m]));
    const gstMap = new Map((gstRes.data || []).map((g: any) => [g.id, g]));

    const result: RatablePlayer[] = [];
    for (const r of others) {
      const src = r.user_id ? memMap.get(r.user_id) : gstMap.get(r.guest_id);
      const primary   = (src?.primary_position   as SkillPosition) || '';
      const secondary = (src?.secondary_position as SkillPosition) || '';
      let attrs = getAttributeFieldsFor(primary, secondary);
      if (r.played_as_goalkeeper) {
        const set = new Set(attrs);
        GOALKEEPER_ATTRIBUTES.forEach(a => set.add(a));
        attrs = Array.from(set);
      }
      result.push({
        key:          r.user_id || r.guest_id,
        name:         r.display_name || 'Oyuncu',
        isGuest:      !r.user_id,
        ratedUserId:  r.user_id || null,
        ratedGuestId: r.guest_id || null,
        fieldPos:     r.position || 'ORT',
        playedAsGoalkeeper: !!r.played_as_goalkeeper,
        attributes:   attrs,
      });
    }
    return result;
  }

  // Home yüklenince çağrılır: (1) penceresi kapanmış işlenmemiş maçları işler,
  // (2) hâlâ açık pencerede voter'ın oy verebileceği maç varsa state'e koyar.
  async function fetchOpenRatingMatch(userId: string, teamId: string) {
    try {
      await processExpiredRatingMatches(teamId);

      const openThreshold = new Date(Date.now() - RATING_WINDOW_HOURS * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from('polls')
        .select('id, finished_at')
        .eq('team_id', teamId)
        .eq('is_finished', true)
        .is('ratings_processed_at', null)
        .gt('finished_at', openThreshold)
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) { setRatingMatch(null); setRatingPlayers([]); setRatingAlreadyVoted(false); return; }

      // Voter bu maçta saha oyuncusu mu? Değilse oy veremez.
      const { count: fieldCount } = await supabase
        .from('match_lineups')
        .select('*', { count: 'exact', head: true })
        .eq('poll_id', data.id).eq('lineup', 'field').eq('user_id', userId);
      if (!fieldCount) { setRatingMatch(null); setRatingPlayers([]); setRatingAlreadyVoted(false); return; }

      const { count: votedCount } = await supabase
        .from('player_ratings')
        .select('*', { count: 'exact', head: true })
        .eq('poll_id', data.id).eq('voter_id', userId);

      const players = await buildRatablePlayers(data.id, teamId, userId);
      setRatingMatch({ pollId: data.id, teamId });
      setRatingPlayers(players);
      setRatingAlreadyVoted((votedCount ?? 0) > 0);
    } catch (e) {
      console.log('fetchOpenRatingMatch hata:', e);
    }
  }

  // Voter'ın oylarını kaydeder (delete+insert → pencere kapanana dek yeniden
  // oy verilebilir, unique index korur).
  async function submitMatchRatings(scores: Record<string, Record<string, number>>) {
    if (!ratingMatch || !session?.user?.id) return;
    const { pollId, teamId } = ratingMatch;
    const voterId = session.user.id;
    try {
      await supabase.from('player_ratings').delete().eq('poll_id', pollId).eq('voter_id', voterId);
      const rows: any[] = [];
      for (const p of ratingPlayers) {
        const perAttr = scores[p.key] || {};
        for (const [attribute, score] of Object.entries(perAttr)) {
          rows.push({
            poll_id: pollId, team_id: teamId, voter_id: voterId,
            rated_user_id: p.ratedUserId, rated_guest_id: p.ratedGuestId,
            attribute, score,
          });
        }
      }
      if (rows.length > 0) {
        const { error } = await supabase.from('player_ratings').insert(rows);
        if (error) throw error;
      }
      setRatingAlreadyVoted(true);
      setRatingMatch(null);
      setRatingPlayers([]);
      Alert.alert('Teşekkürler', 'Oyların kaydedildi. Pencere kapanınca (24 saat) puanlar işlenecek.');
      setScreen('home');
    } catch (err: any) {
      Alert.alert('Hata', err.message ?? 'Oylar kaydedilemedi.');
    }
  }

  // Penceresi kapanmış (finished_at + 24h geçmiş) ve henüz işlenmemiş maçları bulur.
  async function processExpiredRatingMatches(teamId: string) {
    const closedThreshold = new Date(Date.now() - RATING_WINDOW_HOURS * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from('polls')
      .select('id')
      .eq('team_id', teamId)
      .eq('is_finished', true)
      .is('ratings_processed_at', null)
      .lte('finished_at', closedThreshold);
    if (!data) return;
    for (const p of data) {
      await processMatchRatings(p.id, teamId);
    }
  }

  // KADEMELİ OVR GÜNCELLEME — pencere kapanınca bir maçın oylarını toplayıp her
  // oyuncunun niteliklerini yumuşatarak günceller. ATOMİK GUARD: koşullu UPDATE
  // ile ratings_processed_at yalnızca hâlâ null'ken set edilir; aynı anda iki
  // client açsa bile yalnızca "kazanan" devam eder → çift işleme yok (idempotent).
  async function processMatchRatings(pollId: string, teamId: string) {
    const closedThreshold = new Date(Date.now() - RATING_WINDOW_HOURS * 3600 * 1000).toISOString();
    const { data: claimed, error: claimErr } = await supabase
      .from('polls')
      .update({ ratings_processed_at: new Date().toISOString() })
      .eq('id', pollId)
      .eq('is_finished', true)
      .is('ratings_processed_at', null)
      .lte('finished_at', closedThreshold)
      .select('id');
    if (claimErr || !claimed || claimed.length === 0) return; // başka client aldı ya da uygun değil

    try {
      const { data: votes } = await supabase
        .from('player_ratings')
        .select('rated_user_id, rated_guest_id, attribute, score')
        .eq('poll_id', pollId);
      if (!votes || votes.length === 0) return;

      // Grupla: playerKey -> { userId, guestId, attr -> [scores] }
      type Agg = { userId: string | null; guestId: string | null; attrs: Record<string, number[]> };
      const map = new Map<string, Agg>();
      for (const v of votes as any[]) {
        const key = v.rated_user_id || v.rated_guest_id;
        if (!key) continue;
        let a = map.get(key);
        if (!a) { a = { userId: v.rated_user_id, guestId: v.rated_guest_id, attrs: {} }; map.set(key, a); }
        if (!a.attrs[v.attribute]) a.attrs[v.attribute] = [];
        a.attrs[v.attribute].push(Number(v.score));
      }

      for (const agg of map.values()) {
        const isGuest = !!agg.guestId;
        const table   = isGuest ? 'guest_players' : 'team_members';
        const curQuery = isGuest
          ? supabase.from(table).select('attributes, primary_position, secondary_position').eq('id', agg.guestId)
          : supabase.from(table).select('attributes, primary_position, secondary_position').eq('user_id', agg.userId).eq('team_id', teamId);
        const { data: cur } = await curQuery.maybeSingle();
        const oldAttrs: Record<string, number> = migrateAttributeNames(cur?.attributes as any);
        const primary   = (cur?.primary_position   as SkillPosition) || null;
        const secondary = (cur?.secondary_position as SkillPosition) || null;

        const newAttrs: Record<string, number> = { ...oldAttrs };
        for (const [attr, scores] of Object.entries(agg.attrs)) {
          const avg    = scores.reduce((s, n) => s + n, 0) / scores.length;
          const scaled = ratingToAttrScale(avg);
          const raw    = Number(oldAttrs[attr]);
          const old    = Number.isFinite(raw) ? raw : 60;
          const next   = Math.round(old + OVR_K * (scaled - old)); // kademeli/yumuşak
          newAttrs[attr] = Math.min(99, Math.max(1, next));
        }
        const overall_rating = computeOverall(newAttrs, primary, secondary);

        const updQuery = isGuest
          ? supabase.from(table).update({ attributes: newAttrs, overall_rating }).eq('id', agg.guestId)
          : supabase.from(table).update({ attributes: newAttrs, overall_rating }).eq('user_id', agg.userId).eq('team_id', teamId);
        await updQuery;
      }
    } catch (e) {
      console.log('processMatchRatings hata:', e);
    }
  }

  async function fetchMyTeam(userId: string) {
    try {
      // Kullanıcının TÜM üyelikleri. (.single() KALDIRILDI — çok takımda "çok satır"
      // hatası verip hasTeam=false yapıyordu → "takımda değilsiniz".)
      const { data: memberships } = await supabase
        .from('team_members')
        .select('team_id, role')
        .eq('user_id', userId);

      // Hedef takım: kayıtlı @mainTeamId üyeliklerden biriyse onu; değilse ilk
      // takımı kullan ve @mainTeamId'yi ona sabitle. Böylece TEK takımda otomatik
      // seçilir, ÇOK takımda kalıcı "ana takım" gösterilir (Takımım'dan değişince güncellenir).
      let memberData: { team_id: string; role: string } | null = null;
      if (memberships && memberships.length > 0) {
        const savedMain = await AsyncStorage.getItem('@mainTeamId');
        memberData = (savedMain && memberships.find((m: any) => m.team_id === savedMain)) || memberships[0];
        if (memberData.team_id !== savedMain) {
          await AsyncStorage.setItem('@mainTeamId', memberData.team_id);
        }
      }

      if (memberData) {
        setHasTeam(true);
        // İŞTE BURASI: Kaptanlık yetkisi Supabase'den gelen role göre atanıyor
        setIsCaptain(memberData.role === 'captain' || memberData.role === 'admin');
        setMyRole(memberData.role as TeamMemberRole);

        const { data: teamData } = await supabase
          .from('teams').select('*').eq('id', memberData.team_id).single();
        setMyTeamInfo(teamData);

        const { data: roster } = await supabase
          .from('team_members')
          .select('user_id, role, position, primary_position, secondary_position, attributes, overall_rating')
          .eq('team_id', memberData.team_id);

        if (roster && roster.length > 0) {
          const userIds = roster.map((r: any) => r.user_id);
          const { data: profs } = await supabase.from('profiles').select('*').in('id', userIds);
          const merged = (profs || []).map(prof => {
            const entry = roster.find((r: any) => r.user_id === prof.id);
            return { ...prof, ...entry };
          });
          setMyTeamMembers(merged);
        }

        const activePoll = await fetchActivePoll(memberData.team_id);
        await fetchMatchesStarted(userId, memberData.team_id, activePoll);
        await fetchMyTotalGoals(userId, memberData.team_id);
        await fetchGuestPlayers(memberData.team_id);
        await fetchLastMatchStat(memberData.team_id);
      } else {
        setHasTeam(false);
      }
    } catch {
      setHasTeam(false);
    }
  }

  // ─── Davet Fonksiyonları ─────────────────────────────────────────────────────

  const generateInviteLink = async () => {
    const myTeam = myTeamInfo;
    console.log('1. Davet fonksiyonu başladı');
    console.log('2. myTeam:', myTeam);
    console.log('3. session user:', session?.user?.id);

    try {
      if (!myTeam?.id) {
        Alert.alert('Hata', 'Aktif takım bulunamadı');
        console.log('HATA: myTeam.id yok');
        return;
      }

      const kod = Math.random().toString(36).substring(2, 10).toUpperCase();
      console.log('4. Üretilen kod:', kod);

      const { data, error } = await supabase
        .from('team_invites')
        .insert({
          team_id: myTeam.id,
          created_by: session!.user.id,
          code: kod,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      console.log('5. Insert data:', data);
      console.log('6. Insert error:', error);

      if (error) {
        Alert.alert('Veritabanı Hatası', error.message);
        return;
      }

      console.log('7. Clipboard kopyalanıyor');
      const davetMetni = `🔑 KOD: ${kod}\n\nHalı saha takımıma katıl!\nKodu uygulamada Takımım → Takıma Katıl bölümüne gir.`;
      await Clipboard.setStringAsync(davetMetni);
      console.log('8. Clipboard tamamlandı');
      Alert.alert(
        'Davet Kodu Hazır! 🎉',
        `Kod: ${kod}`,
        [
          {
            text: '📤 Paylaş',
            onPress: async () => {
              try {
                await Share.share({ message: davetMetni });
              } catch (e: any) {
                Alert.alert('Hata', e.message);
              }
            },
          },
          {
            text: '📋 Kodu Kopyala',
            onPress: async () => {
              await Clipboard.setStringAsync(kod);
              Alert.alert('Kopyalandı ✓', `Davet kodu panoya kopyalandı: ${kod}`);
            },
          },
          { text: 'Kapat', style: 'cancel' },
        ]
      );

    } catch (e: any) {
      console.log('CATCH HATASI:', e.message);
      Alert.alert('Beklenmeyen Hata', e.message);
    }
  };

  async function handleJoinWithCode(code: string) {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { Alert.alert('Hata', 'Lütfen bir davet kodu girin.'); return; }
    try {
      const { data: invite, error } = await supabase
        .from('team_invites')
        .select('team_id, expires_at, teams(name)')
        .eq('code', trimmed)
        .single();
      if (error || !invite) { Alert.alert('Geçersiz Kod', 'Bu davet kodu bulunamadı.'); return; }
      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        Alert.alert('Süresi Dolmuş', 'Bu davet kodunun süresi dolmuş.'); return;
      }
      setPendingInviteInfo({
        code: trimmed,
        teamName: (invite.teams as any)?.name || 'Takım',
        teamId: invite.team_id,
      });
    } catch (err: any) {
      Alert.alert('Hata', err.message);
    }
  }

  async function handleAcceptInvite() {
    if (!pendingInviteInfo || !session?.user?.id) return;
    try {
      const { error } = await supabase.from('team_members').insert({
        team_id: pendingInviteInfo.teamId,
        user_id: session.user.id,
        role: 'player',
      });
      if (error) throw error;
      await supabase.from('profiles').update({ pending_invite_code: null }).eq('id', session.user.id);
      const teamName = pendingInviteInfo.teamName;
      const joinedTeamId = pendingInviteInfo.teamId;
      setPendingInviteInfo(null);
      setHasTeam(true);
      // Katılınan takımı ana takım yap → fetchMyTeam onu göstersin; switcher için listeyi tazele.
      await AsyncStorage.setItem('@mainTeamId', joinedTeamId);
      await fetchMyTeam(session.user.id);
      await fetchUserTeams(session.user.id);
      Alert.alert('Hoş Geldin! 🎉', `${teamName} takımına katıldın!`);
    } catch (err: any) {
      Alert.alert('Hata', err.message);
    }
  }

  async function handleDeclineInvite() {
    if (session?.user?.id) {
      await supabase.from('profiles').update({ pending_invite_code: null }).eq('id', session.user.id);
    }
    setPendingInviteInfo(null);
  }

  async function fetchGuestPlayers(teamId: string) {
    const { data } = await supabase
      .from('guest_players')
      .select('*')
      .eq('team_id', teamId)
      .order('name');
    setGuestPlayers(data || []);
  }

  // Detaylı (pozisyon bazlı) nitelik formunu bir oyuncu için açar
  function openAttrModal(target: any, isGuest: boolean) {
    const primary   = (target.primary_position   as SkillPosition) || '';
    const secondary = (target.secondary_position as SkillPosition) || '';
    const existing: Record<string, number> = migrateAttributeNames(target.attributes);
    const fields = getAttributeFieldsFor(primary, secondary);
    const vals: Record<string, string> = {};
    fields.forEach(f => { vals[f] = String(existing[f] ?? 60); });

    setAttrTarget(target);
    setAttrIsGuest(isGuest);
    setAttrPrimary(primary);
    setAttrSecondary(secondary);
    setAttrVals(vals);
    setSelectedPlayerCard(null);
    setShowAttrModal(true);
  }

  async function handleSaveAttributes() {
    if (!attrTarget || !myTeamInfo?.id || attrSaving) return;
    if (!attrPrimary) {
      Alert.alert('Eksik Bilgi', 'Ana mevki seçmelisin.');
      return;
    }
    setAttrSaving(true);
    try {
      const fields = getAttributeFieldsFor(attrPrimary, attrSecondary);
      const attributes: Record<string, number> = {};
      fields.forEach(f => {
        attributes[f] = Math.min(99, Math.max(1, parseInt(attrVals[f]) || 60));
      });
      // OVR = ANA mevkiye göre ağırlıklı ortalama (0–99)
      const overall_rating = computeOverall(attributes, attrPrimary, attrSecondary);
      const payload = {
        primary_position:   attrPrimary,
        secondary_position: attrSecondary || null,
        attributes,
        overall_rating,
      };

      if (attrIsGuest) {
        const { error } = await supabase.from('guest_players').update(payload).eq('id', attrTarget.id);
        if (error) throw error;
        setGuestPlayers(prev => prev.map(g => g.id === attrTarget.id ? { ...g, ...payload } : g));
      } else {
        const targetUserId = attrTarget.user_id || attrTarget.id;
        const { error } = await supabase.from('team_members').update(payload)
          .eq('user_id', targetUserId).eq('team_id', myTeamInfo.id);
        if (error) throw error;
        setMyTeamMembers(prev => prev.map(m => (m.user_id || m.id) === targetUserId ? { ...m, ...payload } : m));
      }

      setShowAttrModal(false);
      setAttrTarget(null);
    } catch (err: any) {
      Alert.alert('Hata', err.message);
    } finally {
      setAttrSaving(false);
    }
  }

  async function handleAddGuest() {
    if (!newGuestName.trim() || !myTeamInfo?.id || !session?.user?.id) return;
    const { error } = await supabase.from('guest_players').insert({
      team_id: myTeamInfo.id,
      added_by: session.user.id,
      name: newGuestName.trim(),
      // Mevki ekleme anında sorulmuyor — nitelik formunda primary_position ile
      // belirleniyor. Buradaki legacy `position` yalnızca o form doldurulana
      // kadarki saha kovası varsayılanı (resolveFieldPos zaten 'ORT'a düşer).
      position: 'ORT',
      // Nitelikler boş başlar; kaptan "Nitelikleri Düzenle" ile girer.
      // Girilene kadar OVR mevkiye göre 60 civarı hesaplanır (computeOverall).
      attributes: {},
    });
    if (error) { Alert.alert('Hata', error.message); return; }
    setNewGuestName('');
    setShowGuestAddModal(false);
    await fetchGuestPlayers(myTeamInfo.id);
  }

  // ─── TAKIM KİMLİĞİ (logo / isim / renk) ────────────────────────────────
  function openTeamEditModal() {
    if (!myTeamInfo) return;
    setTeamEditName(myTeamInfo.name || '');
    setTeamEditColor(myTeamInfo.color || DEFAULT_TEAM_COLOR);
    setTeamEditLogo(myTeamInfo.logo_url || null);
    setShowTeamEditModal(true);
  }

  // Galeriden kare logo seçip Supabase Storage'a yükler ve public URL döndürür.
  // NOT: expo-file-system KULLANILMIYOR — SDK 54'te API'si değişti; onun yerine
  // ImagePicker'ın `base64: true` seçeneğiyle veriyi doğrudan alıyoruz.
  async function pickAndUploadTeamLogo() {
    if (!myTeamInfo?.id) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('İzin Gerekli', 'Logo seçebilmek için galeri erişimine izin vermelisin.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],     // logo her yerde yuvarlak gösteriliyor → kare kırp
        quality: 0.7,
        base64: true,
      });
      if (res.canceled || !res.assets?.[0]?.base64) return;

      setTeamLogoBusy(true);
      const path = `${myTeamInfo.id}/logo_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(TEAM_LOGO_BUCKET)
        .upload(path, decodeBase64(res.assets[0].base64), { contentType: 'image/jpeg' });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(TEAM_LOGO_BUCKET).getPublicUrl(path);
      // Eski logo dosyasını sil — her değişiklikte çöp birikmesin. Başarısız
      // olursa sorun değil, yeni logo zaten yüklendi.
      const prev = teamEditLogo;
      setTeamEditLogo(pub.publicUrl);
      if (prev) await removeTeamLogoFile(prev);
    } catch (err: any) {
      Alert.alert('Logo Yüklenemedi', err.message || 'Bilinmeyen hata');
    } finally {
      setTeamLogoBusy(false);
    }
  }

  // Public URL'den bucket içi yolu çıkarıp dosyayı siler.
  async function removeTeamLogoFile(publicUrl: string) {
    try {
      const marker = `/${TEAM_LOGO_BUCKET}/`;
      const idx = publicUrl.indexOf(marker);
      if (idx === -1) return;
      const path = publicUrl.slice(idx + marker.length).split('?')[0];
      await supabase.storage.from(TEAM_LOGO_BUCKET).remove([path]);
    } catch { /* çöp dosya kalması kritik değil */ }
  }

  async function handleSaveTeamIdentity() {
    if (!myTeamInfo?.id) return;
    const name = teamEditName.trim();
    if (!name) { Alert.alert('Eksik Bilgi', 'Takım adı boş bırakılamaz.'); return; }
    setTeamEditSaving(true);
    try {
      const { error } = await supabase
        .from('teams')
        .update({ name, color: teamEditColor, logo_url: teamEditLogo })
        .eq('id', myTeamInfo.id);
      if (error) throw error;
      // Yerel state'i hemen güncelle — kullanıcı değişikliği anında görsün
      setMyTeamInfo({ ...myTeamInfo, name, color: teamEditColor, logo_url: teamEditLogo });
      setUserTeams(prev => prev.map(t =>
        t.id === myTeamInfo.id ? { ...t, name, color: teamEditColor, logo_url: teamEditLogo } : t
      ));
      setShowTeamEditModal(false);
    } catch (err: any) {
      Alert.alert('Kaydedilemedi', err.message || 'Bilinmeyen hata');
    } finally {
      setTeamEditSaving(false);
    }
  }

  async function fetchUserTeams(userId: string) {
    const { data } = await supabase
      .from('team_members')
      .select('team_id, role, teams(id, name, logo_url, color)')
      .eq('user_id', userId);
    if (data) {
      const teams = data.map((m: any) => ({
        id: m.teams?.id, name: m.teams?.name, role: m.role,
        logo_url: m.teams?.logo_url ?? null, color: m.teams?.color ?? null,
      }));
      setUserTeams(teams);
      await fetchTeamAlerts(userId, teams);
    }
  }

  // Her takım için: o takımda OY VERMEDİĞİN aktif yoklama var mı? Varsa Takımım
  // listesinde takımın yanında kırmızı daire çıkar; oy verince/pencere kapanınca söner.
  async function fetchTeamAlerts(userId: string, teams: any[]) {
    try {
      const teamIds = teams.map(t => t.id).filter(Boolean);
      if (teamIds.length === 0) { setTeamAlerts({}); return; }
      const { data: polls } = await supabase
        .from('polls')
        .select('id, team_id')
        .in('team_id', teamIds)
        .eq('is_active', true);
      if (!polls || polls.length === 0) { setTeamAlerts({}); return; }
      const pollIds = polls.map((p: any) => p.id);
      const { data: myVotes } = await supabase
        .from('poll_votes')
        .select('poll_id')
        .eq('user_id', userId)
        .in('poll_id', pollIds);
      const votedSet = new Set((myVotes || []).map((v: any) => v.poll_id));
      const alerts: Record<string, boolean> = {};
      for (const p of polls as any[]) {
        if (!votedSet.has(p.id)) alerts[p.team_id] = true; // oy vermediğin aktif yoklama
      }
      setTeamAlerts(alerts);
    } catch { /* sessiz — badge kritik değil */ }
  }

  async function handleCreateTeam(teamName: string) {
    if (!session?.user?.id || !teamName.trim()) return;
    const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data: yeniTakim, error } = await supabase
      .from('teams')
      .insert({
        name: teamName.trim(),
        captain_id: session.user.id,
        created_by: session.user.id,
        join_code: joinCode,
      })
      .select()
      .single();
    if (error) { Alert.alert('Hata', error.message); return; }
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({ team_id: yeniTakim.id, user_id: session.user.id, role: 'captain' });
    if (memberError) { Alert.alert('Hata', memberError.message); return; }
    setNewTeamName('');
    setShowCreateTeamModal(false);
    // Yeni oluşturulan takımı ana takım yap → fetchMyTeam onu yüklesin (eski ana takım değil).
    await AsyncStorage.setItem('@mainTeamId', yeniTakim.id);
    await fetchMyTeam(session.user.id);
    await fetchUserTeams(session.user.id);
    setScreen('my_team');
    Alert.alert('Takım Oluşturuldu! 🎉', `"${teamName.trim()}" takımı başarıyla oluşturuldu.`);
  }

  async function switchTeamAndGoMyTeam(teamId: string) {
    if (!session?.user?.id) return;
    if (myTeamInfo?.id === teamId) { setShowMyTeamPickerModal(false); setScreen('my_team'); return; }
    const teamEntry = userTeams.find(t => t.id === teamId);
    if (!teamEntry) return;
    const { data: teamData } = await supabase.from('teams').select('*').eq('id', teamId).single();
    if (!teamData) return;
    // Seçilen takımı kalıcı ana takım yap → sonraki açılışta ana ekranda bu gelir.
    await AsyncStorage.setItem('@mainTeamId', teamId);
    setMyTeamInfo(teamData);
    setIsCaptain(teamEntry.role === 'captain' || teamEntry.role === 'admin');
    setMyRole(teamEntry.role as TeamMemberRole);
    const activePoll = await fetchActivePoll(teamId);
    await fetchMatchesStarted(session.user.id, teamId, activePoll);
    await fetchMyTotalGoals(session.user.id, teamId);
    await fetchGuestPlayers(teamId);
    const { data: roster } = await supabase.from('team_members')
      .select('user_id, role, position, primary_position, secondary_position, attributes, overall_rating')
      .eq('team_id', teamId);
    if (roster && roster.length > 0) {
      const userIds = roster.map((r: any) => r.user_id);
      const { data: profs } = await supabase.from('profiles').select('*').in('id', userIds);
      const merged = (profs || []).map((prof: any) => {
        const entry = roster.find((r: any) => r.user_id === prof.id);
        return { ...prof, ...entry };
      });
      setMyTeamMembers(merged);
    }
    setShowMyTeamPickerModal(false);
    setScreen('my_team');
  }

  async function fetchMyVote() {
    if (!activePollId || !session?.user?.id) return;
    const { data } = await supabase
      .from('poll_votes')
      .select('vote_value')
      .eq('poll_id', activePollId)
      .eq('user_id', session.user.id)
      .single();
    setMyVote((data?.vote_value as Vote) ?? null);
  }

  async function fetchPollSummary() {
    if (!activePollId) return;
    const { data } = await supabase.rpc('get_poll_summary', { p_poll_id: activePollId });
    if (data && data.length > 0) setPollSummary(data[0]);
  }

  async function fetchLastMatchStat(teamIdArg?: string) {
    const tid = teamIdArg ?? myTeamInfo?.id;
    if (!tid) return;
    const { data } = await supabase
      .from('match_stats')
      .select('*, mvp:profiles!mvp_id(full_name), match_goals(player_id, goals, profiles(full_name))')
      .eq('team_id', tid)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (data) setLastMatchStat(data);
  }

  async function fetchGoalMap() {
    if (!myTeamInfo?.id) return;
    const { data } = await supabase
      .from('match_goals')
      .select('player_id, goals, match_stats!inner(team_id)')
      .eq('match_stats.team_id', myTeamInfo.id);
    if (!data) return;
    const map: Record<string, number> = {};
    data.forEach((row: any) => {
      map[row.player_id] = (map[row.player_id] ?? 0) + row.goals;
    });
    setGoalMap(map);
  }

  async function fetchPollVotes(pollId: string) {
    const { data } = await supabase
      .from('poll_votes')
      .select('user_id, vote_value')
      .eq('poll_id', pollId);
    const map: Record<string, Vote> = {};
    (data || []).forEach((row: any) => { map[row.user_id] = row.vote_value as Vote; });
    setPollVotesMap(map);
  }

  async function castMyVote(voteValue: 'yes' | 'sub' | 'no') {
    if (!activePollId || !session?.user?.id) return;
    await supabase.from('poll_votes').upsert(
      { poll_id: activePollId, user_id: session.user.id, vote_value: voteValue },
      { onConflict: 'poll_id,user_id' }
    );
    setMyVote(voteValue);
    if (unreadNotifCount > 0) {
      await supabase.from('notifications')
        .update({ is_read: true })
        .eq('user_id', session.user.id)
        .eq('is_read', false);
      setUnreadNotifCount(0);
    }
    await fetchPollSummary();
    if (activePollId) await fetchPollVotes(activePollId);
  }

  async function switchTeam(teamId: string) {
    if (myTeamInfo?.id === teamId) { setShowTeamSwitchModal(false); return; }
    if (!session?.user?.id) return;
    const teamEntry = userTeams.find(t => t.id === teamId);
    if (!teamEntry) return;
    const { data: teamData } = await supabase.from('teams').select('*').eq('id', teamId).single();
    if (!teamData) return;
    // Seçilen takımı kalıcı ana takım yap → sonraki açılışta ana ekranda bu gelir.
    await AsyncStorage.setItem('@mainTeamId', teamId);
    setMyTeamInfo(teamData);
    const newIsCaptain = teamEntry.role === 'captain' || teamEntry.role === 'admin';
    setIsCaptain(newIsCaptain);
    setMyRole(teamEntry.role as TeamMemberRole);
    const activePoll = await fetchActivePoll(teamId);
    await fetchMatchesStarted(session.user.id, teamId, activePoll);
    await fetchMyTotalGoals(session.user.id, teamId);
    await fetchGuestPlayers(teamId);
    const { data: roster } = await supabase.from('team_members')
      .select('user_id, role, position, primary_position, secondary_position, attributes, overall_rating')
      .eq('team_id', teamId);
    if (roster && roster.length > 0) {
      const userIds = roster.map((r: any) => r.user_id);
      const { data: profs } = await supabase.from('profiles').select('*').in('id', userIds);
      const merged = (profs || []).map((prof: any) => {
        const entry = roster.find((r: any) => r.user_id === prof.id);
        return { ...prof, ...entry };
      });
      setMyTeamMembers(merged);
    }
    setScreen(newIsCaptain ? 'votes' : 'home');
    setShowTeamSwitchModal(false);
  }

  // ─── AsyncStorage ve Auth Effectleri ───
  useEffect(() => {
    const load = async () => {
      try {
        const sm  = await AsyncStorage.getItem('@match');
        const sta = await AsyncStorage.getItem('@teamA');
        const stb = await AsyncStorage.getItem('@teamB');
        const sfa = await AsyncStorage.getItem('@formationA');
        const sfb = await AsyncStorage.getItem('@formationB');
        const sps = await AsyncStorage.getItem('@pollSettings');
        const sdv = await AsyncStorage.getItem('@diversity');

        // Eski lokal oyuncu havuzunu temizle
        await AsyncStorage.removeItem('@players');
        await AsyncStorage.removeItem('@votes');

        if (sm)  setMatch(JSON.parse(sm));
        if (sta) setSavedTeamA(JSON.parse(sta));
        if (stb) setSavedTeamB(JSON.parse(stb));
        if (sfa) setFormationA(JSON.parse(sfa));
        if (sfb) setFormationB(JSON.parse(sfb));
        if (sps) setPollSettings(JSON.parse(sps));
        if (sdv && (sdv in DIVERSITY_LAMBDA)) setDiversity(sdv as DiversityLevel);
      } catch (e) { console.log(e); }
      finally { setIsReady(true); }
    };
    load();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
        fetchMyTeam(session.user.id);
        fetchUserTeams(session.user.id);
        fetchUnreadNotifs(session.user.id);
        registerForPushNotifications(session.user.id);
      }
    });
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        resetUserState();
        setSession(null);
        return;
      }

      if (event === 'SIGNED_IN') {
        resetUserState();
      }

      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
        fetchMyTeam(session.user.id);
        fetchUserTeams(session.user.id);
        fetchUnreadNotifs(session.user.id);
        registerForPushNotifications(session.user.id);
      }
    });
  }, []);

  // Kadro ekranı açıldığında teamsRevealed değerini Supabase'den tazele
  useEffect(() => {
    if (screen === 'kadro' && activePollId) {
      supabase
        .from('polls')
        .select('teams_revealed')
        .eq('id', activePollId)
        .single()
        .then(({ data }) => {
          if (data) setTeamsRevealed(data.teams_revealed ?? false);
        });
    }
  }, [screen, activePollId]);


  // Supabase team verisi geldikten sonra kayıtlı kadroyu doğrula — eski ghost oyuncuları temizle
  useEffect(() => {
    if (myTeamMembers.length === 0) return;
    const validIds = new Set([
      ...myTeamMembers.map((m: any) => m.user_id || m.id),
      ...guestPlayers.map((g: any) => g.id),
    ]);
    const filterTeam = (team: FieldPlayer[]) => team.filter(p => validIds.has(p.id));
    const newA    = filterTeam(savedTeamA);
    const newB    = filterTeam(savedTeamB);
    const newSubs = savedSubstitutes.filter(p => validIds.has(p.id));
    const changed = newA.length !== savedTeamA.length || newB.length !== savedTeamB.length || newSubs.length !== savedSubstitutes.length;
    if (changed) {
      setSavedTeamA(newA);
      setSavedTeamB(newB);
      setSavedSubstitutes(newSubs);
      if (newA.length === 0 || newB.length === 0) {
        AsyncStorage.multiRemove(['@teamA', '@teamB', '@substitutes', '@formationA', '@formationB']);
      } else {
        AsyncStorage.setItem('@teamA', JSON.stringify(newA));
        AsyncStorage.setItem('@teamB', JSON.stringify(newB));
        AsyncStorage.setItem('@substitutes', JSON.stringify(newSubs));
      }
    }
  }, [myTeamMembers, guestPlayers]);

  useEffect(() => {
    if (activePollId) {
      fetchMyVote();
      if (!isCaptain) fetchPollSummary();
    }
  }, [activePollId, isCaptain]);

  useEffect(() => {
    if (activePollId) {
      fetchPollVotes(activePollId);
    }
  }, [activePollId, isCaptain]);

  useEffect(() => {
    if (screen === 'votes' && isCaptain && activePollId) {
      fetchPollVotes(activePollId);
    }
    if (screen === 'players') {
      fetchGoalMap();
    }
    // Home'a her gelişte: kapanmış pencereleri işle + açık oylama varsa yükle
    if (screen === 'home' && myTeamInfo?.id && session?.user?.id) {
      fetchOpenRatingMatch(session.user.id, myTeamInfo.id);
      fetchTeamAlerts(session.user.id, userTeams); // takım-yanı kırmızı daireyi tazele
    }
    if (screen !== 'create') setWizardStep(1);
  }, [screen]);

  // Takım id'si hazır olunca (ilk yükleme) açık oylama/işleme kontrolü —
  // home'a navigasyondan bağımsız olarak da bir kez çalışsın.
  useEffect(() => {
    if (myTeamInfo?.id && session?.user?.id) {
      fetchOpenRatingMatch(session.user.id, myTeamInfo.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTeamInfo?.id]);

  // activePollId değiştikçe ref'i güncel tut — aşağıdaki bayat (stale) fetch
  // koruması bu ref üzerinden "hâlâ aynı maç mıyız?" diye kontrol eder
  useEffect(() => {
    activePollIdRef.current = activePollId;
  }, [activePollId]);

  // Kadro Supabase'den yükle — yerel AsyncStorage boşsa (örn. farklı cihaz)
  useEffect(() => {
    if (!teamsRevealed || !activePollId || myTeamMembers.length === 0) return;
    if (savedTeamA.length > 0 || savedTeamB.length > 0) return;

    const pollAtFetchTime = activePollId;

    supabase
      .from('match_lineups')
      .select('user_id, guest_id, display_name, side, lineup, position')
      .eq('poll_id', activePollId)
      .then(({ data }) => {
        // Maç bu sorgu bekletilirken iptal edilip yeni bir maç açıldıysa
        // (activePollId değişti), bu bayat sonucu ne state'e ne AsyncStorage'a yazma
        if (pollAtFetchTime !== activePollIdRef.current) return;
        if (!data || data.length === 0) return;

        const fieldRows = data.filter((r: any) => r.lineup === 'field');
        const benchRows = data.filter((r: any) => r.lineup === 'bench');
        const countersA: Record<string, number> = {};
        const countersB: Record<string, number> = {};

        const toFieldPlayer = (row: any, counters: Record<string, number>): FieldPlayer => {
          const member = myTeamMembers.find((m: any) => (m.user_id || m.id) === row.user_id);
          const guest  = guestPlayers.find((g: any) => g.id === row.guest_id);
          const fieldPos = ((row.position as Position) || 'ORT') as Position;
          const base: PlayerInfo = member
            ? memberToPlayerInfo(member)
            : guest
            ? guestToPlayerInfo(guest)
            : { id: row.user_id || row.guest_id || '', name: row.display_name || '?', pos: fieldPos, rating: 70, stats: { pas: 70, sut: 70, fizik: 70, hiz: 70 } };
          const order = counters[fieldPos] ?? 0;
          counters[fieldPos] = order + 1;
          return { ...base, fieldPos, fieldOrder: order };
        };

        const toPlayerInfo = (row: any): PlayerInfo => {
          const member = myTeamMembers.find((m: any) => (m.user_id || m.id) === row.user_id);
          const guest  = guestPlayers.find((g: any) => g.id === row.guest_id);
          if (member) return memberToPlayerInfo(member);
          if (guest)  return guestToPlayerInfo(guest);
          return { id: row.user_id || row.guest_id || '', name: row.display_name || '?', pos: 'ORT', rating: 70, stats: { pas: 70, sut: 70, fizik: 70, hiz: 70 } };
        };

        const newA    = fieldRows.filter((r: any) => r.side === 'A').map((r: any) => toFieldPlayer(r, countersA));
        const newB    = fieldRows.filter((r: any) => r.side === 'B').map((r: any) => toFieldPlayer(r, countersB));
        const newSubs = benchRows.map(toPlayerInfo);

        if (newA.length > 0 || newB.length > 0) {
          setSavedTeamA(newA);
          setSavedTeamB(newB);
          setSavedSubstitutes(newSubs);
          AsyncStorage.setItem('@teamA', JSON.stringify(newA));
          AsyncStorage.setItem('@teamB', JSON.stringify(newB));
          AsyncStorage.setItem('@substitutes', JSON.stringify(newSubs));
        }
      });
  }, [teamsRevealed, activePollId, myTeamMembers.length]);

  // Bildirime tıklandığında ana ekrana dön ve okundu işaretle
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(async () => {
      setScreen('home');
      if (session?.user?.id) {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', session.user.id)
          .eq('is_read', false);
        setUnreadNotifCount(0);
      }
    });
    return () => subscription.remove();
  }, [session]);

  // ─── Push Bildirim Fonksiyonları ───
  async function registerForPushNotifications(userId: string) {
    if (!Device.isDevice) return;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    try {
      const { data: token } = await Notifications.getExpoPushTokenAsync();
      await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
    } catch (e) {
      console.log('Push token alınamadı:', e);
    }
  }

  async function sendTeamNotification(teamId: string, title: string, body: string, type?: string, captainOnly?: boolean) {
    try {
      await supabase.functions.invoke('send-notification', {
        body: {
          team_id: teamId, title, body,
          ...(type && { type }),
          ...(captainOnly && { captain_only: true }),
        },
      });
    } catch (e) {
      console.log('Bildirim gönderilemedi:', e);
    }
  }

  // ─── İşlem Fonksiyonları ───
  const saveMatchData = async (m: MatchInfo) => {
    const f = effectiveFormation(m);
    const formationChanged = f !== formationA || f !== formationB;
    setMatch(m);
    await AsyncStorage.setItem('@match', JSON.stringify(m));
    // Maçın formasyonu kadro ekranındaki slot yapısını belirler — burada hizala
    setFormationA(f); setFormationB(f);
    await AsyncStorage.setItem('@formationA', JSON.stringify(f));
    await AsyncStorage.setItem('@formationB', JSON.stringify(f));
    // Kurulu kadro varken format/formasyon değiştiyse slot yapısı artık
    // eskisiyle uyuşmuyor — mevcut "yeniden kur" uyarı şeridini tetikle
    if (formationChanged && (savedTeamA.length > 0 || savedTeamB.length > 0)) {
      setKadroStale(true);
    }
    setScreen(isCaptain ? 'votes' : 'home');
  };

  const saveVote = async (id: string, vote: Vote) => {
    const nv = { ...votes, [id]: vote };
    setVotes(nv);
    await AsyncStorage.setItem('@votes', JSON.stringify(nv));
    setKadroStale(true);
  };

  const handleResetVotes = () => {
    Alert.alert("Yoklamayı Sıfırla", "Tüm oylar sıfırlanacak. Emin misiniz?", [
      { text: "İptal", style: "cancel" },
      { text: "Sıfırla", style: "destructive", onPress: async () => {
        if (activePollId) {
          await supabase.from('poll_votes').delete().eq('poll_id', activePollId);
        }
        setPollVotesMap({});
        setGuestVotesLocal({});
        setKadroStale(true);
      }}
    ]);
  };

  const handleCancelMatch = () => {
    Alert.alert(
      'Maçı İptal Et',
      'Maç ve tüm yoklama/kadro kaydı silinecek. Emin misin?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İptal Et',
          style: 'destructive',
          onPress: async () => {
            if (!activePollId) return;
            await supabase.from('polls').delete().eq('id', activePollId);
            await AsyncStorage.multiRemove(['@match', '@teamA', '@teamB', '@substitutes', '@formationA', '@formationB']);
            activePollIdRef.current = null;
            setActivePollId(null);
            setTeamsRevealed(false);
            setTeamA([]); setTeamB([]); setSubstitutes([]);
            setSavedTeamA([]);
            setSavedTeamB([]);
            setSavedSubstitutes([]);
            setPollVotesMap({});
            setGuestVotesLocal({});
            setKadroStale(false);
            setScreen('home');
          },
        },
      ]
    );
  };

  async function handleFinishMatch() {
    setScreen('stats_entry');
  }

  const memberVoteValues = myTeamMembers.map(m => pollVotesMap[m.user_id || m.id] ?? null);
  const counts = {
    yes:  memberVoteValues.filter(v => v === 'yes').length,
    sub:  memberVoteValues.filter(v => v === 'sub').length,
    no:   memberVoteValues.filter(v => v === 'no').length,
    wait: memberVoteValues.filter(v => !v).length,
  };

  async function handleOpenPoll(matchOverride?: MatchInfo) {
    const m = matchOverride ?? match;
    if (!myTeamInfo?.id || !session?.user?.id) {
      Alert.alert('Hata', 'Takım bilgisi bulunamadı.');
      return;
    }
    try {
      if (activePollId) {
        await supabase.from('polls').update({ is_active: false }).eq('id', activePollId);
      }
      const { data, error } = await supabase.from('polls').insert({
        team_id:          myTeamInfo.id,
        created_by:       session.user.id,
        match_name:       m.name,
        match_date:       m.dateStr,
        match_location:   m.location,
        option_yes_label: pollSettings.optionYesLabel,
        option_sub_label: pollSettings.optionSubLabel,
        option_no_label:  pollSettings.optionNoLabel,
        is_active:        true,
      }).select().single();

      if (error) throw error;

      activePollIdRef.current = data.id;
      setActivePollId(data.id);
      setTeamsRevealed(false);
      setTeamA([]); setTeamB([]); setSubstitutes([]);
      setSavedTeamA([]); setSavedTeamB([]); setSavedSubstitutes([]);
      setKadroStale(false); setHasChanges(false);
      await AsyncStorage.multiRemove(['@teamA', '@teamB', '@substitutes', '@formationA', '@formationB']);
      await sendTeamNotification(
        myTeamInfo.id,
        '📋 Yoklama Başladı',
        'Maça gelip gelmeyeceğini işaretle!',
        'poll_opened'
      );
      Alert.alert('Yoklama Başladı! 📋', 'Takım üyelerine bildirim gönderildi.');
    } catch (err: any) {
      Alert.alert('Hata', err.message);
    }
  }

  async function savePollSettings(newSettings: PollSettings) {
    setPollSettings(newSettings);
    await AsyncStorage.setItem('@pollSettings', JSON.stringify(newSettings));
    if (activePollId) {
      await supabase.from('polls').update({
        option_yes_label: newSettings.optionYesLabel,
        option_sub_label: newSettings.optionSubLabel,
        option_no_label:  newSettings.optionNoLabel,
      }).eq('id', activePollId);
    }
  }

  async function handleSaveKadro() {
    if (!amIManager) return;
    await AsyncStorage.setItem('@teamA', JSON.stringify(teamA));
    await AsyncStorage.setItem('@teamB', JSON.stringify(teamB));
    setHasChanges(false);
    await saveLineupToSupabase(teamA, teamB, substitutes);
    if (teamsRevealed && myTeamInfo?.id) {
      await sendTeamNotification(
        myTeamInfo.id,
        '🔄 Kadrolar Güncellendi',
        'Kaptan kadrolarda değişiklik yaptı, tekrar bak!',
        'teams_updated'
      );
      Alert.alert('Kadro Güncellendi 🔄', 'Değişiklikler kaydedildi ve takıma bildirim gönderildi.');
    } else {
      Alert.alert('Kaydedildi', 'Kadro değişiklikleri kaydedildi.');
    }
  }

  async function saveLineupToSupabase(a: FieldPlayer[], b: FieldPlayer[], subs: PlayerInfo[]) {
    if (!activePollId || !myTeamInfo?.id) return;
    try {
      await supabase.from('match_lineups').delete().eq('poll_id', activePollId);
      const rows = [
        ...a.map(p => ({
          poll_id:      activePollId,
          team_id:      myTeamInfo.id,
          user_id:      p.isGuest ? null : p.id,
          guest_id:     p.isGuest ? p.id : null,
          display_name: p.name,
          side:         'A',
          lineup:       'field',
          position:     p.fieldPos,
        })),
        ...b.map(p => ({
          poll_id:      activePollId,
          team_id:      myTeamInfo.id,
          user_id:      p.isGuest ? null : p.id,
          guest_id:     p.isGuest ? p.id : null,
          display_name: p.name,
          side:         'B',
          lineup:       'field',
          position:     p.fieldPos,
        })),
        ...subs.map(p => ({
          poll_id:      activePollId,
          team_id:      myTeamInfo.id,
          user_id:      p.isGuest ? null : p.id,
          guest_id:     p.isGuest ? p.id : null,
          display_name: p.name,
          side:         null,
          lineup:       'bench',
          position:     p.pos,
        })),
      ];
      if (rows.length === 0) return;
      const { error } = await supabase.from('match_lineups').insert(rows);
      if (error) {
        console.log('match_lineups insert hatası:', error);
        Alert.alert('Uyarı', 'Kadro geçmişe kaydedilemedi, ancak işlem geçerlidir.');
      }
    } catch (err: any) {
      console.log('match_lineups kaydedilemedi:', err);
      Alert.alert('Uyarı', 'Kadro geçmişe kaydedilemedi, ancak işlem geçerlidir.');
    }
  }

  // "Kadroları Açıkla" öncesi as takımlardaki boşlukları otomatik doldurur.
  // Havuz: manuel yerleştirilmemiş, oyu "Geliyorum" olan üye VE misafirler.
  // Boş slotlar formasyondan hesaplanır ve saha atamasıyla AYNI mevki-öncelikli
  // assignToSlots fonksiyonuna verilir — yani buradaki yerleşim de
  // ana mevki → ikincil mevki → rating önceliğini izler.
  function autoFillTeamGaps(): { a: FieldPlayer[]; b: FieldPlayer[]; subs: PlayerInfo[]; shortBy: number } {
    let a = [...teamA];
    let b = [...teamB];
    let subs = [...substitutes];

    // Bir takımın formasyonuna göre HÂLÂ boş olan slotları döndürür (KL dahil)
    const openSlotsFor = (team: FieldPlayer[], f: Formation): Position[] => {
      const need = formationSlots(f);
      if (!team.some(p => p.fieldPos === 'KL')) need.unshift('KL');
      const remaining = [...need];
      team.forEach(p => {
        const i = remaining.indexOf(p.fieldPos);
        if (i !== -1) remaining.splice(i, 1);
      });
      return remaining;
    };

    const openSlots = [
      ...openSlotsFor(a, formationA).map(pos => ({ pos, side: 'A' as const })),
      ...openSlotsFor(b, formationB).map(pos => ({ pos, side: 'B' as const })),
    ];
    if (openSlots.length === 0) return { a, b, subs, shortBy: 0 };

    // Misafirler burada da team_members ile eşit muamele görür: aynı havuz,
    // aynı sıralama — tek fark oy kaynağı (pollVotesMap vs guestVotesLocal).
    const placedIds = new Set([...a, ...b].map(p => p.id));
    const memberCandidates = myTeamMembers
      .filter((m: any) => {
        const id = m.user_id || m.id;
        return pollVotesMap[id] === 'yes' && !placedIds.has(id);
      })
      .map((m: any) => memberToPlayerInfo(m));
    const guestCandidates = guestPlayers
      .filter((g: any) => guestVotesLocal[g.id] === 'yes' && !placedIds.has(g.id))
      .map((g: any) => guestToPlayerInfo(g));
    const pool = [...memberCandidates, ...guestCandidates];

    const shortBy = Math.max(0, openSlots.length - pool.length);
    const countByPos = (team: FieldPlayer[], pos: Position) => team.filter(p => p.fieldPos === pos).length;

    assignToSlots(pool, openSlots).forEach(({ player, slot }) => {
      subs = subs.filter(s => s.id !== player.id);
      const team = slot.side === 'A' ? a : b;
      const fieldPlayer: FieldPlayer = { ...player, fieldPos: slot.pos, fieldOrder: countByPos(team, slot.pos) };
      if (slot.side === 'A') a = [...a, fieldPlayer]; else b = [...b, fieldPlayer];
    });

    return { a, b, subs, shortBy };
  }

  async function handleRevealTeams() {
    if (!activePollId || !myTeamInfo?.id) return;
    if (savedTeamA.length === 0 && savedTeamB.length === 0) return;
    try {
      const { a, b, subs, shortBy } = autoFillTeamGaps();
      const changed = a.length !== teamA.length || b.length !== teamB.length;
      if (changed) {
        setTeamA(a); setTeamB(b); setSubstitutes(subs);
        setSavedTeamA(a); setSavedTeamB(b); setSavedSubstitutes(subs);
        await AsyncStorage.setItem('@teamA', JSON.stringify(a));
        await AsyncStorage.setItem('@teamB', JSON.stringify(b));
        await AsyncStorage.setItem('@substitutes', JSON.stringify(subs));
      }
      if (shortBy > 0) {
        Alert.alert('Kadro Eksik Kalacak', `Yeterli "Geliyorum" oyu yok — kadroda ${shortBy} kişilik boşluk dolmadan açıklanacak.`);
      }
      await supabase.from('polls').update({ teams_revealed: true }).eq('id', activePollId);
      setTeamsRevealed(true);
      await sendTeamNotification(
        myTeamInfo.id,
        '⚽ Kadrolar Açıklandı!',
        'Takımlar belli oldu, hemen bak!',
        'teams_revealed'
      );
      await saveLineupToSupabase(a, b, subs);
      Alert.alert('Kadrolar Açıklandı! ⚽', 'Takım üyelerine bildirim gönderildi.');
    } catch (err: any) {
      Alert.alert('Hata', err.message);
    }
  }

  async function commitTeams(a: FieldPlayer[], b: FieldPlayer[], subs: PlayerInfo[], fa: Formation, fb: Formation) {
    setTeamA(a); setTeamB(b); setSubstitutes(subs);
    setSavedTeamA(a); setSavedTeamB(b); setSavedSubstitutes(subs);
    setFormationA(fa); setFormationB(fb); setKadroStale(false); setHasChanges(false);
    await AsyncStorage.setItem('@teamA', JSON.stringify(a));
    await AsyncStorage.setItem('@teamB', JSON.stringify(b));
    await AsyncStorage.setItem('@substitutes', JSON.stringify(subs));
    await AsyncStorage.setItem('@formationA', JSON.stringify(fa));
    await AsyncStorage.setItem('@formationB', JSON.stringify(fb));
    await saveLineupToSupabase(a, b, subs);
  }

  // Son PAIR_HISTORY_MATCHES maçın açıklanmış kadrolarından ikili birliktelik
  // ağırlıklarını çıkarır. İki kritik filtre:
  //  - Aynı güne birden fazla poll kurulmuş olabilir (deneme/iptal). Her
  //    tarihten YALNIZCA en son açıklanan kadro sayılır; yoksa tek bir maç günü
  //    (ör. 24 Temmuz'daki 8 test poll'ü) tüm geçmişi domine eder.
  //  - Şu anki maç hariç tutulur; yoksa kadro bir kez açıklandıktan sonra
  //    yeniden kurmak kendi kendini cezalandırır.
  async function fetchPairWeights(teamId: string, excludePollId?: string | null): Promise<PairWeights> {
    try {
      const { data: polls } = await supabase
        .from('polls')
        .select('id, match_date, created_at')
        .eq('team_id', teamId)
        .eq('teams_revealed', true)
        .order('match_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (!polls?.length) return {};

      const seenDates = new Set<string>();
      const pollOrder: string[] = [];
      for (const p of polls) {
        if (excludePollId && p.id === excludePollId) continue;
        if (seenDates.has(p.match_date)) continue;
        seenDates.add(p.match_date);
        pollOrder.push(p.id);
        if (pollOrder.length >= PAIR_HISTORY_MATCHES) break;
      }
      if (pollOrder.length === 0) return {};

      const { data: rows } = await supabase
        .from('match_lineups')
        .select('poll_id, user_id, guest_id, side')
        .in('poll_id', pollOrder);

      return buildPairWeights(
        (rows || []).map((r: any) => ({
          pollId:   r.poll_id,
          side:     r.side,
          playerId: r.user_id || r.guest_id || null,
        })),
        pollOrder,
      );
    } catch (e) {
      console.log('fetchPairWeights hatası:', e);
      return {};
    }
  }

  // Sunulan varyasyonlardan birine geçer. Yeniden hesap YOK — varyasyonlar
  // zaten üretilmiş durumda, sadece hangisinin uygulanacağı değişiyor.
  // Diziliş GEÇERLİ formasyonlarla kurulur — saha görünümünde formasyonu elle
  // değiştirdiysen V2/V3'e geçmek onu bozmaz.
  async function applyVariant(i: number) {
    const v = teamVariants[i];
    if (!v || !variantCtx) return;
    setVariantIndex(i);
    await commitTeams(
      applyFormation(v.rawA, formationA),
      applyFormation(v.rawB, formationB),
      variantCtx.subs, formationA, formationB,
    );
    setSelectedForSwap(null);
  }

  // Daha önce gösterilmemiş yeni bir varyasyon turu üretir. Havuz küçükse
  // üretilebilecek farklı kadro sayısı sınırlıdır — tükendiğinde kullanıcıya
  // sessizce aynı kadroları göstermek yerine açıkça söylüyoruz.
  async function handleMoreVariants() {
    if (!variantCtx) return;
    const { pool, formation, pairW, lambda } = variantCtx;
    const fresh = buildTeamVariants(pool, formation, pairW, lambda, VARIANT_COUNT, variantSeen);
    if (fresh.length === 0) {
      Alert.alert(
        'Varyasyon kalmadı',
        'Bu oyuncu kadrosu ve mevki dağılımıyla üretilebilecek farklı varyasyonlar tükendi. Çeşitliliği "Yüksek" yaparak veya oyuncu havuzunu değiştirerek daha fazlasını deneyebilirsin.',
      );
      return;
    }
    setTeamVariants(fresh);
    setVariantSeen(prev => [...prev, ...fresh.map(v => v.sig)]);
    setVariantIndex(0);
    await commitTeams(
      applyFormation(fresh[0].rawA, formationA),
      applyFormation(fresh[0].rawB, formationB),
      variantCtx.subs, formationA, formationB,
    );
    setSelectedForSwap(null);
  }

  // Tek kadro kurma akışı — eski "Dengeli Kur" + "Rastgele Kur" birleşti.
  // Çeşitlilik ayarı ikisinin arasındaki tüm skalayı kapsıyor:
  //   Kapalı = saf dengeli (eski Dengeli Kur), Yüksek = geçmişi güçlü şekilde
  //   dağıtan karışık kadro. Her basış farklı bir sonuç üretir.
  async function handleBuildTeams() {
    if (!amIManager) return;
    if (myTeamMembers.length === 0) {
      Alert.alert('Uyarı', 'Takım üyeleri henüz yüklenmedi. Lütfen tekrar dene.');
      return;
    }

    const memberPool = myTeamMembers.map(memberToPlayerInfo);
    const guestPool  = guestPlayers.map(guestToPlayerInfo);

    // Misafirler team_members ile TAMAMEN eşit davranır: aynı yes/sub filtresi,
    // tek fark oy kaynağı (pollVotesMap vs guestVotesLocal — misafirlerin gerçek
    // hesabı olmadığı için oyu kaptan bu ekrandan yerel olarak işaretler).
    const yesMembers = memberPool.filter(p => pollVotesMap[p.id] === 'yes');
    const subMembers = memberPool.filter(p => pollVotesMap[p.id] === 'sub');
    const yesGuests   = guestPool.filter(g => guestVotesLocal[g.id] === 'yes');
    const subGuests   = guestPool.filter(g => guestVotesLocal[g.id] === 'sub');
    const yesPool = [...yesMembers, ...yesGuests];
    const subPool = [...subMembers, ...subGuests];

    // Kaç kişilik kadro kurulacağını maç FORMATI (6v6/7v7/8v8) belirler.
    // Formasyonun kendisi aşağıda, sahaya çıkacak gerçek havuza bakılarak
    // seçilir (suggestFormation) — maç kurulurken seçilen formasyon tutmuyordu.
    const fieldCapacity = teamSizeOf(defaultFormationFor(match.teamSize)) * 2;

    // Çeşitlilik kapalıysa geçmişi hiç çekme — gereksiz iki sorgu olmasın.
    const lambda = DIVERSITY_LAMBDA[diversity];
    const pairW = lambda > 0 && myTeamInfo?.id
      ? await fetchPairWeights(myTeamInfo.id, activePollIdRef.current)
      : {};

    const executeBuild = async (main: PlayerInfo[], subs: PlayerInfo[]) => {
      try {
        // Formasyon sahaya çıkacak GERÇEK havuzdan seçilir; iki takım da aynı
        // havuzdan bölündüğü için ikisine de aynı formasyon uygun düşer.
        const formation = suggestFormation(main, match.teamSize);
        const variants = buildTeamVariants(main, formation, pairW, lambda);
        if (variants.length === 0) {
          Alert.alert('Hata', 'Takımlar oluşturulamadı, oyuncu listesini kontrol et');
          return;
        }
        setTeamVariants(variants);
        setVariantSeen(variants.map(v => v.sig));
        setVariantIndex(0);
        setVariantCtx({ subs, pool: main, formation, pairW, lambda });
        // İlk varyasyon doğrudan uygulanır; kaptan isterse V2/V3'e geçer.
        await commitTeams(
          applyFormation(variants[0].rawA, formation),
          applyFormation(variants[0].rawB, formation),
          subs, formation, formation,
        );
        setSelectedForSwap(null);
        setScreen('kadro');
      } catch (error: any) {
        console.log('handleBuildTeams hatası:', error);
        Alert.alert('Hata', error.message || 'Kadro kurulurken bir hata oluştu');
      }
    };

    if (yesPool.length === 0) {
      Alert.alert(
        'Oy Yok',
        'Henüz kimse "Kesin Var" oyu vermedi. Tüm takım üyelerini ve misafirleri kullanayım mı?',
        [
          { text: 'İptal', style: 'cancel' },
          { text: 'Evet, hepsini kullan', onPress: () => {
              const allPool = sortByFieldPosition([...memberPool, ...guestPool]);
              executeBuild(allPool.slice(0, fieldCapacity), sortByFieldPosition(allPool.slice(fieldCapacity)));
            } },
        ]
      );
      return;
    }

    // 'yes' oy verenler (üye + misafir) → saha kadrosu (formasyon kapasitesi
    // kadar); fazlası + 'sub' → yedek. Havuzu önce mevkiye göre sırala ki
    // kapasite taşarsa her mevkiden dengeli bir kesit sahaya kalsın.
    const yesSorted = sortByFieldPosition(yesPool);
    await executeBuild(
      yesSorted.slice(0, fieldCapacity),
      sortByFieldPosition([...yesSorted.slice(fieldCapacity), ...subPool])
    );
  }

  function buildKadroMessage(): string {
    const activeCount  = (teamA.length + teamB.length) || 1;
    const maxCapacity  = match.teamSize ? (match.teamSize * 2) : activeCount;
    const divisor      = Math.min(activeCount, maxCapacity);
    const perPerson    = Math.ceil((match.price || 0) / Math.max(divisor, 1));
    let msg = `⚽ *${match.name}*\n📍 ${match.location}\n📅 ${formatDateStr(match.dateStr)} ⏰ ${match.startTime} - ${match.endTime}\n`;
    if (match.teamSize) msg += `🏟️ *Format:* ${match.teamSize} vs ${match.teamSize}\n`;
    msg += `💵 *Kasa:* ${match.price || 0} ₺ (Kişi Başı: ~${perPerson} ₺)\n\n`;
    msg += `🔵 *Takım A (${formationA}):*\n${teamA.map(p=>p.name).join(', ')}\n\n🟢 *Takım B (${formationB}):*\n${teamB.map(p=>p.name).join(', ')}`;
    if (substitutes && substitutes.length > 0)
      msg += `\n\n🔶 *Yedekler:*\n${substitutes.map((p: PlayerInfo) => p.name).join(', ')}`;
    return msg;
  }

  // Paylaşılan saha görseline gömülecek maç bilgisi (kişi başı hesabı dahil).
  // buildKadroMessage'la aynı perPerson mantığını kullanır.
  function buildShareInfo() {
    const activeCount = (teamA.length + teamB.length) || 1;
    const maxCapacity = match.teamSize ? (match.teamSize * 2) : activeCount;
    const divisor     = Math.min(activeCount, maxCapacity);
    const perPerson   = Math.ceil((match.price || 0) / Math.max(divisor, 1));
    return {
      name: match.name, dateStr: match.dateStr, startTime: match.startTime, endTime: match.endTime,
      location: match.location, price: match.price || 0, perPerson, teamSize: match.teamSize,
      team: myTeamInfo
        ? { name: myTeamInfo.name, logo_url: myTeamInfo.logo_url, color: myTeamInfo.color }
        : null,
    };
  }

  const shareKadro = async () => {
    const msg = buildKadroMessage();
    try {
      if (kadroTab === 'field' && fieldRef.current) {
        const uri = await captureRef(fieldRef, { format: 'png', quality: 0.9 });
        // NOT: Görsel + metni birlikte paylaşırken bazı hedef uygulamalar
        // (ör. WhatsApp grup sohbetleri) metni (caption) sessizce düşürebiliyor —
        // bu bizim kontrolümüzdeki bir parametre değil, alıcı uygulamanın
        // paylaşım uzantısının hedefe göre farklı davranması. Bu yüzden
        // aşağıda ayrı bir "Metni Kopyala" yolu da sunuyoruz (copyKadroText).
        if (Platform.OS === 'ios') await Share.share({ url: uri, message: msg });
        else await Sharing.shareAsync(uri, { dialogTitle: 'Kadroyu Paylaş', mimeType: 'image/png' });
      } else { await Share.share({ message: msg }); }
    } catch { Alert.alert('Hata', 'Paylaşım sırasında hata oluştu.'); }
  };

  const copyKadroText = async () => {
    await Clipboard.setStringAsync(buildKadroMessage());
    Alert.alert('Kopyalandı 📋', 'Kadro metni panoya kopyalandı. Görseli paylaştıktan sonra, metin gitmediyse aynı sohbete yapıştırabilirsin.');
  };

  const cancelEdit = () => {
    Keyboard.dismiss();
    setEditingId(null);
    setNewName('');
    setNewPas('');
    setNewSut('');
    setNewFizik('');
    setNewHiz('');
    setNewPos('ORT');
    setNewSecPos(null);
    playersScrollRef.current?.scrollTo({ y: playersScrollY.current, animated: true });
  };

  // ─── Saha Swap Fonksiyonları ─────────────────────────────────────────────────
  function handlePlayerTap(player: FieldPlayer) {
    if (!amIManager) { handleLongPress(player); return; }
    if (!selectedForSwap) { setSelectedForSwap(player); return; }
    if (selectedForSwap.id === player.id) { setSelectedForSwap(null); return; }

    const isSelSub = substitutes.find(p => p.id === selectedForSwap.id);
    if (isSelSub) {
      const isTargetInA = teamA.find(p => p.id === player.id);
      const team = isTargetInA ? teamA : teamB;
      const setTeam = isTargetInA ? setTeamA : setTeamB;
      const key = isTargetInA ? '@teamA' : '@teamB';
      const newFieldPlayer = { ...isSelSub, fieldPos: player.fieldPos, fieldOrder: player.fieldOrder };
      const newTeam = team.map(p => p.id === player.id ? newFieldPlayer : p);
      const newSubs = substitutes.map(p => p.id === isSelSub.id ? { ...player } : p);
      setTeam(newTeam as any); setSubstitutes(newSubs as any);
      AsyncStorage.setItem(key, JSON.stringify(newTeam));
      AsyncStorage.setItem('@substitutes', JSON.stringify(newSubs));
      setHasChanges(true);
      setSelectedForSwap(null);
      return;
    }

    const selField = selectedForSwap;
    const idA = selField.id; const idB = player.id;
    const inA_A = teamA.find(p => p.id === idA); const inA_B = teamA.find(p => p.id === idB);
    let newA = [...teamA]; let newB = [...teamB];

    if (inA_A && inA_B) {
      newA = newA.map(p => {
        if (p.id === idA) return { ...p, fieldPos: player.fieldPos, fieldOrder: player.fieldOrder };
        if (p.id === idB) return { ...p, fieldPos: selField.fieldPos, fieldOrder: selField.fieldOrder };
        return p;
      });
    } else if (!inA_A && !inA_B) {
      newB = newB.map(p => {
        if (p.id === idA) return { ...p, fieldPos: player.fieldPos, fieldOrder: player.fieldOrder };
        if (p.id === idB) return { ...p, fieldPos: selField.fieldPos, fieldOrder: selField.fieldOrder };
        return p;
      });
    } else {
      if (inA_A) {
        newA = newA.map(p => p.id === idA ? { ...player } : p);
        newB = newB.map(p => p.id === idB ? { ...selField } : p);
      } else {
        newB = newB.map(p => p.id === idA ? { ...player } : p);
        newA = newA.map(p => p.id === idB ? { ...selField } : p);
      }
    }
    setTeamA(newA as any); setTeamB(newB as any);
    setSavedTeamA(newA as any); setSavedTeamB(newB as any);
    AsyncStorage.setItem('@teamA', JSON.stringify(newA));
    AsyncStorage.setItem('@teamB', JSON.stringify(newB));
    setHasChanges(true);
    setSelectedForSwap(null);
  }

  function handleSubTap(sub: PlayerInfo) {
    if (!amIManager) return;
    if (!selectedForSwap) { setSelectedForSwap(sub); return; }
    if (selectedForSwap.id === sub.id) { setSelectedForSwap(null); return; }

    const selField = selectedForSwap;
    const isSelInA = teamA.find(p => p.id === selField.id);
    const isSelInB = teamB.find(p => p.id === selField.id);

    if (isSelInA || isSelInB) {
      const team = isSelInA ? teamA : teamB;
      const setTeam = isSelInA ? setTeamA : setTeamB;
      const key = isSelInA ? '@teamA' : '@teamB';
      const newFieldPlayer = { ...sub, fieldPos: selField.fieldPos, fieldOrder: selField.fieldOrder };
      const newTeam = team.map(p => p.id === selField.id ? newFieldPlayer : p);
      const newSubs = substitutes.map(p => p.id === sub.id ? { ...selField } : p);
      setTeam(newTeam as any); setSubstitutes(newSubs as any);
      AsyncStorage.setItem(key, JSON.stringify(newTeam));
      AsyncStorage.setItem('@substitutes', JSON.stringify(newSubs));
      setHasChanges(true);
      setSelectedForSwap(null);
    } else {
      setSelectedForSwap(sub);
    }
  }

  function handleLongPress(player: FieldPlayer) {
    const inA = teamA.find(p => p.id === player.id);
    setStatModal({ visible: true, player, teamColor: inA ? 'A' : 'B' });
  }

  function handleMoveToBench() {
    if (!amIManager) return;
    if (!selectedForSwap) return;
    const selField = selectedForSwap;
    const isSelInA = teamA.find(p => p.id === selField.id);
    const isSelInB = teamB.find(p => p.id === selField.id);
    if (isSelInA || isSelInB) {
      const team = isSelInA ? teamA : teamB;
      const setTeam = isSelInA ? setTeamA : setTeamB;
      const key = isSelInA ? '@teamA' : '@teamB';
      const newTeam = team.filter(p => p.id !== selField.id);
      const pureInfo: any = { ...selField };
      delete pureInfo.fieldPos;
      delete pureInfo.fieldOrder;
      const newSubs = [...substitutes, pureInfo];
      setTeam(newTeam as any); setSubstitutes(newSubs as any);
      AsyncStorage.setItem(key, JSON.stringify(newTeam));
      AsyncStorage.setItem('@substitutes', JSON.stringify(newSubs));
      setHasChanges(true);
      setSelectedForSwap(null);
    }
  }

  function handleMoveToField(teamId: 'A' | 'B') {
    if (!amIManager) return;
    if (!selectedForSwap) return;
    const isSub = substitutes.find(p => p.id === selectedForSwap.id);
    if (!isSub) return;
    const team = teamId === 'A' ? teamA : teamB;
    const setTeam = teamId === 'A' ? setTeamA : setTeamB;
    const key = teamId === 'A' ? '@teamA' : '@teamB';
    const newFieldPlayer: any = { ...isSub, fieldPos: isSub.pos || 'ORT', fieldOrder: team.length + 1 };
    const newTeam = [...team, newFieldPlayer];
    const newSubs = substitutes.filter(p => p.id !== isSub.id);
    setTeam(newTeam as any); setSubstitutes(newSubs as any);
    AsyncStorage.setItem(key, JSON.stringify(newTeam));
    AsyncStorage.setItem('@substitutes', JSON.stringify(newSubs));
    setHasChanges(true);
    setSelectedForSwap(null);
  }


  // ─── Üye Rol Yönetimi ─────────────────────────────────────────────────────────

  async function handleSetMemberRole(member: any, newRole: 'deputy' | 'player') {
    if (!myTeamInfo?.id) return;
    try {
      const { error } = await supabase
        .from('team_members')
        .update({ role: newRole })
        .eq('user_id', member.user_id || member.id)
        .eq('team_id', myTeamInfo.id);
      if (error) throw error;
      setMyTeamMembers(prev =>
        prev.map(m =>
          (m.user_id || m.id) === (member.user_id || member.id) ? { ...m, role: newRole } : m
        )
      );
    } catch (err: any) {
      Alert.alert('Hata', err.message);
    }
  }

  async function handleTransferCaptaincy(member: any) {
    if (!myTeamInfo?.id) return;
    const memberName = member.display_name || 'bu oyuncu';
    Alert.alert(
      'Kaptanlığı Devret',
      `${memberName} adlı oyuncuya kaptanlığı devretmek istediğine emin misin? Bu işlem geri alınamaz.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Evet, Devret',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.rpc('transfer_captaincy', {
                p_team_id: myTeamInfo.id,
                p_new_captain: member.user_id || member.id,
              });
              if (error) throw error;
              if (session?.user?.id) await fetchMyTeam(session.user.id);
            } catch (err: any) {
              Alert.alert('Hata', err.message);
            }
          },
        },
      ]
    );
  }

  async function handleRemoveMember(member: any) {
    if (!myTeamInfo?.id) return;
    const memberName = member.display_name || 'bu oyuncu';
    Alert.alert(
      'Takımdan Çıkar',
      `${memberName} adlı oyuncuyu takımdan çıkarmak istediğine emin misin?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Evet, Çıkar',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('team_members')
                .delete()
                .eq('user_id', member.user_id || member.id)
                .eq('team_id', myTeamInfo.id);
              if (error) throw error;
              setMyTeamMembers(prev =>
                prev.filter(m => (m.user_id || m.id) !== (member.user_id || member.id))
              );
            } catch (err: any) {
              Alert.alert('Hata', err.message);
            }
          },
        },
      ]
    );
  }

  function showMemberActionMenu(member: any) {
    const memberName = member.display_name || 'Oyuncu';
    const memberRole = (member.role as TeamMemberRole) || 'player';
    const buttons: Array<{ text: string; onPress?: () => void; style?: 'cancel' | 'destructive' | 'default' }> = [];

    if (memberRole === 'player') {
      buttons.push({ text: 'Yardımcı kaptan yap 🔑', onPress: () => handleSetMemberRole(member, 'deputy') });
    } else if (memberRole === 'deputy') {
      buttons.push({ text: 'Yetkisini al', onPress: () => handleSetMemberRole(member, 'player') });
    }

    buttons.push({ text: 'Kaptanlığı devret ⚡', style: 'destructive', onPress: () => handleTransferCaptaincy(member) });
    buttons.push({ text: 'Takımdan çıkar 🚪', style: 'destructive', onPress: () => handleRemoveMember(member) });
    buttons.push({ text: 'İptal', style: 'cancel' });

    Alert.alert(memberName, 'Yapmak istediğin işlemi seç:', buttons);
  }

  // ─── Pull-to-Refresh ─────────────────────────────────────────────────────────
  const onRefresh = async () => {
    if (!session?.user?.id) return;
    setRefreshing(true);
    try {
      switch (screen) {
        case 'home':
          await fetchMyTeam(session.user.id);
          await fetchUnreadNotifs(session.user.id);
          // Aşağı çekince de home ziyareti gibi davran: kapanmış pencereleri işle,
          // açık maç-sonu oylaması varsa göster. (fetchMyTeam içindeki
          // fetchActivePoll maçı is_finished işaretler ama maç zaten is_active=false
          // olduysa oraya girmez; bu yüzden oylamayı burada ayrıca tetikliyoruz.)
          if (myTeamInfo?.id) {
            await fetchOpenRatingMatch(session.user.id, myTeamInfo.id);
            await fetchTeamAlerts(session.user.id, userTeams);
          }
          if (activePollId) {
            if (isCaptain) await fetchPollVotes(activePollId);
            else await fetchPollSummary();
          }
          break;
        case 'votes':
          if (activePollId) await fetchPollVotes(activePollId);
          break;
        case 'my_team':
          await fetchMyTeam(session.user.id);
          if (myTeamInfo?.id) await fetchGuestPlayers(myTeamInfo.id);
          break;
        case 'players':
          await fetchMyTeam(session.user.id);
          break;
        case 'kadro':
          if (activePollId) {
            const { data } = await supabase
              .from('polls')
              .select('teams_revealed')
              .eq('id', activePollId)
              .single();
            if (data) setTeamsRevealed(data.teams_revealed ?? false);
          }
          break;
        case 'settings':
          await fetchProfile(session.user.id);
          break;
        default:
          break;
      }
    } finally {
      setRefreshing(false);
    }
  };

  // --- RENDER FONKSİYONLARI ---

  const myUserId = session?.user?.id ?? '';
  const amIManager = myRole === 'captain' || myRole === 'deputy';

  // Yükleniyor Durumu
  if (!isReady) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );

  // Auth Kontrolü
  if (!session && isReady) return <Auth />;

  // Takım yükleniyor
  if (session && hasTeam === null) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );

  // 1. OYUNCU İÇİN YOKLAMA EKRANI
  if (screen === 'votes_player') {
    return (
      <PlayerVoteScreen
        userId={session!.user.id}
        teamId={myTeamInfo?.id || ''}
        onBack={() => setScreen('home')}
      />
    );
  }

  // 2. KAPTAN İÇİN YOKLAMA & KADRO YÖNETİMİ
  if (screen === 'votes') {
    return (
      <SafeAreaView style={s.safe}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('home')} style={s.backBtn}>
            <Text style={s.backText}>← Geri</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>📋 Yoklama & Kadro</Text>
          <TouchableOpacity onPress={handleResetVotes} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: '600' }}>Sıfırla</Text>
          </TouchableOpacity>
        </View>

        {/* Maç Özeti */}
        <TouchableOpacity
          style={{ backgroundColor: COLORS.card, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}
          onPress={() => { setEditMatch(match); setScreen('create'); }}
          activeOpacity={0.7}
        >
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18 }}>⚽</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textMain }}>{match.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 1 }}>
              <Text style={{ fontSize: 12, color: COLORS.textMuted }}>📍 {match.location}</Text>
              {match.lat != null && match.lng != null && (
                <TouchableOpacity
                  onPress={() => navigasyonAc(match.lat!, match.lng!)}
                  style={{ backgroundColor: COLORS.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.primary }}>🧭 Yol Tarifi</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 1 }}>📅 {formatDateStr(match.dateStr)} {match.startTime}</Text>
          </View>
          <Text style={{ fontSize: 13, color: COLORS.primary, fontWeight: '600' }}>✏️</Text>
        </TouchableOpacity>

        {/* Yoklama Ayar Şeridi */}
        <View style={{ backgroundColor: COLORS.card, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: COLORS.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
              {[pollSettings.optionYesLabel, pollSettings.optionSubLabel, pollSettings.optionNoLabel].map((label, i) => (
                <View key={i} style={{ flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center', backgroundColor: i === 0 ? COLORS.successLight : i === 1 ? COLORS.warningLight : COLORS.dangerLight }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: i === 0 ? '#065F46' : i === 1 ? '#92400E' : '#991B1B' }} numberOfLines={1}>{label}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity onPress={() => setShowPollSettings(true)} style={{ backgroundColor: COLORS.primaryLight, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>✏️ Düzenle</Text>
            </TouchableOpacity>
          </View>
        </View>

        {kadroStale && (
          <View style={s.staleWarningBar}>
            <Text style={s.staleWarningText}>⚠ Yoklama değişti. Kadroyu yeniden kurman önerilir.</Text>
          </View>
        )}

        <ScrollView
          style={s.body}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
        >

          {/* Kemik Kadro — Supabase poll_votes'tan gelen gerçek oylar */}
          {myTeamMembers.map(member => {
            const uid = member.user_id || member.id;
            const v = pollVotesMap[uid];
            const label = v === 'yes' ? pollSettings.optionYesLabel : v === 'sub' ? pollSettings.optionSubLabel : v === 'no' ? pollSettings.optionNoLabel : '—';
            const color = v === 'yes' ? COLORS.success : v === 'sub' ? COLORS.warning : v === 'no' ? COLORS.danger : COLORS.textMuted;
            const bg    = v === 'yes' ? COLORS.successLight : v === 'sub' ? COLORS.warningLight : v === 'no' ? COLORS.dangerLight : undefined;
            const displayName = member.display_name || 'İsimsiz';
            const pos = positionLabel(member.primary_position || member.position || member.main_position);
            return (
              <View key={uid} style={s.voteCard}>
                <View style={[s.avatar, bg ? { backgroundColor: bg } : {}]}>
                  <Text style={s.avatarText}>{displayName[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.playerName}>{displayName}</Text>
                  <Text style={s.playerMetaMuted}>{pos} · {member.overall_rating != null ? Number(member.overall_rating) : computeOverall(member.attributes, member.primary_position, member.secondary_position)} OVR</Text>
                </View>
                <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: bg ?? COLORS.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color }}>{label}</Text>
                </View>
              </View>
            );
          })}

          {/* Jokerler — kaptan manuel oy girebilir */}
          {guestPlayers.length > 0 && (
            <>
              <View style={{ paddingTop: 12, paddingBottom: 4, paddingHorizontal: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textMuted }}>🎭 Jokerler ({guestPlayers.length})</Text>
              </View>
              {guestPlayers.map(guest => {
                const v = guestVotesLocal[guest.id];
                const bg = v === 'yes' ? COLORS.successLight : v === 'sub' ? COLORS.warningLight : v === 'no' ? COLORS.dangerLight : undefined;
                return (
                  <View key={guest.id} style={s.voteCard}>
                    <View style={[s.avatar, { backgroundColor: '#FEF3C7' }, bg ? { backgroundColor: bg } : {}]}>
                      <Text style={[s.avatarText, { color: '#92400E' }]}>{(guest.name || '?')[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.playerName}>{guest.name}</Text>
                      <Text style={s.playerMetaMuted}>{positionLabel(guest.primary_position || guest.position)} · Misafir</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      {[
                        { val: 'yes' as Vote, color: COLORS.success, bg: COLORS.successLight, label: pollSettings.optionYesLabel },
                        { val: 'sub' as Vote, color: COLORS.warning, bg: COLORS.warningLight, label: pollSettings.optionSubLabel },
                        { val: 'no'  as Vote, color: COLORS.danger,  bg: COLORS.dangerLight,  label: pollSettings.optionNoLabel  },
                      ].map(opt => (
                        <TouchableOpacity
                          key={String(opt.val)}
                          onPress={() => setGuestVotesLocal(prev => ({
                            ...prev,
                            [guest.id]: prev[guest.id] === opt.val ? null : opt.val,
                          }))}
                          style={{ paddingHorizontal: 7, paddingVertical: 5, borderRadius: 6, backgroundColor: v === opt.val ? opt.color : opt.bg }}
                        >
                          <Text style={{ fontSize: 9, fontWeight: '700', color: v === opt.val ? '#FFF' : opt.color }} numberOfLines={1}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {/* ── KADRO BÖLÜMÜ ── */}
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textMain }}>⚽ Kadro</Text>
            {teamA.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 14, marginLeft: 'auto' as any }}>
                <TouchableOpacity onPress={copyKadroText}>
                  <Text style={{ fontSize: 18 }}>📋</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={shareKadro}>
                  <Text style={{ fontSize: 18 }}>📤</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={s.tabContainer}>
            <TouchableOpacity style={[s.tab, kadroTab === 'field' && s.tabActive]} onPress={() => setKadroTab('field')}>
              <Text style={[s.tabText, kadroTab === 'field' && s.tabTextActive]}>Saha Dizilişi</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tab, kadroTab === 'list' && s.tabActive]} onPress={() => setKadroTab('list')}>
              <Text style={[s.tabText, kadroTab === 'list' && s.tabTextActive]}>Liste Görünümü</Text>
            </TouchableOpacity>
          </View>

          {teamA.length > 0 && (
            <View style={{ backgroundColor: COLORS.card, paddingVertical: 10, paddingHorizontal: 20, flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={s.teamInfoPill} onPress={() => { setTaktikTeam('A'); setScreen('taktik'); }}>
                <View style={[s.dot, { backgroundColor: '#3B82F6' }]} />
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.textMain }}>A Takımı</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>{formationA} ⚙️</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.teamInfoPill} onPress={() => { setTaktikTeam('B'); setScreen('taktik'); }}>
                <View style={[s.dot, { backgroundColor: '#10B981' }]} />
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.textMain }}>B Takımı</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>{formationB} ⚙️</Text>
              </TouchableOpacity>
            </View>
          )}

          {teamA.length === 0 ? (
            <View style={[s.card, { alignItems: 'center', paddingVertical: 28, marginHorizontal: 20 }]}>
              <Text style={{ fontSize: 36, marginBottom: 10 }}>🏗️</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textMain }}>Henüz kadro kurulmadı</Text>
              <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 6, textAlign: 'center' }}>
                Aşağıdaki butonları kullanarak kadro oluştur.
              </Text>
            </View>
          ) : kadroTab === 'list' ? (
            <View style={{ paddingHorizontal: 20 }}>
              <View style={s.listTeamHeader}>
                <Text style={s.listTeamTitle}>Takım A</Text>
                <Text style={s.listTeamScore}>{teamA.reduce((sum, p) => sum + p.rating, 0)} Puan</Text>
              </View>
              <View style={s.listCard}>
                {teamA.map((p, i) => (
                  <TouchableOpacity key={p.id} style={s.listRow} onPress={() => setStatModal({ visible: true, player: p, teamColor: 'A' })}>
                    <Text style={s.listIndex}>{i + 1}.</Text>
                    <Text style={{ width: 40, fontSize: 12, fontWeight: '700', color: COLORS.primary }}>{p.fieldPos}</Text>
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.textMain }}>{p.name}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textMuted }}>{p.rating}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[s.listTeamHeader, { marginTop: 24 }]}>
                <Text style={s.listTeamTitle}>Takım B</Text>
                <Text style={s.listTeamScore}>{teamB.reduce((sum, p) => sum + p.rating, 0)} Puan</Text>
              </View>
              <View style={s.listCard}>
                {teamB.map((p, i) => (
                  <TouchableOpacity key={p.id} style={s.listRow} onPress={() => setStatModal({ visible: true, player: p, teamColor: 'B' })}>
                    <Text style={s.listIndex}>{i + 1}.</Text>
                    <Text style={{ width: 40, fontSize: 12, fontWeight: '700', color: COLORS.success }}>{p.fieldPos}</Text>
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.textMain }}>{p.name}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textMuted }}>{p.rating}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {substitutes.length > 0 && (
                <View style={{ marginTop: 24 }}>
                  <Text style={[s.listTeamTitle, { marginBottom: 12, paddingHorizontal: 4 }]}>Yedekler ({substitutes.length})</Text>
                  <View style={s.listCard}>
                    {substitutes.map((p, i) => (
                      <View key={p.id} style={s.listRow}>
                        <Text style={s.listIndex}>{i + 1}.</Text>
                        <Text style={{ width: 40, fontSize: 12, fontWeight: '700', color: COLORS.warning }}>{p.pos}</Text>
                        <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.textMain }}>{p.name}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ) : (
            <View style={{ marginTop: 10, width: '100%' }}>
              {selectedForSwap && (
                <View style={s.swapBanner}>
                  <Text style={s.swapBannerText}>
                    "{selectedForSwap.name}" seçildi — yer değiştirmek için başka oyuncuya dokun
                  </Text>
                </View>
              )}
              <FullField
                teamA={teamA} teamB={teamB} substitutes={substitutes}
                selectedId={selectedForSwap?.id ?? null}
                onTap={handlePlayerTap}
                onLongPress={handleLongPress}
                onSubTap={handleSubTap}
                onMoveToBench={handleMoveToBench}
                onMoveToField={handleMoveToField}
                votes={pollVotesMap}
                fieldRef={fieldRef}
                matchInfo={buildShareInfo()}
              />
              <Text style={s.instructionText}>İki oyuncuya sırayla dokun → yer değiştir · Uzun bas → istatistik</Text>
            </View>
          )}
        </ScrollView>

        {/* Alt aksiyon barı — sadece yönetici (kaptan/yardımcı) */}
        {amIManager && (
          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, backgroundColor: COLORS.card, borderTopWidth: 1, borderColor: COLORS.border, gap: 10 }}>
            {/* Çeşitlilik: son 3 maçta aynı tarafta oynamış ikilileri ne kadar
                dağıtsın. Kapalı = saf güç dengesi (eski "Dengeli Kur"),
                Yüksek = geçmişi güçlü şekilde kıran karışık kadro. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textMuted }}>Çeşitlilik</Text>
              <View style={{ flexDirection: 'row', flex: 1, gap: 6 }}>
                {(['off', 'mid', 'high'] as DiversityLevel[]).map(lv => (
                  <TouchableOpacity
                    key={lv}
                    onPress={async () => { setDiversity(lv); await AsyncStorage.setItem('@diversity', lv); }}
                    style={{
                      flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', borderWidth: 1,
                      borderColor: diversity === lv ? COLORS.primary : COLORS.border,
                      backgroundColor: diversity === lv ? COLORS.primaryLight : COLORS.bg,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: diversity === lv ? COLORS.primary : COLORS.textMuted }}>
                      {DIVERSITY_LABELS[lv]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={s.btnPrimary} onPress={handleBuildTeams}>
              <Text style={s.btnPrimaryText}>⚡ Kadroları Kur</Text>
            </TouchableOpacity>

            {teamsRevealed && (savedTeamA.length > 0 || savedTeamB.length > 0) ? (
              <TouchableOpacity
                style={[s.btnPrimary, { backgroundColor: hasChanges ? COLORS.warning : COLORS.border }]}
                onPress={hasChanges ? handleSaveKadro : undefined}
                disabled={!hasChanges}
              >
                <Text style={[s.btnPrimaryText, { color: hasChanges ? '#FFF' : COLORS.textMuted }]}>Kadroyu Güncelle 🔄</Text>
              </TouchableOpacity>
            ) : !teamsRevealed ? (
              <TouchableOpacity
                style={[s.btnPrimary, { backgroundColor: (savedTeamA.length > 0 || savedTeamB.length > 0) ? COLORS.success : COLORS.border }]}
                onPress={handleRevealTeams}
                disabled={savedTeamA.length === 0 && savedTeamB.length === 0}
              >
                <Text style={[s.btnPrimaryText, { color: (savedTeamA.length > 0 || savedTeamB.length > 0) ? '#FFF' : COLORS.textMuted }]}>Kadroları Açıkla ⚽</Text>
              </TouchableOpacity>
            ) : null}
            {isCaptain && activePollId && (
              <TouchableOpacity
                style={{ marginTop: 12, paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.danger, backgroundColor: COLORS.dangerLight }}
                onPress={handleFinishMatch}
              >
                <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 13 }}>🏁 Maçı Bitir & İstatistik Gir</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Yoklama Ayarları Modalı */}
        <Modal visible={showPollSettings} transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={[s.modalBox, { paddingBottom: 40 }]}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Yoklama Butonlarını Özelleştir</Text>
                <TouchableOpacity onPress={() => setShowPollSettings(false)}>
                  <Text style={s.modalClose}>Kapat</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ padding: 20 }}>
                <Text style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 20, lineHeight: 20 }}>
                  Yoklamada görünecek buton metinlerini özelleştirebilirsin. Örnek: "Kesin Var" yerine "Geliyorum Abi 💪" yazabilirsin.
                </Text>
                {[
                  { key: 'optionYesLabel' as keyof PollSettings, emoji: '✅', placeholder: 'Kesin Var', label: '1. Seçenek (Var)' },
                  { key: 'optionSubLabel' as keyof PollSettings, emoji: '🔄', placeholder: 'Yedek',     label: '2. Seçenek (Yedek)' },
                  { key: 'optionNoLabel'  as keyof PollSettings, emoji: '❌', placeholder: 'Yok',       label: '3. Seçenek (Yok)' },
                ].map(item => (
                  <View key={item.key} style={{ marginBottom: 16 }}>
                    <Text style={s.inputLabel}>{item.emoji} {item.label}</Text>
                    <TextInput
                      style={s.input}
                      value={pollSettings[item.key]}
                      onChangeText={text => setPollSettings(prev => ({ ...prev, [item.key]: text }))}
                      placeholder={item.placeholder}
                      placeholderTextColor={COLORS.textMuted}
                      maxLength={30}
                    />
                  </View>
                ))}
                <TouchableOpacity style={s.btnPrimary} onPress={() => { savePollSettings(pollSettings); setShowPollSettings(false); }}>
                  <Text style={s.btnPrimaryText}>Kaydet</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <PlayerStatModal
          visible={statModal.visible}
          player={statModal.player}
          teamColor={statModal.teamColor}
          onClose={() => setStatModal({ visible: false, player: null, teamColor: null })}
        />

      </SafeAreaView>
    );
  }

  // 3. OYUNCU ANA EKRANI
  if (screen === 'home') {
    const hasKadro = savedTeamA.length > 0 || savedTeamB.length > 0;
    return (
      <SafeAreaView style={s.safe}>
        {/* Başlık */}
        <View style={s.headerHome}>
          {myTeamInfo && <TeamLogo team={myTeamInfo} size={38} />}
          <View style={{ flex: 1, marginLeft: myTeamInfo ? 10 : 0 }}>
            {myTeamInfo && userTeams.length > 1 ? (
              <TouchableOpacity onPress={() => setShowTeamSwitchModal(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={s.headerTitleHome}>{myTeamInfo.name}</Text>
                <Text style={{ fontSize: 18, color: COLORS.textMuted, marginTop: 4 }}>▾</Text>
              </TouchableOpacity>
            ) : (
              <Text style={s.headerTitleHome}>{myTeamInfo?.name || 'Saha Yönetimi'}</Text>
            )}
            <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2, fontWeight: '600' }}>
              Hoş geldin, {nickname || 'Oyuncu'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setScreen('settings')}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.primary, overflow: 'hidden' }}
          >
            {avatar && avatar !== 'default' ? (
              <Image source={{ uri: avatar }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <Text style={{ fontSize: 20 }}>👤</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={s.body}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
        >
          {/* Maç Bilgisi */}
          {activePollId ? (
            (() => {
              const dayLabel = matchDaysLabel(match.dateStr);
              const isMatchToday = match.dateStr === todayStr();
              const labelBg    = isMatchToday ? COLORS.successLight : COLORS.primaryLight;
              const labelColor = isMatchToday ? COLORS.success       : COLORS.primary;
              return (
                <View style={[s.heroCard, { flexDirection: 'column', alignItems: 'stretch', gap: 0 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                    <View style={s.heroIconBox}><Text style={{ fontSize: 24 }}>⚽</Text></View>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowMatchDetail(true)} activeOpacity={0.8}>
                      <Text style={s.heroTitle}>{match.name}</Text>
                      <View style={{ marginTop: 4 }}>
                        <View style={{ backgroundColor: labelBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 3 }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: labelColor }}>{dayLabel}</Text>
                        </View>
                        <Text style={s.heroSub}>{formatDateStr(match.dateStr)} · {match.startTime}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 3 }}>
                        <Text style={s.heroSub}>📍 {match.location}</Text>
                        {match.lat != null && match.lng != null && (
                          <TouchableOpacity
                            onPress={() => navigasyonAc(match.lat!, match.lng!)}
                            style={{ backgroundColor: COLORS.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.primary }}>🧭 Yol Tarifi</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </TouchableOpacity>
                    {amIManager && (
                      <TouchableOpacity onPress={() => { setEditMatch(match); setScreen('create'); }} style={{ padding: 4 }}>
                        <Text style={{ fontSize: 18 }}>✏️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {isCaptain && activePollId && (
                    <TouchableOpacity
                      style={{ marginTop: 8, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: COLORS.dangerLight, borderWidth: 1, borderColor: COLORS.danger }}
                      onPress={handleFinishMatch}
                    >
                      <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 13 }}>🏁 Maçı Bitir & İstatistik Gir</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })()
          ) : (
            <View style={[s.heroCard, { flexDirection: 'column', alignItems: 'center', gap: 0, paddingVertical: 28 }]}>
              <Text style={{ fontSize: 40, marginBottom: 10 }}>🏟️</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textMain }}>Şu an planlı maç yok</Text>
              <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 20 }}>
                {amIManager
                  ? 'Yoklama başlatmak için aşağıdaki butona bas.'
                  : 'Kaptan yoklama açtığında maç bilgileri burada görünür.'}
              </Text>
              {amIManager && (
                <TouchableOpacity
                  style={{ marginTop: 16, backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 }}
                  onPress={() => { setEditMatch(match); setScreen('create'); }}
                >
                  <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 13 }}>Maç Oluştur</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {!activePollId && lastMatchStat && (
            <View style={{ backgroundColor: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border }}>
              <Text style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: '600', marginBottom: 4 }}>SON MAÇ</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.textMain, textAlign: 'center' }}>
                {lastMatchStat.score_a} – {lastMatchStat.score_b}
              </Text>
              {lastMatchStat.mvp && (
                <Text style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 4 }}>
                  MVP: {lastMatchStat.mvp.full_name}
                </Text>
              )}
              {lastMatchStat.match_goals?.filter((g: any) => g.goals > 0).length > 0 && (
                <Text style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 2 }}>
                  ⚽ {lastMatchStat.match_goals.filter((g: any) => g.goals > 0).map((g: any) => `${g.profiles?.full_name} (${g.goals})`).join(', ')}
                </Text>
              )}
            </View>
          )}

          {myTeamInfo ? (
            <>
              {/* Yoklama oy butonları — tüm üyeler */}
              {activePollId ? (
                <View style={s.card}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textMain, marginBottom: 14 }}>📋 Yoklamaya Katıl</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[
                      { value: 'yes', label: pollSettings.optionYesLabel, color: COLORS.success, light: COLORS.successLight },
                      { value: 'sub', label: pollSettings.optionSubLabel, color: COLORS.warning, light: COLORS.warningLight },
                      { value: 'no',  label: pollSettings.optionNoLabel,  color: COLORS.danger,  light: COLORS.dangerLight  },
                    ].map(opt => {
                      const isActive = myVote === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={{
                            flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                            backgroundColor: isActive ? opt.color : opt.light,
                            borderWidth: isActive ? 0 : 1.5, borderColor: opt.color,
                          }}
                          onPress={() => castMyVote(opt.value as 'yes' | 'sub' | 'no')}
                        >
                          <Text style={{ fontWeight: '700', fontSize: 13, color: isActive ? '#FFF' : opt.color, textAlign: 'center' }} numberOfLines={1}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {myVote && (
                    <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 10, textAlign: 'center' }}>
                      Oyun kaydedildi ✓ · Değiştirmek için tekrar tıkla
                    </Text>
                  )}
                </View>
              ) : (
                !isCaptain && (
                  <View style={[s.card, { alignItems: 'center', paddingVertical: 28 }]}>
                    <Text style={{ fontSize: 36, marginBottom: 10 }}>⏳</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textMain }}>Henüz yoklama açılmadı</Text>
                    <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 6, textAlign: 'center' }}>
                      Kaptan yoklama başlattığında bildirim alacaksın.
                    </Text>
                  </View>
                )
              )}

              {/* Oy Sonuçları 2x2 Grid */}
              {activePollId && (() => {
                const src = isCaptain
                  ? { yes: counts.yes, sub: counts.sub, no: counts.no, wait: counts.wait }
                  : pollSummary
                  ? { yes: pollSummary.yes_count, sub: pollSummary.sub_count, no: pollSummary.no_count, wait: pollSummary.wait_count }
                  : null;
                if (!src) return null;
                const flatItems: Array<{ count: number; label: string; color: string; type: 'yes' | 'sub' | 'no' | 'wait' }> = [
                  { count: src.yes,  label: pollSettings.optionYesLabel, color: COLORS.success,   type: 'yes'  },
                  { count: src.sub,  label: pollSettings.optionSubLabel, color: COLORS.warning,   type: 'sub'  },
                  { count: src.no,   label: pollSettings.optionNoLabel,  color: COLORS.danger,    type: 'no'   },
                  { count: src.wait, label: 'Bekliyor',                  color: COLORS.textMuted, type: 'wait' },
                ];
                const cellStyle = { flex: 1, minHeight: 80, backgroundColor: COLORS.card, padding: 16, borderRadius: 12, borderLeftWidth: 4, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4 }, android: { elevation: 1 } }) };
                return (
                  <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, gap: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {flatItems.slice(0, 2).map(item => (
                        <TouchableOpacity
                          key={item.type}
                          style={[cellStyle, { borderLeftColor: item.color }]}
                          onPress={() => setVoteDetailModal({ visible: true, type: item.type })}
                          activeOpacity={0.75}
                        >
                          <Text style={{ fontSize: 24, fontWeight: '800', color: item.color }}>{item.count}</Text>
                          <Text style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: '500', marginTop: 4 }}>{item.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {flatItems.slice(2, 4).map(item => (
                        <TouchableOpacity
                          key={item.type}
                          style={[cellStyle, { borderLeftColor: item.color }]}
                          onPress={() => setVoteDetailModal({ visible: true, type: item.type })}
                          activeOpacity={0.75}
                        >
                          <Text style={{ fontSize: 24, fontWeight: '800', color: item.color }}>{item.count}</Text>
                          <Text style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: '500', marginTop: 4 }}>{item.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
              })()}
            </>
          ) : (
            <View style={[s.card, { backgroundColor: COLORS.warningLight, borderWidth: 1.5, borderColor: COLORS.warning, marginHorizontal: 20 }]}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#92400E', textAlign: 'center' }}>
                ⚠️ Henüz bir takıma dahil değilsiniz
              </Text>
              <Text style={{ fontSize: 13, color: '#92400E', textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
                "Takımım" butonuna basarak takıma katılabilir veya yeni takım kurabilirsiniz.
              </Text>
            </View>
          )}

          {/* İstatistik Şeridi */}
          {myTeamInfo && (
            <View style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 12, marginBottom: 4, gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}>
                <Text style={{ fontSize: 32, fontWeight: '700', color: COLORS.primary }}>
                  {matchesStarted}
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4, textAlign: 'center' }}>
                  Sahada başladığın maç
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}>
                <Text style={{ fontSize: 32, fontWeight: '700', color: COLORS.success }}>
                  {myTotalGoals}
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4, textAlign: 'center' }}>
                  Toplam attığın gol
                </Text>
              </View>
            </View>
          )}

          {/* Maç sonu performans oylaması — pencere açık ve henüz oy vermediysen */}
          {myTeamInfo && ratingMatch && !ratingAlreadyVoted && (
            <TouchableOpacity
              style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: COLORS.primaryLight, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.primary, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
              onPress={() => setScreen('rate_match')}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 26 }}>🗳️</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.primary }}>Performans Oyla</Text>
                <Text style={{ fontSize: 12, color: COLORS.primary, marginTop: 2 }}>
                  Son maçın oyuncularını puanla — pencere 24 saat açık.
                </Text>
              </View>
              <Text style={{ fontSize: 20, color: COLORS.primary }}>›</Text>
            </TouchableOpacity>
          )}

          {/* Ana Navigasyon Butonları */}
          <View style={{ flexDirection: 'column', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
            {/* Kadro Durumu Slotu — duruma göre değişen tek öğe */}
            {(() => {
              if (!activePollId || !myTeamInfo) return null;

              // DURUM B — kadro kurulmuş ve açıklanmış
              if (teamsRevealed && hasKadro) {
                return (
                  <TouchableOpacity
                    style={{ width: '100%', height: 64, borderRadius: 14, borderWidth: 2, borderColor: COLORS.success, backgroundColor: COLORS.successLight, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
                    onPress={() => { setTeamA(savedTeamA); setTeamB(savedTeamB); setSubstitutes(savedSubstitutes); setSelectedForSwap(null); setScreen('kadro'); }}
                  >
                    <Text style={{ fontSize: 18 }}>🏟️</Text>
                    <View>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.fieldDark }}>Kadroları Gör</Text>
                      <Text style={{ fontSize: 11, color: COLORS.success, fontWeight: '600' }}>Kadrolar açıklandı!</Text>
                    </View>
                  </TouchableOpacity>
                );
              }

              // DURUM A — yoklama aktif, kadro henüz yok
              if (amIManager) {
                const allVoted = myTeamMembers.length > 0 && counts.wait === 0;
                const borderColor = allVoted ? COLORS.success : COLORS.danger;
                const bgColor    = allVoted ? COLORS.successLight : COLORS.dangerLight;
                const textColor  = allVoted ? COLORS.fieldDark : '#991B1B';
                const subColor   = allVoted ? COLORS.success : COLORS.danger;
                return (
                  <TouchableOpacity
                    style={{ width: '100%', height: 64, borderRadius: 14, borderWidth: 2, borderColor, backgroundColor: bgColor, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
                    onPress={() => setScreen('votes')}
                  >
                    <Text style={{ fontSize: 18 }}>⚽</Text>
                    <View>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: textColor }}>Kadroları Kur</Text>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: subColor }}>
                        {allVoted ? 'Herkes oy verdi!' : `${counts.wait} kişi henüz oy vermedi`}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }

              // Sıradan oyuncu — pasif bilgi şeridi
              return (
                <View style={{ width: '100%', paddingVertical: 16, paddingHorizontal: 16, borderRadius: 14, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
                  <Text style={{ fontSize: 16 }}>⏳</Text>
                  <Text style={{ fontSize: 14, color: COLORS.textMuted, fontWeight: '500' }}>Kadro henüz açıklanmadı</Text>
                </View>
              );
            })()}
            <TouchableOpacity
              style={{ width: '100%', height: 64, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
              onPress={() => setShowMyTeamPickerModal(true)}
            >
              <Text style={{ fontSize: 18 }}>👥</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textMain }}>Takımım</Text>
              {/* Başka bir takımda oy vermediğin aktif yoklama varsa uyar */}
              {userTeams.some(t => t.id !== myTeamInfo?.id && teamAlerts[t.id]) && (
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.danger, marginLeft: 2 }} />
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        <MatchDetailModal visible={showMatchDetail} match={match} onClose={() => setShowMatchDetail(false)} poolSize={(teamA.length + teamB.length) > 0 ? (teamA.length + teamB.length) : (myTeamMembers.filter((m: any) => pollVotesMap[m.user_id || m.id] === 'yes').length || 1)} />

        {/* Oy Detay Modalı — Kim oy vermiş? */}
        {(() => {
          const t = voteDetailModal.type;
          const nameList = myTeamMembers.filter(m => {
            const v = pollVotesMap[m.user_id || m.id] ?? null;
            return t === 'wait' ? !v : v === t;
          });
          const modalLabel = t === 'yes' ? pollSettings.optionYesLabel
            : t === 'sub' ? pollSettings.optionSubLabel
            : t === 'no'  ? pollSettings.optionNoLabel
            : 'Bekliyor';
          return (
            <Modal visible={voteDetailModal.visible} transparent animationType="slide">
              <View style={s.modalOverlay}>
                <View style={[s.modalBox, { paddingBottom: 32 }]}>
                  <View style={s.modalHeader}>
                    <Text style={s.modalTitle}>{modalLabel} · {nameList.length} kişi</Text>
                    <TouchableOpacity onPress={() => setVoteDetailModal({ visible: false, type: 'wait' })}>
                      <Text style={s.modalClose}>Kapat</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={{ padding: 16 }}>
                    {nameList.length === 0 ? (
                      <Text style={{ color: COLORS.textMuted, textAlign: 'center', paddingVertical: 24 }}>
                        Bu kategoride henüz kimse yok.
                      </Text>
                    ) : (
                      nameList.map((m, i) => (
                        <View
                          key={m.user_id || m.id}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: i < nameList.length - 1 ? 1 : 0, borderColor: COLORS.border }}
                        >
                          <View style={[s.avatar, { backgroundColor: COLORS.primaryLight }]}>
                            <Text style={s.avatarText}>{(m.display_name || '?')[0]}</Text>
                          </View>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.textMain, marginLeft: 12 }}>
                            {m.display_name || 'İsimsiz'}
                          </Text>
                        </View>
                      ))
                    )}
                  </ScrollView>
                </View>
              </View>
            </Modal>
          );
        })()}

        {/* Davet Onay Modalı */}
        {pendingInviteInfo && (
          <Modal visible transparent animationType="fade">
            <View style={s.modalOverlay}>
              <View style={[s.modalBox, { paddingBottom: 28 }]}>
                <View style={{ padding: 28, alignItems: 'center', gap: 14 }}>
                  <Text style={{ fontSize: 44 }}>🛡️</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textMain, textAlign: 'center' }}>
                    {pendingInviteInfo.teamName} takımına davet edildiniz!
                  </Text>
                  <Text style={{ fontSize: 14, color: COLORS.textMuted, textAlign: 'center' }}>
                    Katılmak istiyor musunuz?
                  </Text>
                  <TouchableOpacity style={[s.btnPrimary, { width: '100%', marginTop: 4 }]} onPress={handleAcceptInvite}>
                    <Text style={s.btnPrimaryText}>Katıl ✓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.btnSecondary, { width: '100%' }]} onPress={handleDeclineInvite}>
                    <Text style={s.btnSecondaryText}>Reddet</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}

        {/* Takım Değiştirme Modalı (header için) */}
        <Modal visible={showTeamSwitchModal} transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={[s.modalBox, { paddingBottom: 24 }]}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Takım Seç</Text>
                <TouchableOpacity onPress={() => setShowTeamSwitchModal(false)}>
                  <Text style={s.modalClose}>Kapat</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ padding: 16 }}>
                {userTeams.map(team => (
                  <TouchableOpacity
                    key={team.id}
                    style={[s.menuBtn, myTeamInfo?.id === team.id && { borderWidth: 2, borderColor: COLORS.primary }]}
                    onPress={() => switchTeam(team.id)}
                  >
                    <TeamLogo team={team} size={32} />
                    <Text style={[s.menuBtnText, { marginLeft: 10 }]}>{team.name}</Text>
                    {teamAlerts[team.id] && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.danger, marginLeft: 6 }} />}
                    <View style={{ flex: 1 }} />
                    {myTeamInfo?.id === team.id && <Text style={{ color: COLORS.primary, fontWeight: '700', marginRight: 8, fontSize: 13 }}>✓ Aktif</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Takımım → Takım Seçim Modalı */}
        <Modal visible={showMyTeamPickerModal} transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={[s.modalBox, { paddingBottom: 24 }]}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>👥 Takımım</Text>
                <TouchableOpacity onPress={() => setShowMyTeamPickerModal(false)}>
                  <Text style={s.modalClose}>Kapat</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ padding: 16 }} contentContainerStyle={{ gap: 10 }}>
                {userTeams.length === 0 && (
                  <Text style={{ fontSize: 14, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 16 }}>
                    Henüz hiçbir takıma dahil değilsiniz.
                  </Text>
                )}
                {userTeams.map(team => (
                  <TouchableOpacity
                    key={team.id}
                    style={[s.menuBtn, myTeamInfo?.id === team.id && { borderWidth: 2, borderColor: COLORS.primary }]}
                    onPress={() => switchTeamAndGoMyTeam(team.id)}
                  >
                    <TeamLogo team={team} size={32} />
                    <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textMain, marginLeft: 10 }}>{team.name}</Text>
                    {teamAlerts[team.id] && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.danger, marginLeft: 6 }} />}
                    <View style={{ flex: 1 }} />
                    {myTeamInfo?.id === team.id && <Text style={{ color: COLORS.primary, fontWeight: '700', marginRight: 8, fontSize: 13 }}>✓ Aktif</Text>}
                  </TouchableOpacity>
                ))}
                <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 8 }} />
                <TouchableOpacity
                  style={[s.menuBtn, { borderColor: COLORS.primary, borderWidth: 1 }]}
                  onPress={() => { setShowMyTeamPickerModal(false); setShowJoinTeamModal(true); }}
                >
                  <View style={s.menuIconBox}><Text>➕</Text></View>
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.primary }}>Takıma Katıl</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.menuBtn, { borderColor: COLORS.success, borderWidth: 1 }]}
                  onPress={() => { setShowMyTeamPickerModal(false); setShowCreateTeamModal(true); }}
                >
                  <View style={s.menuIconBox}><Text>🏆</Text></View>
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.success }}>Yeni Takım Kur</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Davet Koduyla Katıl Modalı */}
        <Modal visible={showJoinTeamModal} transparent animationType="slide">
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.modalOverlay}>
              <View style={[s.modalBox, { paddingBottom: 32 }]}>
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>Takıma Katıl</Text>
                  <TouchableOpacity onPress={() => { setShowJoinTeamModal(false); setInviteCodeInput(''); }}>
                    <Text style={s.modalClose}>Kapat</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView keyboardShouldPersistTaps="handled">
                <View style={{ padding: 20, gap: 16 }}>
                <Text style={s.inputLabel}>Davet Kodunu Gir</Text>
                <TextInput
                  style={s.input}
                  placeholder="Örn: ABC12345"
                  placeholderTextColor={COLORS.textMuted}
                  value={inviteCodeInput}
                  onChangeText={setInviteCodeInput}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={s.btnPrimary}
                  onPress={async () => {
                    const trimmed = inviteCodeInput.trim().toUpperCase();
                    if (!trimmed) { Alert.alert('Hata', 'Lütfen bir davet kodu girin.'); return; }
                    try {
                      const { data: invite, error } = await supabase
                        .from('team_invites')
                        .select('team_id, expires_at, teams(name)')
                        .eq('code', trimmed)
                        .single();
                      if (error || !invite) { Alert.alert('Geçersiz Kod', 'Geçersiz veya süresi dolmuş kod.'); return; }
                      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
                        Alert.alert('Geçersiz Kod', 'Geçersiz veya süresi dolmuş kod.'); return;
                      }
                      const teamName = (invite.teams as any)?.name || 'Takım';
                      setShowJoinTeamModal(false);
                      Alert.alert(
                        `${teamName} takımına katıl`,
                        'Bu takıma katılmak istiyor musunuz?',
                        [
                          { text: 'İptal', style: 'cancel', onPress: () => setInviteCodeInput('') },
                          { text: 'Katıl ✓', onPress: async () => {
                            if (!session?.user?.id) return;
                            const { error: joinErr } = await supabase.from('team_members').insert({
                              team_id: invite.team_id, user_id: session.user.id, role: 'player',
                            });
                            if (joinErr) { Alert.alert('Hata', joinErr.message); return; }
                            setInviteCodeInput('');
                            await fetchMyTeam(session.user.id);
                            await fetchUserTeams(session.user.id);
                            Alert.alert('Hoş Geldin! 🎉', `${teamName} takımına katıldın!`);
                          }},
                        ]
                      );
                    } catch (err: any) { Alert.alert('Hata', err.message); }
                  }}
                >
                  <Text style={s.btnPrimaryText}>Katıl</Text>
                </TouchableOpacity>
                </View>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Takım Oluştur Modalı */}
        <Modal visible={showCreateTeamModal} transparent animationType="slide">
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.modalOverlay}>
              <View style={[s.modalBox, { paddingBottom: 32 }]}>
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>Yeni Takım Oluştur</Text>
                  <TouchableOpacity onPress={() => setShowCreateTeamModal(false)}>
                    <Text style={s.modalClose}>Kapat</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView keyboardShouldPersistTaps="handled">
                  <View style={{ padding: 20, gap: 16 }}>
                    <Text style={s.inputLabel}>Takım Adı</Text>
                    <TextInput
                      style={s.input}
                      placeholder="Örn: Mahalle FC, Çarşamba Takımı..."
                      placeholderTextColor={COLORS.textMuted}
                      value={newTeamName}
                      onChangeText={setNewTeamName}
                    />
                    <TouchableOpacity style={s.btnPrimary} onPress={() => handleCreateTeam(newTeamName)}>
                      <Text style={s.btnPrimaryText}>Takımı Oluştur</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    );
  }

  // 4. AYARLAR & PROFİL
  if (screen === 'settings') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('home')} style={s.backBtn}>
            <Text style={s.backText}>← Geri</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Ayarlar & Profil</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView
          style={s.body}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
        >
          <View style={s.card}>
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <TouchableOpacity onPress={() => setShowAvatarModal(true)} style={{ position: 'relative' }}>
                <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: COLORS.primary, overflow: 'hidden' }}>
                  {avatar === 'default' ? (
                    <Text style={{ fontSize: 44 }}>👤</Text>
                  ) : (
                    <Image source={{ uri: avatar }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  )}
                </View>
                <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.primary, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' }}>
                  <Text style={{ fontSize: 14 }}>✏️</Text>
                </View>
              </TouchableOpacity>
              <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: '600', marginTop: 12 }}>{session?.user?.email}</Text>
            </View>

            <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 12, color: COLORS.textMain }}>Oyuncu Adı / Lakabın</Text>
            <TextInput
              style={{ backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, fontSize: 16, color: COLORS.textMain, marginBottom: 24 }}
              value={nickname} onChangeText={setNickname}
            />

            {/* Mevki listesi tek kaynaktan: SKILL_POSITIONS (6 mevki — Ön Libero
                ve Forvet Arkası dahil). Saklanan değer KOD'dur (ON_LIBERO…),
                gösterimde positionLabel ile etikete çevrilir. */}
            <Text style={{ fontSize: 15, fontWeight: '700', marginBottom: 12, color: COLORS.textMain }}>Ana Mevkin</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
              {SKILL_POSITIONS.map(p => (
                <TouchableOpacity key={p.code} onPress={() => setPosition(p.code)}
                  style={[s.attrChip, position === p.code && s.attrChipActive]}>
                  <Text style={[s.posBtnText, position === p.code && s.posBtnTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 15, fontWeight: '700', marginBottom: 12, color: COLORS.textMain }}>Ayak</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
              {['Sağ', 'Sol', 'İkisi de'].map(f => (
                <TouchableOpacity key={f} onPress={() => setFoot(f)}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: foot === f ? COLORS.success : COLORS.border, alignItems: 'center', backgroundColor: foot === f ? COLORS.successLight : COLORS.bg }}>
                  <Text style={{ fontWeight: '700', fontSize: 12, color: foot === f ? COLORS.fieldDark : COLORS.textMuted }}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[s.btnPrimary, { marginBottom: 16 }]}
              onPress={async () => {
                if (!nickname || !position) { Alert.alert('Eksik Bilgi', 'Lakap ve ana mevki boş bırakılamaz.'); return; }
                try {
                  const { error } = await supabase.from('profiles').upsert({
                    id: session?.user?.id,
                    display_name: nickname,
                    main_position: position,
                    avatar_url: avatar,
                    preferred_foot: foot,
                  });
                  if (error) throw error;
                  Alert.alert('Süper!', 'Profilin başarıyla güncellendi.');
                } catch (err: any) { Alert.alert('Hata Oluştu', err.message); }
              }}
            >
              <Text style={s.btnPrimaryText}>Değişiklikleri Kaydet</Text>
            </TouchableOpacity>

            <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 16 }} />

            <TouchableOpacity
              style={[s.btnSecondary, { borderColor: COLORS.danger }]}
              onPress={async () => { await supabase.auth.signOut(); }}
            >
              <Text style={[s.btnSecondaryText, { color: COLORS.danger }]}>🚪 Hesaptan Çıkış Yap</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // 5. PROFİL TAMAMLAMA
  if (screen === 'profile_setup') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('home')} style={s.backBtn}>
            <Text style={s.backText}>← Geri</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Profilini Tamamla</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={s.body}>
          <View style={s.card}>
            <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 12, color: COLORS.textMain }}>Oyuncu Adı / Lakabın</Text>
            <TextInput
              style={{ backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, fontSize: 16, color: COLORS.textMain, marginBottom: 24 }}
              placeholder="Örn: Maestro, Kante..." placeholderTextColor={COLORS.textMuted}
              value={nickname} onChangeText={setNickname}
            />
            <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 12, color: COLORS.textMain }}>Ana Mevkin</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
              {SKILL_POSITIONS.map(p => (
                <TouchableOpacity key={p.code} onPress={() => setPosition(p.code)}
                  style={[s.attrChip, position === p.code && s.attrChipActive]}>
                  <Text style={[s.posBtnText, position === p.code && s.posBtnTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={s.btnPrimary}
              onPress={async () => {
                if (!nickname || !position) { Alert.alert('Eksik Bilgi', 'Lütfen lakabınızı yazın ve bir mevki seçin.'); return; }
                try {
                  const { error } = await supabase.from('profiles').upsert({
                    id: session?.user?.id,
                    display_name: nickname,
                    main_position: position,
                  });
                  if (error) throw error;
                  setProfileCompleted(true);
                  setScreen('home');
                  Alert.alert('Başarılı', 'Profilin harika görünüyor!');
                } catch (err: any) { Alert.alert('Hata Oluştu', err.message); }
              }}
            >
              <Text style={s.btnPrimaryText}>Profili Kaydet</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ==========================================
  // ═══════════════════════════════════════════════════════════
  // KADRO GÖRÜNÜMÜ
  // ═══════════════════════════════════════════════════════════
  if (screen === 'kadro') {
    // Oyuncu kaptan kadroları açıklayana kadar bekletiliyor
    if (!isCaptain && !teamsRevealed) {
      return (
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setScreen('home')} style={s.backBtn}>
              <Text style={s.backText}>← Geri</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>Maç Kadrosu</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>
            <Text style={{ fontSize: 52, marginBottom: 20 }}>⏳</Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: COLORS.textMain, textAlign: 'center', marginBottom: 10 }}>
              Kaptan henüz kadroları açıklamadı
            </Text>
            <Text style={{ fontSize: 14, color: COLORS.textMuted, textAlign: 'center' }}>
              Kadrolar açıklandığında burada görünecek.
            </Text>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('home')} style={s.backBtn}>
            <Text style={s.backText}>← Geri</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Maç Kadrosu</Text>
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity onPress={copyKadroText} style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
              <Text style={{ fontSize: 20 }}>📋</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={shareKadro} style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
              <Text style={{ fontSize: 20 }}>📤</Text>
            </TouchableOpacity>
          </View>
        </View>

        {kadroStale && (
          <View style={s.staleWarningBar}>
            <Text style={s.staleWarningText}>⚠ Yoklama değişti. Kadroyu yeniden kurman önerilir.</Text>
          </View>
        )}

        <View style={s.tabContainer}>
          <TouchableOpacity style={[s.tab, kadroTab === 'field' && s.tabActive]} onPress={() => setKadroTab('field')}>
            <Text style={[s.tabText, kadroTab === 'field' && s.tabTextActive]}>Saha Dizilişi</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tab, kadroTab === 'list' && s.tabActive]} onPress={() => setKadroTab('list')}>
            <Text style={[s.tabText, kadroTab === 'list' && s.tabTextActive]}>Liste Görünümü</Text>
          </TouchableOpacity>
        </View>

        <View style={{ backgroundColor: COLORS.card, paddingVertical: 10, paddingHorizontal: 20, flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity style={s.teamInfoPill} onPress={() => { setTaktikTeam('A'); setScreen('taktik'); }}>
            <View style={[s.dot, { backgroundColor: '#3B82F6' }]} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.textMain }}>A Takımı</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>{formationA} ⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.teamInfoPill} onPress={() => { setTaktikTeam('B'); setScreen('taktik'); }}>
            <View style={[s.dot, { backgroundColor: '#10B981' }]} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.textMain }}>B Takımı</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>{formationB} ⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Varyasyon seçici — SAHANIN ÜSTÜNDE sabit durur. Amaç kadro kurma
            ekranına geri dönmeden, sahaya bakarken anında başka bir varyasyona
            geçebilmek. Dokunmak yeniden HESAPLAMAZ; varyasyonlar zaten üretilmiş,
            sadece hangisinin uygulandığı değişir. */}
        {amIManager && teamVariants.length > 1 && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: COLORS.card, paddingHorizontal: 20, paddingBottom: 10,
            borderBottomWidth: 1, borderColor: COLORS.border,
          }}>
            {teamVariants.map((v, i) => (
              <TouchableOpacity
                key={v.sig}
                onPress={() => applyVariant(i)}
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1.5,
                  borderColor: variantIndex === i ? COLORS.primary : COLORS.border,
                  backgroundColor: variantIndex === i ? COLORS.primaryLight : COLORS.bg,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: variantIndex === i ? COLORS.primary : COLORS.textMuted }}>
                  V{i + 1}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={handleMoreVariants}
              style={{
                paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center',
                borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.bg,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.textMuted }}>🔄 Yeni</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView
          style={s.body}
          contentContainerStyle={{ paddingVertical: 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
        >
          {kadroTab === 'list' ? (
            <View>
              {/* TAKIM A LİSTESİ */}
              <View style={s.listTeamHeader}>
                <Text style={s.listTeamTitle}>Takım A</Text>
                <Text style={s.listTeamScore}>{teamA.reduce((sum, p) => sum + p.rating, 0)} Puan</Text>
              </View>
              <View style={s.listCard}>
                {teamA.map((p, i) => (
                  <TouchableOpacity key={p.id} style={s.listRow} onPress={() => setStatModal({ visible: true, player: p, teamColor: 'A' })}>
                    <Text style={s.listIndex}>{i + 1}.</Text>
                    <Text style={{ width: 40, fontSize: 12, fontWeight: '700', color: COLORS.primary }}>{p.fieldPos}</Text>
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.textMain }}>{p.name}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textMuted }}>{p.rating}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* TAKIM B LİSTESİ */}
              <View style={[s.listTeamHeader, { marginTop: 24 }]}>
                <Text style={s.listTeamTitle}>Takım B</Text>
                <Text style={s.listTeamScore}>{teamB.reduce((sum, p) => sum + p.rating, 0)} Puan</Text>
              </View>
              <View style={s.listCard}>
                {teamB.map((p, i) => (
                  <TouchableOpacity key={p.id} style={s.listRow} onPress={() => setStatModal({ visible: true, player: p, teamColor: 'B' })}>
                    <Text style={s.listIndex}>{i + 1}.</Text>
                    <Text style={{ width: 40, fontSize: 12, fontWeight: '700', color: COLORS.success }}>{p.fieldPos}</Text>
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.textMain }}>{p.name}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textMuted }}>{p.rating}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* YEDEKLER */}
              {substitutes.length > 0 && (
                <View style={{ marginTop: 24 }}>
                  <Text style={[s.listTeamTitle, { marginBottom: 12, paddingHorizontal: 4 }]}>Yedekler ({substitutes.length})</Text>
                  <View style={s.listCard}>
                    {substitutes.map((p, i) => (
                      <View key={p.id} style={s.listRow}>
                        <Text style={s.listIndex}>{i + 1}.</Text>
                        <Text style={{ width: 40, fontSize: 12, fontWeight: '700', color: COLORS.warning }}>{p.pos}</Text>
                        <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.textMain }}>{p.name}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ) : (
            <View style={{ marginTop: 10, width: '100%' }}>
              <View style={{ alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textMain }}>⚽ {match.name}</Text>
                <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
                  📍 {match.location}  ·  {match.startTime}
                </Text>
              </View>
              {selectedForSwap && (
                <View style={s.swapBanner}>
                  <Text style={s.swapBannerText}>
                    "{selectedForSwap.name}" seçildi — yer değiştirmek için başka oyuncuya dokun
                  </Text>
                </View>
              )}
              <FullField
                teamA={teamA} teamB={teamB} substitutes={substitutes}
                selectedId={selectedForSwap?.id ?? null}
                onTap={handlePlayerTap}
                onLongPress={handleLongPress}
                onSubTap={handleSubTap}
                onMoveToBench={handleMoveToBench}
                onMoveToField={handleMoveToField}
                votes={pollVotesMap}
                fieldRef={fieldRef}
                matchInfo={buildShareInfo()}
              />
              <Text style={s.instructionText}>İki oyuncuya sırayla dokun → yer değiştir · Uzun bas → istatistik</Text>
            </View>
          )}
        </ScrollView>

        {amIManager && (
          teamsRevealed && (savedTeamA.length > 0 || savedTeamB.length > 0) ? (
            <TouchableOpacity
              style={[s.btnPrimary, { margin: 16, backgroundColor: hasChanges ? COLORS.warning : COLORS.border }]}
              onPress={hasChanges ? handleSaveKadro : undefined}
              disabled={!hasChanges}
            >
              <Text style={[s.btnPrimaryText, { color: hasChanges ? '#FFF' : COLORS.textMuted }]}>Kadroyu Güncelle 🔄</Text>
            </TouchableOpacity>
          ) : !teamsRevealed ? (
            <TouchableOpacity
              style={[s.btnPrimary, { margin: 16, backgroundColor: (savedTeamA.length > 0 || savedTeamB.length > 0) ? COLORS.success : COLORS.border }]}
              onPress={handleRevealTeams}
              disabled={savedTeamA.length === 0 && savedTeamB.length === 0}
            >
              <Text style={[s.btnPrimaryText, { color: (savedTeamA.length > 0 || savedTeamB.length > 0) ? '#FFF' : COLORS.textMuted }]}>Kadroları Açıkla ⚽</Text>
            </TouchableOpacity>
          ) : null
        )}

        <PlayerStatModal
          visible={statModal.visible}
          player={statModal.player}
          teamColor={statModal.teamColor}
          onClose={() => setStatModal({ visible: false, player: null, teamColor: null })}
        />
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // OYUNCU HAVUZU
  // ═══════════════════════════════════════════════════════════
  if (screen === 'players') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => { setScreen(isCaptain ? 'votes' : 'home'); cancelEdit(); }} style={s.backBtn}>
            <Text style={s.backText}>← Geri</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Oyuncu Havuzu</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          ref={playersScrollRef}
          style={s.body}
          showsVerticalScrollIndicator={false}
          onScroll={e => { playersScrollY.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
        >
          {/* OYUNCU EKLEME/DÜZENLEME FORMU */}
          <View style={s.formCard}>
            <Text style={s.formCardTitle}>{editingId ? 'Oyuncuyu Düzenle' : 'Yeni Oyuncu Ekle'}</Text>
            <Text style={s.formCardSub}>Derecelendirme sistem tarafından otomatik hesaplanır.</Text>

            <TextInput
              style={s.input}
              placeholder="Oyuncu Adı"
              placeholderTextColor={COLORS.textMuted}
              value={newName}
              onChangeText={setNewName}
            />

            <Text style={s.inputLabel}>Ana Mevki</Text>
            <View style={s.posSelector}>
              {['KL', 'DEF', 'ORT', 'FOR'].map(pos => (
                <TouchableOpacity key={pos} style={[s.posBtn, newPos === pos && s.posBtnActive]} onPress={() => setNewPos(pos as Position)}>
                  <Text style={[s.posBtnText, newPos === pos && s.posBtnTextActive]}>{pos}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={[s.btnPrimary, { flex: 1 }]} onPress={/* Bu fonksiyonları yukarıdaki let bloklarından bağlamalısın */ () => Alert.alert("Kaydedildi", "Oyuncu eklendi.")}>
                <Text style={s.btnPrimaryText}>{editingId ? 'Güncelle' : 'Kaydet'}</Text>
              </TouchableOpacity>
              {editingId && (
                <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={cancelEdit}>
                  <Text style={s.btnSecondaryText}>İptal</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 20 }} />
          <Text style={s.sectionTitle}>Mevcut Oyuncular ({myTeamMembers.length})</Text>

          {myTeamMembers.map((m: any) => {
            const p = memberToPlayerInfo(m);
            return (
            <View key={p.id} style={s.playerCard}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{p.name[0]}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={s.playerName}>{p.name}</Text>
                  {goalMap[p.id] > 0 && (
                    <View style={{ backgroundColor: COLORS.successLight, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 }}>
                      <Text style={{ fontSize: 11, color: COLORS.success, fontWeight: '700' }}>⚽ {goalMap[p.id]}</Text>
                    </View>
                  )}
                </View>
                <View style={s.statsRowLine}>
                  <Text style={s.statItemBold}>{p.pos}</Text>
                  <Text style={s.statDivider}>•</Text>
                  <Text style={s.statItemMuted}>Genel:</Text>
                  <Text style={[s.statItemBold, { marginLeft: 4, color: COLORS.primary }]}>{p.rating}</Text>
                </View>
              </View>
            </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // MAÇ OLUŞTUR / DÜZENLE
  // ═══════════════════════════════════════════════════════════
  if (screen === 'create') {
    const isEditing = !!activePollId;

    const handleStep1Next = () => {
      if (!editMatch.name.trim() || !editMatch.location.trim()) {
        Alert.alert('Eksik Bilgi', 'Maç adı ve konum zorunludur.');
        return;
      }
      setWizardStep(2);
    };

    const handleSaveEdit = async () => {
      if (activePollId) {
        await supabase.from('polls').update({
          match_name:     editMatch.name,
          match_date:     editMatch.dateStr,
          match_location: editMatch.location,
        }).eq('id', activePollId);
      }
      await saveMatchData(editMatch);
    };

    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => wizardStep === 2 ? setWizardStep(1) : setScreen('home')}
            style={s.backBtn}
          >
            <Text style={s.backText}>{wizardStep === 2 ? '← Geri' : '← İptal'}</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>{wizardStep === 1 ? 'Maç Detayları' : 'Yoklama Ayarları'}</Text>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView style={s.body} contentContainerStyle={{ paddingVertical: 20 }} showsVerticalScrollIndicator={false}>

            {wizardStep === 1 ? (
              <View style={s.card}>
                <Text style={s.inputLabel}>Maç Adı</Text>
                <View style={s.inputContainer}>
                  <TextInput style={s.inputFlex} value={editMatch.name} onChangeText={t => setEditMatch({ ...editMatch, name: t })} placeholder="Örn: Haftalık Rövanş" placeholderTextColor={COLORS.textMuted} />
                  {editMatch.name.length > 0 && (
                    <TouchableOpacity onPress={() => setEditMatch({ ...editMatch, name: '' })} style={s.clearBtn}><Text style={s.clearBtnText}>✕</Text></TouchableOpacity>
                  )}
                </View>

                <Text style={s.inputLabel}>Konum / Halı Saha</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                  <View style={[s.inputContainer, { flex: 1, marginBottom: 0 }]}>
                    <TextInput style={s.inputFlex} value={editMatch.location} onChangeText={t => setEditMatch({ ...editMatch, location: t })} placeholder="Örn: Merkez Halı Saha" placeholderTextColor={COLORS.textMuted} />
                    {editMatch.location.length > 0 && (
                      <TouchableOpacity onPress={() => setEditMatch({ ...editMatch, location: '' })} style={s.clearBtn}><Text style={s.clearBtnText}>✕</Text></TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity
                    style={{ backgroundColor: COLORS.primaryLight, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: COLORS.primary }}
                    onPress={() => setShowMapModal(true)}
                  >
                    <Text style={{ fontSize: 20 }}>🗺️</Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.inputLabel}>Tarih</Text>
                <TouchableOpacity style={s.selectBox} onPress={() => setShowCal(true)}>
                  <Text style={s.selectBoxText}>{formatDateStr(editMatch.dateStr)}</Text>
                  <Text style={{ fontSize: 18 }}>📅</Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.inputLabel}>Başlangıç</Text>
                    <TouchableOpacity style={s.selectBox} onPress={() => setShowStartPicker(true)}>
                      <Text style={s.selectBoxText}>{editMatch.startTime}</Text>
                      <Text style={{ fontSize: 16 }}>🕒</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.inputLabel}>Bitiş</Text>
                    <TouchableOpacity style={s.selectBox} onPress={() => setShowEndPicker(true)}>
                      <Text style={s.selectBoxText}>{editMatch.endTime}</Text>
                      <Text style={{ fontSize: 16 }}>🕒</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={s.inputLabel}>Maç Formatı</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                  {MATCH_FORMATS.map(({ teamSize: size }) => (
                    <TouchableOpacity
                      key={size}
                      style={{
                        flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1,
                        borderColor: editMatch.teamSize === size ? COLORS.primary : COLORS.border,
                        backgroundColor: editMatch.teamSize === size ? COLORS.primaryLight : COLORS.bg,
                        alignItems: 'center',
                      }}
                      // Format değişince formasyon o formatın varsayılanına döner —
                      // aksi halde 6v6'ya geçildiğinde 8v8 formasyonu kalıp
                      // kadro slot sayısı maç formatıyla çelişirdi
                      onPress={() => setEditMatch({ ...editMatch, teamSize: size, formation: defaultFormationFor(size) })}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '700', color: editMatch.teamSize === size ? COLORS.primary : COLORS.textMuted }}>
                        {size} vs {size}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Formasyon seçimi burada YOK. Maç kurulurken hangi oyuncuların
                    geleceği belli olmadığı için burada seçilen formasyon tutmuyordu
                    (ör. 3-2-1 seçilip 2 defans gelince forvet defansa atanıyordu).
                    Artık kadro kurulurken gerçek havuza göre otomatik seçiliyor
                    (suggestFormation); kaptan isterse saha görünümünden değiştirir. */}

                <Text style={s.inputLabel}>Toplam Saha Ücreti (₺)</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                  <TextInput
                    style={[s.input, { flex: 1, marginBottom: 0 }]}
                    value={editMatch.price?.toString()}
                    onChangeText={t => setEditMatch({ ...editMatch, price: parseInt(t) || 0 })}
                    keyboardType="numeric"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    placeholder="Örn: 1400"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: COLORS.success, justifyContent: 'center', paddingHorizontal: 20, borderRadius: 12 }}
                    onPress={Keyboard.dismiss}
                  >
                    <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>Bitti ✓</Text>
                  </TouchableOpacity>
                </View>

                {isEditing ? (
                  <TouchableOpacity style={[s.btnPrimary, { marginTop: 12 }]} onPress={handleSaveEdit}>
                    <Text style={s.btnPrimaryText}>Kaydet</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[s.btnPrimary, { marginTop: 12 }]} onPress={handleStep1Next}>
                    <Text style={s.btnPrimaryText}>İleri →</Text>
                  </TouchableOpacity>
                )}

                {isEditing && amIManager && (
                  <TouchableOpacity
                    style={{ marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.dangerLight, borderWidth: 1, borderColor: COLORS.danger }}
                    onPress={handleCancelMatch}
                  >
                    <Text style={{ fontSize: 13, color: COLORS.danger, fontWeight: '700' }}>🗑️ Maçı İptal Et</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              /* ADIM 2 — Yoklama etiketleri */
              <View style={s.card}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textMain, marginBottom: 6 }}>Yoklama Butonları</Text>
                <Text style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 20, lineHeight: 20 }}>
                  Yoklamada görünecek buton metinlerini özelleştirebilirsin. Örnek: "Kesin Var" yerine "Geliyorum Abi 💪" yazabilirsin.
                </Text>
                {[
                  { key: 'optionYesLabel' as keyof PollSettings, emoji: '✅', placeholder: 'Kesin Var', label: '1. Seçenek (Var)' },
                  { key: 'optionSubLabel' as keyof PollSettings, emoji: '🔄', placeholder: 'Yedek',     label: '2. Seçenek (Yedek)' },
                  { key: 'optionNoLabel'  as keyof PollSettings, emoji: '❌', placeholder: 'Yok',       label: '3. Seçenek (Yok)' },
                ].map(item => (
                  <View key={item.key} style={{ marginBottom: 16 }}>
                    <Text style={s.inputLabel}>{item.emoji} {item.label}</Text>
                    <TextInput
                      style={s.input}
                      value={pollSettings[item.key]}
                      onChangeText={text => setPollSettings(prev => ({ ...prev, [item.key]: text }))}
                      placeholder={item.placeholder}
                      placeholderTextColor={COLORS.textMuted}
                      maxLength={30}
                    />
                  </View>
                ))}
                <TouchableOpacity
                  style={[s.btnPrimary, { marginTop: 12, backgroundColor: COLORS.success }]}
                  onPress={async () => {
                    setMatch(editMatch);
                    await AsyncStorage.setItem('@match', JSON.stringify(editMatch));
                    setTeamsRevealed(false);
                    setSavedTeamA([]); setSavedTeamB([]); setSavedSubstitutes([]);
                    await AsyncStorage.multiRemove(['@teamA', '@teamB', '@substitutes', '@formationA', '@formationB']);
                    // Yoklama başlatınca kaptanı ana ekrana at (oylama/kadro ekranına değil)
                    setScreen('home');
                    await handleOpenPoll(editMatch);
                  }}
                >
                  <Text style={s.btnPrimaryText}>Yoklamayı Başlat 📋</Text>
                </TouchableOpacity>
              </View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>

        <LocationPickerModal visible={showMapModal} onClose={() => setShowMapModal(false)} onSelect={(loc: string, lat: number, lng: number) => setEditMatch({ ...editMatch, location: loc, lat, lng })} />
        <CalendarModal visible={showCal} selected={editMatch.dateStr} onSelect={(d: string) => setEditMatch({ ...editMatch, dateStr: d })} onClose={() => setShowCal(false)} />
        <TimePickerModal visible={showStartPicker} selected={editMatch.startTime} onSelect={(t: string) => setEditMatch({ ...editMatch, startTime: t })} onClose={() => setShowStartPicker(false)} />
        <TimePickerModal visible={showEndPicker} selected={editMatch.endTime} onSelect={(t: string) => setEditMatch({ ...editMatch, endTime: t })} onClose={() => setShowEndPicker(false)} />
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // TAKTİK VE DİZİLİŞ
  // ═══════════════════════════════════════════════════════════
  if (screen === 'taktik') {
    const isA = taktikTeam === 'A';
    const currentForm = isA ? formationA : formationB;
    const teamColor = isA ? COLORS.primary : COLORS.success;
    const teamRoster = isA ? teamA : teamB;

    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('kadro')} style={s.backBtn}>
            <Text style={s.backText}>← Geri</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Takım {taktikTeam} Taktik</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={s.body}
          contentContainerStyle={{ paddingVertical: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
        >
          <Text style={s.sectionTitle}>Formasyon Seçimi</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 30 }}>
            {/* Seçenekler maçın formatına göre gelir — 6v6 maçta 8v8
                formasyonu seçilemesin (sabit liste yerine tek kaynak) */}
            {formationsForTeamSize(match.teamSize).map(f => (
              <TouchableOpacity
                key={f}
                style={[
                  s.formBtn,
                  currentForm === f && { borderColor: teamColor, backgroundColor: isA ? COLORS.primaryLight : COLORS.successLight }
                ]}
                onPress={() => {
                  if (isA) { setFormationA(f); setTeamA(applyFormation(teamA, f)); }
                  else { setFormationB(f); setTeamB(applyFormation(teamB, f)); }
                  setHasChanges(true);
                }}
              >
                <Text style={s.formBtnNum}>{f}</Text>
                <Text style={s.formBtnSub}>D-O-F</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.sectionTitle}>Atanan Pozisyonlar</Text>
          <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 12 }}>
            {teamRoster.map((p, i) => (
              <View key={p.id} style={s.taktikPlayerRow}>
                <View style={[s.taktikPosBadge, { backgroundColor: teamColor + '22' }]}>
                  <Text style={[s.taktikPosBadgeText, { color: teamColor }]}>{p.fieldPos}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.textMain, marginLeft: 12 }}>{p.name}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textMuted }}>Orijinal: {p.pos}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // TAKIMIM
  // ═══════════════════════════════════════════════════════════
  if (screen === 'my_team') {
    const playerName = selectedPlayerCard
      ? (cardIsGuest ? selectedPlayerCard.name : (selectedPlayerCard.display_name || 'İsimsiz'))
      : '';
    // Yeni mevki bazlı nitelik sistemi — kart artık primary/secondary mevki,
    // attributes jsonb ve ağırlıklı overall_rating üzerinden çalışır.
    const cardPrimary   = (selectedPlayerCard?.primary_position   as SkillPosition) || '';
    const cardSecondary = (selectedPlayerCard?.secondary_position as SkillPosition) || '';
    const cardAttrs: Record<string, any> = selectedPlayerCard?.attributes || {};
    const cardAttrFields = cardPrimary ? getAttributeFieldsFor(cardPrimary, cardSecondary) : [];
    // Renk kovası için saha mevkisi (KL/DEF/ORT/FOR)
    const playerPos = resolveFieldPos(selectedPlayerCard?.primary_position, selectedPlayerCard?.position);
    const playerPosLabel = cardPrimary ? SKILL_POSITION_LABELS[cardPrimary] : playerPos;
    const liveOverall = selectedPlayerCard
      ? (selectedPlayerCard.overall_rating != null
          ? Number(selectedPlayerCard.overall_rating)
          : computeOverall(cardAttrs, cardPrimary, cardSecondary))
      : '—';
    const posColors: Record<string, { bg: string; accent: string }> = {
      KL:  { bg: '#3D1C00', accent: '#FB923C' },
      DEF: { bg: '#0C1F3E', accent: '#60A5FA' },
      ORT: { bg: '#0A2518', accent: '#34D399' },
      FOR: { bg: '#2D0A0A', accent: '#F87171' },
    };
    const { bg: cardBg, accent: cardAccent } = posColors[playerPos] || { bg: '#1E2A3A', accent: '#94A3B8' };

    return (
      <SafeAreaView style={s.safe}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('home')} style={s.backBtn}>
            <Text style={s.backText}>← Geri</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>👥 Takımım</Text>
          <View style={{ width: 40 }} />
        </View>

        {myTeamInfo ? (
          <View style={{ flex: 1 }}>
            {/* Takım kimliği şeridi — logo + isim + takım rengi.
                Renk marka rengi; saha A/B renklerini ETKİLEMEZ. */}
            <View style={{ backgroundColor: COLORS.card, borderBottomWidth: 1, borderColor: COLORS.border }}>
              <View style={{ height: 4, backgroundColor: myTeamInfo.color || DEFAULT_TEAM_COLOR }} />
              <View style={{ paddingHorizontal: 20, paddingVertical: 14, alignItems: 'center', gap: 8 }}>
                <TeamLogo team={myTeamInfo} size={72} borderColor={myTeamInfo.color || DEFAULT_TEAM_COLOR} />
                <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.textMain }}>{myTeamInfo.name}</Text>
                <Text style={{ fontSize: 13, color: COLORS.textMuted }}>
                  {myTeamMembers.length + guestPlayers.length} Oyuncu
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{
                    backgroundColor: myRole === 'captain' ? COLORS.warningLight : myRole === 'deputy' ? COLORS.primaryLight : '#F3F4F6',
                    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10,
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: myRole === 'captain' ? '#92400E' : myRole === 'deputy' ? COLORS.primary : COLORS.textMuted }}>
                      {myRole === 'captain' ? '⚡ Kaptan' : myRole === 'deputy' ? '🔑 Yardımcı' : '👤 Oyuncu'}
                    </Text>
                  </View>
                  {amIManager && (
                    <TouchableOpacity
                      onPress={openTeamEditModal}
                      style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textMuted }}>✏️ Düzenle</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>

            {/* Sekmeler */}
            <View style={s.tabContainer}>
              <TouchableOpacity style={[s.tab, myTeamTab === 'members' && s.tabActive]} onPress={() => setMyTeamTab('members')}>
                <Text style={[s.tabText, myTeamTab === 'members' && s.tabTextActive]}>
                  Kemik Kadro ({myTeamMembers.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.tab, myTeamTab === 'guests' && s.tabActive]} onPress={() => setMyTeamTab('guests')}>
                <Text style={[s.tabText, myTeamTab === 'guests' && s.tabTextActive]}>
                  Jokerler ({guestPlayers.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Liste */}
            <ScrollView
              style={s.body}
              contentContainerStyle={{ paddingVertical: 14, paddingBottom: 24 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
            >
              {myTeamTab === 'members' ? (
                myTeamMembers.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                    <Text style={{ fontSize: 14, color: COLORS.textMuted }}>Henüz üye yok.</Text>
                  </View>
                ) : (
                  myTeamMembers.map(member => {
                    const memberId = member.user_id || member.id;
                    const memberRole = (member.role as TeamMemberRole) || 'player';
                    const roleBadge = memberRole === 'captain'
                      ? { label: '⚡', bg: COLORS.warningLight, color: '#92400E' }
                      : memberRole === 'deputy'
                      ? { label: '🔑', bg: COLORS.primaryLight, color: COLORS.primary }
                      : null;
                    return (
                      <View key={member.id} style={[s.playerCard, { paddingRight: 8 }]}>
                        <TouchableOpacity
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                          onPress={() => {
                            setSelectedPlayerCard(member);
                            setCardIsGuest(false);
                          }}
                        >
                          <View style={[s.avatar, { backgroundColor: COLORS.primaryLight }]}>
                            <Text style={s.avatarText}>{(member.display_name || '?')[0]}</Text>
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={s.playerName}>{member.display_name || 'İsimsiz Oyuncu'}</Text>
                            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                              <View style={{ backgroundColor: COLORS.primaryLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary }}>
                                  {positionLabel(member.primary_position || member.position || member.main_position)}
                                </Text>
                              </View>
                              {roleBadge && (
                                <View style={{ backgroundColor: roleBadge.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: roleBadge.color }}>{roleBadge.label}</Text>
                                </View>
                              )}
                              <View style={{ backgroundColor: COLORS.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border }}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>
                                  {member.overall_rating != null ? Number(member.overall_rating) : computeOverall(member.attributes, member.primary_position, member.secondary_position)} OVR
                                </Text>
                              </View>
                            </View>
                          </View>
                          <Text style={{ fontSize: 20, color: COLORS.border, marginRight: 4 }}>›</Text>
                        </TouchableOpacity>
                        {isCaptain && memberId !== myUserId && (
                          <TouchableOpacity
                            onPress={() => showMemberActionMenu(member)}
                            style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                          >
                            <Text style={{ fontSize: 22, color: COLORS.textMuted, fontWeight: '700' }}>⋯</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })
                )
              ) : (
                guestPlayers.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                    <Text style={{ fontSize: 14, color: COLORS.textMuted }}>Henüz joker oyuncu yok.</Text>
                    {isCaptain && (
                      <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 8 }}>
                        Sağ alttaki + butonunu kullan.
                      </Text>
                    )}
                  </View>
                ) : (
                  guestPlayers.map(guest => (
                    <TouchableOpacity
                      key={guest.id}
                      style={s.playerCard}
                      onPress={() => {
                        setSelectedPlayerCard(guest);
                        setCardIsGuest(true);
                      }}
                    >
                      <View style={[s.avatar, { backgroundColor: '#FEF3C7' }]}>
                        <Text style={[s.avatarText, { color: '#92400E' }]}>{guest.name[0]}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={s.playerName}>{guest.name}</Text>
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                          <View style={{ backgroundColor: COLORS.warningLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E' }}>{positionLabel(guest.primary_position || guest.position)}</Text>
                          </View>
                          <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#92400E' }}>Misafir</Text>
                          </View>
                          <View style={{ backgroundColor: COLORS.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>
                              {guest.overall_rating != null ? Number(guest.overall_rating) : computeOverall(guest.attributes, guest.primary_position, guest.secondary_position)} OVR
                            </Text>
                          </View>
                        </View>
                      </View>
                      <Text style={{ fontSize: 20, color: COLORS.border }}>›</Text>
                    </TouchableOpacity>
                  ))
                )
              )}
            </ScrollView>

            {/* FAB — kaptan veya yardımcı */}
            {amIManager && (
              <TouchableOpacity
                onPress={() => setShowInviteModal(true)}
                style={{
                  position: 'absolute', bottom: 24, right: 24,
                  width: 56, height: 56, borderRadius: 28,
                  backgroundColor: COLORS.primary,
                  alignItems: 'center', justifyContent: 'center',
                  ...Platform.select({
                    ios: { shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
                    android: { elevation: 6 },
                  }),
                }}
              >
                <Text style={{ fontSize: 30, color: '#FFF', lineHeight: 34 }}>+</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          /* Takım yok — kod giriş alanı */
          <ScrollView style={s.body} contentContainerStyle={{ paddingVertical: 20 }}>
            <View style={[s.card, { alignItems: 'center', paddingVertical: 32 }]}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>🔍</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.textMain, marginBottom: 8, textAlign: 'center' }}>
                Bir Takıma Bağlı Değilsin
              </Text>
              <Text style={{ fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginBottom: 24 }}>
                Davet kodunuz var mı?
              </Text>
              <TextInput
                style={[s.input, { width: '100%', textAlign: 'center', letterSpacing: 4, fontWeight: '700', marginBottom: 12 }]}
                placeholder="DAVET KODU (örn: HK7X2M9P)"
                placeholderTextColor={COLORS.textMuted}
                value={inviteCodeInput}
                onChangeText={t => setInviteCodeInput(t.toUpperCase())}
                autoCapitalize="characters"
                maxLength={8}
              />
              <TouchableOpacity style={[s.btnPrimary, { width: '100%' }]} onPress={() => handleJoinWithCode(inviteCodeInput)}>
                <Text style={s.btnPrimaryText}>Kodu Gir ve Katıl</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* ── FIFA Kartı Modalı ── */}
        {selectedPlayerCard && (
          <Modal visible transparent animationType="slide">
            <View style={[s.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
              <View style={{ backgroundColor: cardBg, borderRadius: 24, width: '88%', overflow: 'hidden', borderWidth: 1, borderColor: cardAccent + '55' }}>
                {/* Üst şerit */}
                <View style={{ height: 4, backgroundColor: cardAccent }} />

                {/* Kapat butonu */}
                <TouchableOpacity
                  onPress={() => setSelectedPlayerCard(null)}
                  style={{ position: 'absolute', top: 14, right: 14, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>

                <View style={{ padding: 22 }}>
                  {/* Üst: sol=overall+mevki, sağ=avatar */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
                    {/* Sol üst: overall + mevki */}
                    <View style={{ alignItems: 'center', minWidth: 68 }}>
                      <Text style={{ fontSize: 52, fontWeight: '900', color: cardAccent, lineHeight: 56 }}>
                        {liveOverall}
                      </Text>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.5)', marginTop: -2 }}>OVR</Text>
                      <View style={{ backgroundColor: cardAccent + '33', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 6 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: cardAccent }}>{playerPosLabel}</Text>
                      </View>
                      {cardSecondary ? (
                        <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, marginTop: 4 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.7)' }}>{SKILL_POSITION_LABELS[cardSecondary]}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Sağ: avatar dairesi */}
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: cardAccent + '22', borderWidth: 3, borderColor: cardAccent, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 36, fontWeight: '900', color: cardAccent }}>
                          {(playerName[0] || '?').toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Oyuncu adı */}
                  <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFF', textAlign: 'center', letterSpacing: 1, marginBottom: 4 }} numberOfLines={1}>
                    {playerName.toUpperCase()}
                  </Text>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 16 }}>
                    {cardIsGuest
                      ? '👤 Misafir Oyuncu'
                      : selectedPlayerCard?.role === 'captain' ? '⚡ Kaptan'
                      : selectedPlayerCard?.role === 'deputy'  ? '🔑 Yardımcı Kaptan'
                      : '⚽ Takım Üyesi'}
                  </Text>

                  {/* Ayırıcı çizgi */}
                  <View style={{ height: 1, backgroundColor: cardAccent + '44', marginBottom: 16 }} />

                  {/* Mevki bazlı nitelikler (salt okunur) — düzenleme için
                      "Nitelikleri Düzenle" formu kullanılır */}
                  {cardPrimary ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      {cardAttrFields.map(field => {
                        const raw = Number(cardAttrs[field]);
                        const val = Number.isFinite(raw) ? raw : 60;
                        return (
                          <View key={field} style={{ width: '50%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, paddingRight: 10 }}>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)' }} numberOfLines={1}>{field}</Text>
                            <Text style={{ fontSize: 15, fontWeight: '900', color: '#FFF', marginLeft: 6 }}>{val}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                      <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
                        Mevki ve nitelikler henüz girilmedi.
                      </Text>
                    </View>
                  )}

                  {/* Yönetici butonları (kaptan veya yardımcı) */}
                  {amIManager && (
                    <View style={{ marginTop: 16, gap: 10 }}>
                      <TouchableOpacity
                        style={{ backgroundColor: cardAccent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}
                        onPress={() => openAttrModal(selectedPlayerCard, cardIsGuest)}
                      >
                        <Text style={{ color: '#000', fontSize: 14, fontWeight: '800' }}>🎯 Mevki & Nitelikleri Düzenle</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </Modal>
        )}

        {/* ── Detaylı Nitelik Formu (Pozisyon Bazlı) ── */}
        <Modal visible={showAttrModal} transparent animationType="slide" onRequestClose={() => setShowAttrModal(false)}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={[s.modalOverlay, { justifyContent: 'flex-end' }]}>
              <View style={{ width: '100%', backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderColor: COLORS.border }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.textMain }} numberOfLines={1}>
                    {(attrIsGuest ? attrTarget?.name : attrTarget?.display_name) || 'Oyuncu'} — Nitelikler
                  </Text>
                  <TouchableOpacity onPress={() => setShowAttrModal(false)} style={{ padding: 4 }}>
                    <Text style={{ fontSize: 18, color: COLORS.textMuted }}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* KeyboardAwareScrollView KULLANMIYORUZ. İki ayrı bug'ı vardı:
                    (1) klavye kapanınca listeyi başa sarıyordu ("boşluğa
                    tıklayınca en üste atıyor"), (2) sabit maxHeight yüzünden
                    liste sonuna gelince Kondisyon klavyenin altında kalıyordu.
                    Çözüm: sheet'i KeyboardAvoidingView klavyenin ÜSTÜNE
                    kaldırıyor + liste flexShrink ile kalan alana oturuyor →
                    her alan (Kondisyon dahil) görünür kalıyor. Odaklanan alan
                    ayrıca onLayout y'sine göre elle ortalanır (measureLayout
                    yok → crash yok). */}
                <ScrollView
                  ref={attrScrollRef}
                  style={{ flexShrink: 1 }}
                  contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={s.inputLabel}>Ana Mevki</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                    {SKILL_POSITIONS.map(p => (
                      <TouchableOpacity
                        key={p.code}
                        onPress={() => {
                          const nextSecondary = attrSecondary === p.code ? '' : attrSecondary;
                          setAttrPrimary(p.code);
                          setAttrSecondary(nextSecondary);
                          setAttrVals(prev => {
                            const next = { ...prev };
                            getAttributeFieldsFor(p.code, nextSecondary).forEach(f => {
                              if (next[f] === undefined) next[f] = '60';
                            });
                            return next;
                          });
                        }}
                        style={[s.attrChip, attrPrimary === p.code && s.attrChipActive]}
                      >
                        <Text style={[s.posBtnText, attrPrimary === p.code && s.posBtnTextActive]}>{p.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={s.inputLabel}>İkincil Mevki (opsiyonel)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                    {SKILL_POSITIONS.filter(p => p.code !== attrPrimary).map(p => (
                      <TouchableOpacity
                        key={p.code}
                        onPress={() => {
                          const next = attrSecondary === p.code ? '' : p.code;
                          setAttrSecondary(next);
                          setAttrVals(prev => {
                            const merged = { ...prev };
                            getAttributeFieldsFor(attrPrimary, next).forEach(f => {
                              if (merged[f] === undefined) merged[f] = '60';
                            });
                            return merged;
                          });
                        }}
                        style={[s.attrChip, attrSecondary === p.code && s.attrChipActive]}
                      >
                        <Text style={[s.posBtnText, attrSecondary === p.code && s.posBtnTextActive]}>{p.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {attrPrimary ? (
                    <View
                      style={{ gap: 14 }}
                      onLayout={e => { attrFieldsBaseY.current = e.nativeEvent.layout.y; }}
                    >
                      {getAttributeFieldsFor(attrPrimary, attrSecondary).map(field => (
                        <View
                          key={field}
                          onLayout={e => { attrFieldY.current[field] = e.nativeEvent.layout.y; }}
                        >
                          {/* Kondisyon beceri niteliklerinden ayrı gösterilir —
                              OVR'a ağırlık değil ÇARPAN olarak girer. */}
                          {field === CONDITION_ATTR && (
                            <View style={{ borderTopWidth: 1, borderColor: COLORS.border, marginBottom: 12, paddingTop: 4 }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5 }}>
                                GENEL · OVR'a çarpan etkisi
                              </Text>
                            </View>
                          )}
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.textMain }}>{field}</Text>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.primary }}>{attrVals[field] ?? '60'}</Text>
                          </View>
                          <TextInput
                            style={s.input}
                            keyboardType="numeric"
                            maxLength={2}
                            value={attrVals[field] ?? ''}
                            onChangeText={t => setAttrVals(prev => ({ ...prev, [field]: t.replace(/[^0-9]/g, '') }))}
                            onFocus={() => {
                              // Odaklanan alanı görünür alanın üst-orta bölgesine kaydır
                              // (klavye altta kalmayacak şekilde). Mutlak y = liste ofseti
                              // + alanın liste içindeki y'si.
                              const absY = attrFieldsBaseY.current + (attrFieldY.current[field] || 0);
                              attrScrollRef.current?.scrollTo({ y: Math.max(0, absY - 120), animated: true });
                            }}
                          />
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 13, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 20 }}>
                      Nitelikleri görmek için önce ana mevki seç.
                    </Text>
                  )}
                </ScrollView>

                <View style={{ padding: 20, paddingTop: 12, borderTopWidth: 1, borderColor: COLORS.border }}>
                  <TouchableOpacity
                    style={[s.btnPrimary, attrSaving && { opacity: 0.6 }]}
                    onPress={handleSaveAttributes}
                    disabled={attrSaving}
                  >
                    <Text style={s.btnPrimaryText}>{attrSaving ? 'Kaydediliyor…' : 'Tamam ✓'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Oyuncu Ekleme Yöntemi Seç ── */}
        <Modal visible={showInviteModal} transparent animationType="fade">
          <View style={s.modalOverlay}>
            <View style={[s.modalBox, { paddingBottom: 24 }]}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Oyuncu Ekle</Text>
                <TouchableOpacity onPress={() => setShowInviteModal(false)}>
                  <Text style={s.modalClose}>Kapat</Text>
                </TouchableOpacity>
              </View>
              <View style={{ padding: 20, gap: 12 }}>
                {isCaptain && (
                  <TouchableOpacity
                    style={s.btnPrimary}
                    onPress={() => { setShowInviteModal(false); generateInviteLink(); }}
                  >
                    <Text style={s.btnPrimaryText}>📨 Takıma Davet Et</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={s.btnSecondary}
                  onPress={() => { setShowInviteModal(false); setShowGuestAddModal(true); }}
                >
                  <Text style={s.btnSecondaryText}>👤 Misafir Oyuncu Ekle</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Misafir Oyuncu Ekle Formu ── */}
        <Modal visible={showGuestAddModal} transparent animationType="fade">
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={s.modalOverlay}>
              <View style={[s.modalBox, { paddingBottom: 24 }]}>
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>Misafir Oyuncu</Text>
                  <TouchableOpacity onPress={() => setShowGuestAddModal(false)}>
                    <Text style={s.modalClose}>Kapat</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 12 }}>
                  <TextInput
                    style={s.input}
                    placeholder="Oyuncu Adı"
                    placeholderTextColor={COLORS.textMuted}
                    value={newGuestName}
                    onChangeText={setNewGuestName}
                  />
                  {/* Mevki burada SORULMUYOR — nitelik formunda (Mevki & Nitelikleri
                      Düzenle) ana/ikincil mevki zaten seçiliyor. */}
                  <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
                    Mevki ve nitelikleri ekledikten sonra oyuncu kartından girebilirsin.
                  </Text>
                  <TouchableOpacity style={s.btnPrimary} onPress={handleAddGuest}>
                    <Text style={s.btnPrimaryText}>Ekle</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Takım Kimliğini Düzenle (kaptan + yardımcı) ── */}
        <Modal visible={showTeamEditModal} transparent animationType="slide" onRequestClose={() => setShowTeamEditModal(false)}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.modalOverlay}>
              <View style={[s.modalBox, { paddingBottom: 24 }]}>
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>Takımı Düzenle</Text>
                  <TouchableOpacity onPress={() => setShowTeamEditModal(false)}>
                    <Text style={s.modalClose}>Kapat</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20 }} style={{ flexShrink: 1 }}>
                  {/* Logo */}
                  <View style={{ alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <TeamLogo
                      team={{ name: teamEditName, logo_url: teamEditLogo, color: teamEditColor }}
                      size={96}
                      borderColor={teamEditColor}
                    />
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity
                        onPress={pickAndUploadTeamLogo}
                        disabled={teamLogoBusy}
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight, opacity: teamLogoBusy ? 0.6 : 1 }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.primary }}>
                          {teamLogoBusy ? 'Yükleniyor…' : teamEditLogo ? '🖼️ Değiştir' : '🖼️ Logo Yükle'}
                        </Text>
                      </TouchableOpacity>
                      {teamEditLogo && !teamLogoBusy && (
                        <TouchableOpacity
                          onPress={() => {
                            const prev = teamEditLogo;
                            setTeamEditLogo(null);
                            if (prev) removeTeamLogoFile(prev);
                          }}
                          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: COLORS.danger, backgroundColor: COLORS.bg }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.danger }}>Kaldır</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={{ fontSize: 11, color: COLORS.textMuted, textAlign: 'center' }}>
                      Kare kırpılır, her yerde yuvarlak gösterilir.
                    </Text>
                  </View>

                  {/* İsim */}
                  <Text style={s.inputLabel}>Takım Adı</Text>
                  <TextInput
                    style={s.input}
                    value={teamEditName}
                    onChangeText={setTeamEditName}
                    placeholder="Takım adı"
                    placeholderTextColor={COLORS.textMuted}
                    maxLength={40}
                  />

                  {/* Renk */}
                  <Text style={s.inputLabel}>Takım Rengi</Text>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 10, marginLeft: 4 }}>
                    Kimlik rengi — maçtaki A/B takım renklerini değiştirmez.
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                    {TEAM_COLORS.map(c => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setTeamEditColor(c)}
                        style={{
                          width: 40, height: 40, borderRadius: 20, backgroundColor: c,
                          alignItems: 'center', justifyContent: 'center',
                          borderWidth: teamEditColor === c ? 3 : 1,
                          borderColor: teamEditColor === c ? COLORS.textMain : COLORS.border,
                        }}
                      >
                        {teamEditColor === c && <Text style={{ color: '#FFF', fontWeight: '800' }}>✓</Text>}
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <View style={{ paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderColor: COLORS.border }}>
                  <TouchableOpacity
                    style={[s.btnPrimary, (teamEditSaving || teamLogoBusy) && { opacity: 0.6 }]}
                    onPress={handleSaveTeamIdentity}
                    disabled={teamEditSaving || teamLogoBusy}
                  >
                    <Text style={s.btnPrimaryText}>{teamEditSaving ? 'Kaydediliyor…' : 'Kaydet ✓'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Takımdan Ayrıl ── */}
        {myTeamInfo && (
          <TouchableOpacity
            style={{ margin: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.danger, alignItems: 'center' }}
            onPress={() => {
              Alert.alert(
                'Takımdan Ayrıl',
                'Bu takımdan ayrılmak istediğinize emin misiniz?',
                [
                  { text: 'İptal', style: 'cancel' },
                  { text: 'Evet, Ayrıl', style: 'destructive', onPress: async () => {
                    if (!session?.user?.id || !myTeamInfo?.id) return;
                    const teamId = myTeamInfo.id;
                    const { data, error } = await supabase.rpc('leave_team', {
                      p_team_id: teamId,
                      p_user_id: session.user.id,
                    });
                    if (error) { Alert.alert('Hata', error.message); return; }
                    // Ayrılınan takım ana takımsa kaydı temizle → fetchMyTeam kalan ilk takıma geçer.
                    const savedMain = await AsyncStorage.getItem('@mainTeamId');
                    if (savedMain === teamId) await AsyncStorage.removeItem('@mainTeamId');
                    setMyTeamInfo(null);
                    setMyTeamMembers([]);
                    setIsCaptain(false);
                    setMyRole(null);
                    setActivePollId(null);
                    setUserTeams(prev => prev.filter(t => t.id !== teamId));
                    await fetchUserTeams(session.user.id);
                    // Kalan takım varsa otomatik yükler (hasTeam'i doğru ayarlar); yoksa hasTeam=false.
                    await fetchMyTeam(session.user.id);
                    setScreen('home');
                  }},
                ]
              );
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.danger }}>🚪 Takımdan Ayrıl</Text>
          </TouchableOpacity>
        )}

        {/* ── Davet Onay Modalı ── */}
        {pendingInviteInfo && (
          <Modal visible transparent animationType="fade">
            <View style={s.modalOverlay}>
              <View style={[s.modalBox, { paddingBottom: 28 }]}>
                <View style={{ padding: 28, alignItems: 'center', gap: 14 }}>
                  <Text style={{ fontSize: 44 }}>🛡️</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textMain, textAlign: 'center' }}>
                    {pendingInviteInfo.teamName} takımına davet edildiniz!
                  </Text>
                  <Text style={{ fontSize: 14, color: COLORS.textMuted, textAlign: 'center' }}>
                    Katılmak istiyor musunuz?
                  </Text>
                  <TouchableOpacity style={[s.btnPrimary, { width: '100%', marginTop: 4 }]} onPress={handleAcceptInvite}>
                    <Text style={s.btnPrimaryText}>Katıl ✓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.btnSecondary, { width: '100%' }]} onPress={handleDeclineInvite}>
                    <Text style={s.btnSecondaryText}>Reddet</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </SafeAreaView>
    );
  }


  // ==========================================
  // ═══════════════════════════════════════════════════════════
  // MAÇ İSTATİSTİKLERİ GİRİŞ EKRANI
  // ═══════════════════════════════════════════════════════════
  if (screen === 'stats_entry') {
    const members = (savedTeamA.length > 0 || savedTeamB.length > 0)
      ? [...savedTeamA, ...savedTeamB]
      : myTeamMembers.map(memberToPlayerInfo);
    return (
      <MatchStatsScreen
        teamMembers={members}
        teamName={myTeamInfo?.name ?? ''}
        pollId={activePollId ?? ''}
        teamId={myTeamInfo?.id ?? ''}
        userId={session?.user.id ?? ''}
        onSave={async () => {
          activePollIdRef.current = null;
          setActivePollId(null);
          setSavedTeamA([]); setSavedTeamB([]); setSavedSubstitutes([]);
          setTeamsRevealed(false);
          await AsyncStorage.multiRemove(['@teamA', '@teamB', '@substitutes', '@formationA', '@formationB', '@match']);
          await fetchLastMatchStat();
          if (session?.user?.id && myTeamInfo?.id) {
            await fetchMyTotalGoals(session.user.id, myTeamInfo.id);
          }
          setScreen('home');
        }}
        onCancel={() => setScreen('votes')}
      />
    );
  }

  // ═══════════════════════════════════════════════════════════
  // MAÇ SONU PERFORMANS OYLAMA EKRANI
  // ═══════════════════════════════════════════════════════════
  if (screen === 'rate_match') {
    return (
      <MatchRatingScreen
        teamName={myTeamInfo?.name ?? ''}
        players={ratingPlayers}
        onSubmit={submitMatchRatings}
        onCancel={() => setScreen('home')}
      />
    );
  }

  return null;
}

// ─── STİLLER ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  shadow: { ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 }, android: { elevation: 3 } }) },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.card, borderBottomWidth: 1, borderColor: COLORS.border },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textMain, flex: 1, textAlign: 'center' },
  backBtn: { paddingVertical: 5, paddingRight: 15, zIndex: 10 },
  backText: { fontSize: 15, color: COLORS.primary, fontWeight: '600' },
  headerHome: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, backgroundColor: COLORS.bg },
  headerTitleHome: { fontSize: 28, fontWeight: '800', color: COLORS.textMain },
  body: { flex: 1, paddingHorizontal: 20 },
  card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 20, marginBottom: 16, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8 }, android: { elevation: 2 } }) },
  heroCard: { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 12 }, android: { elevation: 4 } }) },
  heroIconBox: { width: 56, height: 56, borderRadius: 16, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textMain, marginBottom: 4 },
  heroSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statBlock: { flex: 1, minWidth: '45%', backgroundColor: COLORS.card, padding: 16, borderRadius: 12, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4 }, android: { elevation: 1 } }) },
  statNum: { fontSize: 24, fontWeight: '800' },
  statLbl: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500', marginTop: 4 },
  menuBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, padding: 16, borderRadius: 16, marginBottom: 12, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6 }, android: { elevation: 1 } }) },
  menuIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  menuBtnText: { flex: 1, fontSize: 16, fontWeight: '600', color: COLORS.textMain },
  menuArrow: { fontSize: 18, color: '#D1D5DB' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textMain, marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginBottom: 6, marginLeft: 4 },
  inputLabelCenter: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginBottom: 6, textAlign: 'center' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, marginBottom: 16, paddingRight: 8 },
  inputFlex: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: COLORS.textMain },
  clearBtn: { padding: 8, backgroundColor: COLORS.border, borderRadius: 16, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  clearBtnText: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted },
  input: { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: COLORS.textMain, marginBottom: 16 },
  inputCenter: { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 12, fontSize: 15, color: COLORS.textMain, textAlign: 'center' },
  selectBox: { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  selectBoxText: { fontSize: 15, color: COLORS.textMain },
  posSelector: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  posBtn: { flex: 1, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  posBtnActive: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  posBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  posBtnTextActive: { color: COLORS.primary, fontWeight: '700' },
  attrChip: { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  attrChipActive: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  btnPrimary: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', ...Platform.select({ ios: { shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }, android: { elevation: 4 } }) },
  btnPrimaryText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  btnSecondary: { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  btnSecondaryText: { color: COLORS.textMain, fontSize: 16, fontWeight: '600' },
  playerCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 12, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6 }, android: { elevation: 1 } }) },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: COLORS.primary },
  playerName: { fontSize: 16, fontWeight: '700', color: COLORS.textMain },
  statsRowLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', flex: 1, paddingRight: 8 },
  statItemBold: { fontSize: 12, fontWeight: '700', color: COLORS.textMain },
  statItemMuted: { fontSize: 11, fontWeight: '500', color: COLORS.textMuted },
  statDivider: { fontSize: 10, color: '#D1D5DB', marginHorizontal: 6 },
  actionTextEdit: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },
  actionTextDelete: { color: COLORS.danger, fontSize: 13, fontWeight: '600' },
  filterBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderColor: COLORS.border },
  filterBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  filterText: { fontSize: 12, fontWeight: '600', color: COLORS.textMain },
  voteCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, padding: 12, borderRadius: 16, marginBottom: 8 },
  playerMetaMuted: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, fontWeight: '500' },
  voteBtnGroup: { flexDirection: 'row', gap: 6 },
  voteBtn: { paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.bg, maxWidth: 72 },
  voteBtnText: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted, textAlign: 'center' },
  voteTextActive: { color: '#FFF', fontWeight: '700' },
  voteBtnYes: { backgroundColor: COLORS.success },
  voteBtnSub: { backgroundColor: COLORS.warning },
  voteBtnNo: { backgroundColor: COLORS.danger },
  bottomFloatingBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: 'rgba(255,255,255,0.9)', borderTopWidth: 1, borderColor: COLORS.border },
  tabContainer: { flexDirection: 'row', backgroundColor: COLORS.card, paddingHorizontal: 20, paddingTop: 10 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 3, borderColor: 'transparent' },
  tabActive: { borderColor: COLORS.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted },
  tabTextActive: { color: COLORS.primary, fontWeight: '700' },
  playerDotA: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#3B82F6' },
  playerDotB: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#34D399', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#065F46' },
  playerDotText: { fontSize: 12, fontWeight: '800', color: '#111827' },
  playerLabelBox: { backgroundColor: 'rgba(17,24,39,0.8)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, marginTop: 4, maxWidth: 64 },
  playerLabelText: { fontSize: 9, color: '#FFF', textAlign: 'center', fontWeight: '700' },
  playerDotSelected: { borderColor: COLORS.selectHighlight, borderWidth: 3, transform: [{ scale: 1.2 }] },
  teamInfoPill: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  instructionText: { fontSize: 12, color: COLORS.textMuted, marginTop: 12, fontWeight: '500', textAlign: 'center' },
  swapBanner: { backgroundColor: '#FEF3C7', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#FDE68A' },
  swapBannerText: { fontSize: 13, color: '#92400E', textAlign: 'center', fontWeight: '600' },
  staleWarningBar: { backgroundColor: '#FEF3C7', paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#FDE68A' },
  staleWarningText: { fontSize: 12, color: '#92400E', textAlign: 'center', fontWeight: '600' },
  listTeamHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
  listTeamTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textMain },
  listTeamScore: { fontSize: 13, fontWeight: '700', color: COLORS.primary, backgroundColor: COLORS.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  listCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', padding: 8, borderBottomWidth: 1, borderColor: COLORS.bg },
  listIndex: { width: 24, fontSize: 13, fontWeight: '600', color: COLORS.textMuted, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderColor: COLORS.border },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain },
  modalClose: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
  timeOption: { padding: 16, borderBottomWidth: 1, borderColor: COLORS.bg },
  timeOptionActive: { backgroundColor: COLORS.primaryLight },
  timeOptionText: { fontSize: 16, color: COLORS.textMain, textAlign: 'center', fontWeight: '500' },
  timeOptionTextActive: { color: COLORS.primary, fontWeight: '700' },
  voteDetailItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: COLORS.bg },
  voteDetailIndex: { width: 24, fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  voteDetailName: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.textMain },
  voteDetailPos: { fontSize: 12, fontWeight: '700', color: COLORS.primary, backgroundColor: COLORS.primaryLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  formCard: { width: '100%', backgroundColor: COLORS.card, borderRadius: 16, padding: 20, marginTop: 16 },
  formCardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain, marginBottom: 4 },
  formCardSub: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500', marginBottom: 16 },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  formBtn: { flex: 1, minWidth: '45%', backgroundColor: COLORS.bg, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  formBtnNum: { fontSize: 18, fontWeight: '900', color: COLORS.textMain },
  formBtnSub: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600', marginTop: 2, textAlign: 'center' },
  formBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  formBadgeText: { fontSize: 12, fontWeight: '800' },
  taktikPlayerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, padding: 12, borderRadius: 12, marginBottom: 8 },
  taktikPosBadge: { width: 42, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  taktikPosBadgeText: { fontSize: 11, fontWeight: '800' },
  statCardModal: { marginHorizontal: 24, marginBottom: 40, borderRadius: 24, padding: 28, alignItems: 'center', overflow: 'hidden' },
  statCardAccentLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  statCardCloseBtn: { position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  statCardCloseText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  statCardAvatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 12 },
  statCardAvatarText: { fontSize: 36, fontWeight: '900' },
  statCardName: { fontSize: 26, fontWeight: '900', color: '#FFF', letterSpacing: 0.5, marginBottom: 8 },
  statCardBadge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, marginBottom: 20 },
  statCardBadgeText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  statCardRatingBox: { alignItems: 'center', marginBottom: 24 },
  statCardRatingNum: { fontSize: 56, fontWeight: '900', lineHeight: 60 },
  statCardRatingLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: '700', letterSpacing: 2 },
  statCardBars: { width: '100%', gap: 14 },
  statBarRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statBarLabel: { width: 44, fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: 1 },
  statBarTrack: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' },
  statBarFill: { height: '100%', borderRadius: 4 },
  statBarValue: { width: 28, fontSize: 13, fontWeight: '800', textAlign: 'right' },
});