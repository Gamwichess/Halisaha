# Halı Saha Yönetim Uygulaması - Proje Dosyaları ve Yeni Görevler

Merhaba Claude. React Native (Expo) ve Supabase kullanarak geliştirdiğim bir halı saha maç ve kadro yönetim uygulaması üzerinde çalışıyorum. 

Projenin tüm veritabanı şemasını ve ana kod dosyasını (`index.tsx`) aşağıda seninle paylaşıyorum. Sistemi anlamanı ve ardından senden istediğim **Yeni Görevler**'i sadece `index.tsx` dosyasını güncelleyerek bana vermeni istiyorum.

## 📌 Proje Özeti
* **Navigasyon:** Uygulama `app/(tabs)/index.tsx` üzerinden yürüyor. Geçişleri `setScreen('create')`, `setScreen('home')` gibi state tabanlı (SPA benzeri) bir yapıyla yapıyoruz.
* **Rol Yönetimi:** Supabase'deki `team_members` tablosunda `role` ('captain' veya 'player') sütunumuz var. Ana ekranda `isCaptain` state'ini çekerek kaptan ve oyuncu ekranlarını ayırıyoruz.
* **Yoklama Sistemi:** Kaptan yoklama açıyor (`polls`), oyuncular oylamaya katılıyor (`poll_votes`). Bildirimler (`notifications`) üzerinden okunmamış bildirim rozeti gösteriyoruz.

## 🚀 Yeni Görevler (UI / UX İyileştirmeleri)
Senden **Maç Düzenleme / Oluşturma (`screen === 'create'`)** ekranını aşağıdaki 3 maddeye göre güncellemeni istiyorum:

1. **Sabit Format Butonları:**
   * Takım formatı (`teamSize`) için manuel TextInput yerine yan yana **6-6**, **7-7** ve **8-8** yazan seçilebilir sabit butonlar ekle.
2. **Harita Üzerinden Konum Seçimi:**
   * Konum input'unun yanına bir 🗺️ butonu ekle. Basılınca `react-native-maps` kullanan bir `LocationPickerModal` açılsın. Haritadan seçilen koordinatlar (veya isim) input'a yazılsın.
3. **Klavye Gizleme ve "Bitti" Butonu:**
   * Saha ücreti girilirken `keyboardType="numeric"` kullanılıyor ancak klavye ekranı kapatıyor. `KeyboardAvoidingView` kullanarak düzelt.
   * Fiyat input'unun yanına bir **"Bitti ✓"** butonu ekle, tıklanınca `Keyboard.dismiss()` çalışsın.

---

## 📂 DOSYA 1: supabase_schema.sql
```sql
CREATE TABLE polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  match_name TEXT NOT NULL DEFAULT 'Haftalık Maç',
  match_date DATE,
  match_location TEXT,
  option_yes_label TEXT NOT NULL DEFAULT 'Kesin Var',
  option_sub_label TEXT NOT NULL DEFAULT 'Yedek',
  option_no_label TEXT NOT NULL DEFAULT 'Yok',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX polls_one_active_per_team ON polls (team_id) WHERE is_active = TRUE;

CREATE TABLE poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote_value TEXT NOT NULL CHECK (vote_value IN ('yes', 'sub', 'no')),
  voted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poll_id, user_id)
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'poll_opened',
  title TEXT NOT NULL,
  body TEXT,
  related_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- team_members tablosunda 'role' sütunu var (captain / player)
ALTER TABLE team_members ADD COLUMN role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('captain', 'player'));

---

## 📂 DOSYA 2: app/(tabs)/index.tsx

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
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image, Keyboard,
  KeyboardAvoidingView,
  Modal, Platform, ScrollView, Share, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

// Senin Bileşenlerin
import Auth from '../../components/Auth';
import PlayerVoteScreen from '../../components/PlayerVoteScreen';
import { supabase } from '../../supabase';

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
type Formation = '3-2-1' | '2-3-1' | '3-1-2' | '2-2-2';

// --- YARDIMCI FONKSİYONLAR ---
function parseFormation(f: Formation) {
  const [d, o, fw] = f.split('-').map(Number);
  return { def: d, ort: o, forv: fw };
}

const INITIAL_PLAYERS: PlayerInfo[] = [
  { id: '1', name: 'Ahmet',  pos: 'FOR', rating: 85, stats: { pas: 80, sut: 90, fizik: 85, hiz: 85 } },
  { id: '2', name: 'Burak',  pos: 'DEF', rating: 78, stats: { pas: 75, sut: 65, fizik: 85, hiz: 85 } },
  { id: '3', name: 'Can',    pos: 'ORT', rating: 83, stats: { pas: 88, sut: 80, fizik: 75, hiz: 88 } },
];

const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 23; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2,'0')}:00`);
  TIME_OPTIONS.push(`${String(h).padStart(2,'0')}:30`);
}
const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const DAYS   = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];

type Vote   = 'yes' | 'sub' | 'no' | null;
type Screen = 'home' | 'create' | 'votes' | 'votes_player' | 'kadro' | 'players' | 'taktik' | 'settings' | 'profile_setup' | 'my_team';

function formatDateStr(str: string) {
  const [y,m,d] = str.split('-').map(Number);
  const date = new Date(y,m-1,d);
  return `${DAYS[date.getDay()]}, ${d} ${MONTHS[m-1]} ${y}`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function posScore(p: PlayerInfo, targetPos: Position): number {
  const st = p.stats;
  let score = 0;
  if (targetPos === 'DEF') score = (st.fizik * 1.5 + st.hiz + st.pas * 0.5);
  if (targetPos === 'ORT') score = (st.pas * 1.5 + st.hiz + st.fizik * 0.5);
  if (targetPos === 'FOR') score = (st.sut * 1.5 + st.hiz + st.pas * 0.5);
  if (p.pos === targetPos) score += 1000;
  else if (p.secPos === targetPos) score += 500;
  return -score;
}

function getGoaliesAndOutfield(pool: PlayerInfo[]) {
  let goalies  = pool.filter(p => p.pos === 'KL');
  let outfield = pool.filter(p => p.pos !== 'KL');
  if (goalies.length >= 2) {
    goalies.sort((a,b) => b.rating - a.rating);
    outfield.push(...goalies.slice(2));
    goalies = goalies.slice(0, 2);
  } else if (goalies.length === 1) {
    outfield.sort((a,b) => a.rating - b.rating);
    goalies.push(outfield.shift()!);
  } else {
    outfield.sort((a,b) => a.rating - b.rating);
    goalies.push(outfield.shift()!);
    goalies.push(outfield.shift()!);
  }
  const forcedGoalies = goalies.map(g => ({ ...g, fieldPos: 'KL' as Position }));
  return { goalies: forcedGoalies, outfield };
}

function applyFormation(team: PlayerInfo[], formation: Formation): FieldPlayer[] {
  const { def, ort, forv } = parseFormation(formation);
  let klIndex = team.findIndex(p => (p as FieldPlayer).fieldPos === 'KL' || p.pos === 'KL');
  if (klIndex === -1) {
    let minR = 999;
    team.forEach((p, i) => { if(p.rating < minR) { minR = p.rating; klIndex = i; } });
  }
  const kl   = team[klIndex];
  const rest = team.filter((_, i) => i !== klIndex);
  const unassigned = [...rest];
  const assigned: { player: PlayerInfo; pos: Position }[] = [];
  const pickBest = (targetPos: Position, count: number) => {
    for (let i = 0; i < count && unassigned.length > 0; i++) {
      unassigned.sort((a, b) => posScore(a, targetPos) - posScore(b, targetPos));
      const best = unassigned.shift()!;
      assigned.push({ player: best, pos: targetPos });
    }
  };
  pickBest('FOR', forv);
  pickBest('ORT', ort);
  pickBest('DEF', def);
  unassigned.forEach(p => assigned.push({ player: p, pos: 'DEF' }));
  const counters: Record<string, number> = { DEF: 0, ORT: 0, FOR: 0 };
  const result: FieldPlayer[] = assigned.map(({ player, pos }) => {
    const order = counters[pos] ?? 0;
    counters[pos] = order + 1;
    return { ...player, fieldPos: pos, fieldOrder: order };
  });
  result.unshift({ ...kl, fieldPos: 'KL', fieldOrder: 0 });
  return result;
}

function buildBalancedTeams(pool: PlayerInfo[], formation: Formation) {
  const { goalies, outfield } = getGoaliesAndOutfield(pool);
  const rawA: PlayerInfo[] = [goalies[0]]; const rawB: PlayerInfo[] = [goalies[1]];
  let scoreA = goalies[0]?.rating || 0; let scoreB = goalies[1]?.rating || 0;
  const grouped: Record<Position, PlayerInfo[]> = {
    KL: [],
    FOR: outfield.filter(p => p.pos === 'FOR').sort((a,b) => b.rating - a.rating),
    ORT: outfield.filter(p => p.pos === 'ORT').sort((a,b) => b.rating - a.rating),
    DEF: outfield.filter(p => p.pos === 'DEF').sort((a,b) => b.rating - a.rating),
  };
  (['FOR','ORT','DEF'] as Position[]).forEach(pos => {
    grouped[pos].forEach((p: PlayerInfo) => {
      if (rawA.length < 7 && rawB.length < 7) {
        if (scoreA <= scoreB) { rawA.push(p); scoreA += p.rating; }
        else { rawB.push(p); scoreB += p.rating; }
      } else if (rawA.length < 7) { rawA.push(p); scoreA += p.rating; }
      else if (rawB.length < 7) { rawB.push(p); scoreB += p.rating; }
    });
  });
  return { teamA: applyFormation(rawA, formation), teamB: applyFormation(rawB, formation) };
}

function buildRandomTeams(pool: PlayerInfo[], formation: Formation) {
  const { goalies, outfield } = getGoaliesAndOutfield(pool);
  const rawA: PlayerInfo[] = [goalies[0]]; const rawB: PlayerInfo[] = [goalies[1]];
  const shuffled = [...outfield].sort(() => Math.random() - 0.5);
  shuffled.forEach(p => { if (rawA.length < 7) rawA.push(p); else if (rawB.length < 7) rawB.push(p); });
  return { teamA: applyFormation(rawA, formation), teamB: applyFormation(rawB, formation) };
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
           <TouchableOpacity style={s.btnPrimary} onPress={() => { 
             // Seçilen koordinatları string olarak konuma yazdırır
             onSelect(`${marker.latitude.toFixed(5)}, ${marker.longitude.toFixed(5)}`); 
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

// ==========================================
// 🔴 BURAYA KENDİ KODUNDAKİ HalfField ve FullField BİLEŞENLERİNİ YAPIŞTIR! 🔴
// ==========================================


// ─── ANA UYGULAMA ────────────────────────────────────────────────────────────
export default function Index() {
  const [session, setSession]     = useState<Session | null>(null);
  const [hasTeam, setHasTeam]     = useState<boolean | null>(false);
  const [nickname, setNickname]   = useState('');
  const [position, setPosition]   = useState('');
  const [profileCompleted, setProfileCompleted] = useState(false);
  const [avatar, setAvatar]       = useState('default');
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [foot, setFoot]           = useState('Sağ');

  // Yoklama ayarları
  const [pollSettings, setPollSettings] = useState<PollSettings>(DEFAULT_POLL_SETTINGS);
  const [showPollSettings, setShowPollSettings] = useState(false);
  const [activePollId, setActivePollId]   = useState<string | null>(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  
  // Kaptan state'i (Supabase'den çekilen role göre belirleniyor)
  const [isCaptain, setIsCaptain] = useState(false);

  const [myTeamInfo, setMyTeamInfo]     = useState<any>(null);
  const [myTeamMembers, setMyTeamMembers] = useState<any[]>([]);
  const [isReady, setIsReady]           = useState(false);
  const [screen, setScreen]             = useState<Screen>('home');

  const [match, setMatch] = useState<MatchInfo>({
    name: 'Haftalık maç', dateStr: todayStr(), startTime: '21:00', endTime: '22:00',
    location: 'Çankaya Halı Saha', price: 1400
  });
  const [editMatch, setEditMatch] = useState<MatchInfo>(match);
  const [showMapModal, setShowMapModal] = useState(false);

  const [players, setPlayers]   = useState<PlayerInfo[]>([]);
  const [votes, setVotes]       = useState<Record<string, Vote>>({});
  
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

  const fieldRef         = useRef<View>(null);
  const playersScrollRef = useRef<ScrollView>(null);
  const playersScrollY   = useRef<number>(0);

  // ─── Supabase / Profil Yükleme Fonksiyonları ───
  async function fetchProfile(userId: string) {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (data) {
        if (data.display_name)    setNickname(data.display_name);
        if (data.main_position)   setPosition(data.main_position);
        if (data.avatar_url)      setAvatar(data.avatar_url);
        if (data.preferred_foot)  setFoot(data.preferred_foot);
        if (data.display_name && data.main_position) setProfileCompleted(true);
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

  async function fetchActivePoll(teamId: string) {
    try {
      const { data } = await supabase
        .from('polls')
        .select('id, option_yes_label, option_sub_label, option_no_label')
        .eq('team_id', teamId)
        .eq('is_active', true)
        .single();

      if (data) {
        setActivePollId(data.id);
        setPollSettings({
          optionYesLabel: data.option_yes_label,
          optionSubLabel: data.option_sub_label,
          optionNoLabel:  data.option_no_label,
        });
      }
    } catch { /* Aktif yoklama yok */ }
  }

  async function fetchMyTeam(userId: string) {
    try {
      const { data: memberData } = await supabase
        .from('team_members')
        .select('team_id, role')
        .eq('user_id', userId)
        .single();

      if (memberData) {
        setHasTeam(true);
        // İŞTE BURASI: Kaptanlık yetkisi Supabase'den gelen role göre atanıyor
        setIsCaptain(memberData.role === 'captain' || memberData.role === 'admin');

        const { data: teamData } = await supabase
          .from('teams').select('*').eq('id', memberData.team_id).single();
        setMyTeamInfo(teamData);

        const { data: roster } = await supabase
          .from('team_members').select('user_id').eq('team_id', memberData.team_id);

        if (roster && roster.length > 0) {
          const userIds = roster.map((r: any) => r.user_id);
          const { data: profs } = await supabase.from('profiles').select('*').in('id', userIds);
          setMyTeamMembers(profs || []);
        }

        await fetchActivePoll(memberData.team_id);
      } else {
        setHasTeam(false);
      }
    } catch {
      setHasTeam(false);
    }
  }

  // ─── AsyncStorage ve Auth Effectleri ───
  useEffect(() => {
    const load = async () => {
      try {
        const sp  = await AsyncStorage.getItem('@players');
        const sv  = await AsyncStorage.getItem('@votes');
        const sm  = await AsyncStorage.getItem('@match');
        const sta = await AsyncStorage.getItem('@teamA');
        const stb = await AsyncStorage.getItem('@teamB');
        const sfa = await AsyncStorage.getItem('@formationA');
        const sfb = await AsyncStorage.getItem('@formationB');
        const sps = await AsyncStorage.getItem('@pollSettings');

        const lp: PlayerInfo[] = sp ? JSON.parse(sp).map((p: any) => ({
          ...p, stats: p.stats || { pas: p.rating, sut: p.rating, fizik: p.rating, hiz: p.rating }
        })) : INITIAL_PLAYERS;

        setPlayers(lp);
        if (sm)  setMatch(JSON.parse(sm));
        if (sta) setSavedTeamA(JSON.parse(sta));
        if (stb) setSavedTeamB(JSON.parse(stb));
        if (sfa) setFormationA(JSON.parse(sfa));
        if (sfb) setFormationB(JSON.parse(sfb));
        if (sps) setPollSettings(JSON.parse(sps));

        const lv = sv ? JSON.parse(sv) : {};
        const sv2: Record<string, Vote> = {};
        lp.forEach((p: PlayerInfo) => { sv2[p.id] = lv[p.id] || null; });
        setVotes(sv2);
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
        fetchUnreadNotifs(session.user.id);
      }
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
        fetchMyTeam(session.user.id);
        fetchUnreadNotifs(session.user.id);
      }
    });
  }, []);

  // ─── İşlem Fonksiyonları ───
  const saveMatchData = async (m: MatchInfo) => {
    setMatch(m);
    await AsyncStorage.setItem('@match', JSON.stringify(m));
    setScreen('home');
  };

  const saveVote = async (id: string, vote: Vote) => {
    const nv = { ...votes, [id]: vote };
    setVotes(nv);
    await AsyncStorage.setItem('@votes', JSON.stringify(nv));
    setKadroStale(true);
  };

  const handleResetVotes = () => {
    Alert.alert("Oyları Sıfırla", "Tüm oylar sıfırlanacak. Emin misiniz?", [
      { text: "İptal", style: "cancel" },
      { text: "Sıfırla", style: "destructive", onPress: async () => {
        const cv: Record<string, Vote> = {};
        players.forEach(p => cv[p.id] = null);
        setVotes(cv);
        await AsyncStorage.setItem('@votes', JSON.stringify(cv));
        setKadroStale(true);
      }}
    ]);
  };

  const counts = {
    yes:  Object.values(votes).filter(v => v === 'yes').length,
    sub:  Object.values(votes).filter(v => v === 'sub').length,
    no:   Object.values(votes).filter(v => v === 'no').length,
    wait: Object.values(votes).filter(v => v === null).length,
  };

  async function handleOpenPoll() {
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
        match_name:       match.name,
        match_date:       match.dateStr,
        match_location:   match.location,
        option_yes_label: pollSettings.optionYesLabel,
        option_sub_label: pollSettings.optionSubLabel,
        option_no_label:  pollSettings.optionNoLabel,
        is_active:        true,
      }).select().single();

      if (error) throw error;

      setActivePollId(data.id);
      Alert.alert('Yoklama Açıldı! 📋', 'Takım üyelerine bildirim gönderildi.');
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

  async function commitTeams(a: FieldPlayer[], b: FieldPlayer[], subs: PlayerInfo[], fa: Formation, fb: Formation) {
    setTeamA(a); setTeamB(b); setSubstitutes(subs);
    setSavedTeamA(a); setSavedTeamB(b); setSavedSubstitutes(subs);
    setFormationA(fa); setFormationB(fb); setKadroStale(false);
    await AsyncStorage.setItem('@teamA', JSON.stringify(a));
    await AsyncStorage.setItem('@teamB', JSON.stringify(b));
    await AsyncStorage.setItem('@substitutes', JSON.stringify(subs));
    await AsyncStorage.setItem('@formationA', JSON.stringify(fa));
    await AsyncStorage.setItem('@formationB', JSON.stringify(fb));
  }

  function handleBuildBalanced() {
    const yesVoters = players.filter(p => votes[p.id] === 'yes');
    const subVoters = players.filter(p => votes[p.id] === 'sub');
    const main  = yesVoters.slice(0, 14);
    const subs  = [...yesVoters.slice(14), ...subVoters];
    const { teamA: a, teamB: b } = buildBalancedTeams(main, '3-2-1');
    commitTeams(a, b, subs, '3-2-1', '3-2-1');
    setSelectedForSwap(null);
    setScreen('kadro');
  }

  function handleBuildRandom() {
    const yesVoters = players.filter(p => votes[p.id] === 'yes');
    const subVoters = players.filter(p => votes[p.id] === 'sub');
    const main = yesVoters.slice(0, 14);
    const subs = [...yesVoters.slice(14), ...subVoters];
    const { teamA: a, teamB: b } = buildRandomTeams(main, '3-2-1');
    commitTeams(a, b, subs, '3-2-1', '3-2-1');
    setSelectedForSwap(null);
    setScreen('kadro');
  }

  const shareKadro = async () => {
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
    try {
      if (kadroTab === 'field' && fieldRef.current) {
        const uri = await captureRef(fieldRef, { format: 'png', quality: 0.9 });
        if (Platform.OS === 'ios') await Share.share({ url: uri, message: msg });
        else await Sharing.shareAsync(uri, { dialogTitle: 'Kadroyu Paylaş', mimeType: 'image/png' });
      } else { await Share.share({ message: msg }); }
    } catch { Alert.alert('Hata', 'Paylaşım sırasında hata oluştu.'); }
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

  // --- RENDER FONKSİYONLARI ---

  // Yükleniyor Durumu
  if (!isReady) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );

  // Auth Kontrolü
  if (!session && isReady) return <Auth />;

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

  // 2. KAPTAN İÇİN YOKLAMA YÖNETİMİ
  if (screen === 'votes') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('home')} style={s.backBtn}>
            <Text style={s.backText}>← Geri</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Yoklama (Kaptan)</Text>
          <TouchableOpacity onPress={handleResetVotes} style={{ paddingLeft: 10 }}>
            <Text style={{ color: COLORS.danger, fontSize: 14, fontWeight: '700' }}>Sıfırla</Text>
          </TouchableOpacity>
        </View>

        {/* Yoklama Yönetim Şeridi */}
        <View style={{ backgroundColor: COLORS.card, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: COLORS.border, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
              {[pollSettings.optionYesLabel, pollSettings.optionSubLabel, pollSettings.optionNoLabel].map((label, i) => (
                <View key={i} style={{
                  flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center',
                  backgroundColor: i === 0 ? COLORS.successLight : i === 1 ? COLORS.warningLight : COLORS.dangerLight,
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: i === 0 ? '#065F46' : i === 1 ? '#92400E' : '#991B1B' }} numberOfLines={1}>{label}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => setShowPollSettings(true)}
              style={{ backgroundColor: COLORS.primaryLight, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>✏️ Düzenle</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={handleOpenPoll}
            style={{ backgroundColor: activePollId ? COLORS.successLight : COLORS.primary, borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: activePollId ? 1 : 0, borderColor: COLORS.success }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: activePollId ? COLORS.fieldDark : '#FFF' }}>
              {activePollId ? '🔄 Yoklamayı Yenile (Bildirim Gönder)' : '📋 Yoklama Aç & Takıma Bildir'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={s.filterBar}>
          {[
            { c: COLORS.success, n: counts.yes,  l: pollSettings.optionYesLabel },
            { c: COLORS.warning, n: counts.sub,  l: pollSettings.optionSubLabel },
            { c: COLORS.danger,  n: counts.no,   l: pollSettings.optionNoLabel  },
            { c: COLORS.border,  n: counts.wait, l: 'Bekliyor' },
          ].map(i => (
            <View key={i.l} style={s.filterBadge}>
              <View style={[s.dot, { backgroundColor: i.c }]} />
              <Text style={s.filterText}>{i.n} {i.l}</Text>
            </View>
          ))}
        </View>

        <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 100 }}>
          {players.map(p => (
            <View key={p.id} style={s.voteCard}>
              <View style={[s.avatar,
                votes[p.id]==='yes' ? { backgroundColor: COLORS.successLight }
                : votes[p.id]==='sub' ? { backgroundColor: COLORS.warningLight }
                : votes[p.id]==='no'  ? { backgroundColor: COLORS.dangerLight }
                : {}
              ]}>
                <Text style={s.avatarText}>{p.name[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.playerName}>{p.name}</Text>
                <Text style={s.playerMetaMuted}>{p.pos} • Ort: {p.rating}</Text>
              </View>
              <View style={s.voteBtnGroup}>
                <TouchableOpacity style={[s.voteBtn, votes[p.id]==='yes' && s.voteBtnYes]} onPress={() => saveVote(p.id,'yes')}>
                  <Text style={[s.voteBtnText, votes[p.id]==='yes' && s.voteTextActive]} numberOfLines={1}>{pollSettings.optionYesLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.voteBtn, votes[p.id]==='sub' && s.voteBtnSub]} onPress={() => saveVote(p.id,'sub')}>
                  <Text style={[s.voteBtnText, votes[p.id]==='sub' && s.voteTextActive]} numberOfLines={1}>{pollSettings.optionSubLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.voteBtn, votes[p.id]==='no' && s.voteBtnNo]} onPress={() => saveVote(p.id,'no')}>
                  <Text style={[s.voteBtnText, votes[p.id]==='no' && s.voteTextActive]} numberOfLines={1}>{pollSettings.optionNoLabel}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={s.bottomFloatingBar}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity style={[s.btnPrimary, { flex: 1 }]} onPress={handleBuildBalanced}>
              <Text style={s.btnPrimaryText}>Dengeli Kur</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={handleBuildRandom}>
              <Text style={s.btnSecondaryText}>Rastgele Kur</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Yoklama Ayarları Modalı (Hook hatası düzeltildi) */}
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

                <TouchableOpacity
                  style={s.btnPrimary}
                  onPress={() => {
                    savePollSettings(pollSettings);
                    setShowPollSettings(false);
                  }}
                >
                  <Text style={s.btnPrimaryText}>Kaydet</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    );
  }

  // 3. ANA EKRAN (Kaptan ve Oyuncu Kontrolü Burada Yapılıyor)
  if (screen === 'home') {
    const hasKadro = savedTeamA.length > 0 || savedTeamB.length > 0;
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.headerHome}>
          <View>
            <Text style={s.headerTitleHome}>Saha Yönetimi</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2, marginLeft: 2, fontWeight: '600' }}>
              Hoş geldin, {isCaptain ? 'Kaptan' : 'Oyuncu'}
            </Text>
          </View>
          <TouchableOpacity
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => setScreen('settings')}
          >
            <Text style={{ fontSize: 20 }}>👤</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={s.body} showsVerticalScrollIndicator={false}>

          <View style={s.heroCard}>
            <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16 }} onPress={() => setShowMatchDetail(true)} activeOpacity={0.8}>
              <View style={s.heroIconBox}><Text style={{ fontSize: 24 }}>⚽</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.heroTitle}>{match.name}</Text>
                <Text style={s.heroSub}>📍 {match.location}</Text>
                <Text style={s.heroSub}>📅 {formatDateStr(match.dateStr)} · {match.startTime}-{match.endTime}</Text>
              </View>
            </TouchableOpacity>
            {isCaptain && (
              <TouchableOpacity
                style={{ backgroundColor: COLORS.bg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, marginLeft: 8 }}
                onPress={() => { setEditMatch(match); setScreen('create'); }}
              >
                <Text style={{ fontSize: 16 }}>✏️</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={s.statsGrid}>
            {[
              { count: counts.yes,  label: pollSettings.optionYesLabel, color: COLORS.success,   type: 'yes'  as const },
              { count: counts.sub,  label: pollSettings.optionSubLabel, color: COLORS.warning,   type: 'sub'  as const },
              { count: counts.no,   label: pollSettings.optionNoLabel,  color: COLORS.danger,    type: 'no'   as const },
              { count: counts.wait, label: 'Bekliyor',                  color: COLORS.textMuted, type: 'wait' as const },
            ].map(item => (
              <TouchableOpacity key={item.type}
                style={[s.statBlock, { borderLeftColor: item.color, borderLeftWidth: 4 }]}
                onPress={() => setVoteDetailModal({ visible: true, type: item.type })}
              >
                <Text style={[s.statNum, { color: item.color }]}>{item.count}</Text>
                <Text style={s.statLbl}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Yoklama Butonu: isCaptain state'ine göre yönlendirme yapar */}
          <TouchableOpacity
            style={s.menuBtn}
            onPress={() => {
              if (isCaptain) {
                setScreen('votes'); // Kaptanı yoklama yönetim ekranına atar
              } else {
                // Oyuncuyu kendi ekranına atar ve bildirimleri okundu sayar
                if (session?.user?.id && unreadNotifCount > 0) {
                  supabase.from('notifications')
                    .update({ is_read: true })
                    .eq('user_id', session.user.id)
                    .eq('is_read', false);
                  setUnreadNotifCount(0);
                }
                setScreen('votes_player'); 
              }
            }}
          >
            <View style={s.menuIconBox}><Text>✋</Text></View>
            <Text style={s.menuBtnText}>
              {isCaptain ? 'Yoklama Al & Düzenle' : 'Yoklamaya Katıl'}
            </Text>
            {unreadNotifCount > 0 && !isCaptain && (
              <View style={{
                backgroundColor: COLORS.danger, borderRadius: 10,
                minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center',
                paddingHorizontal: 6, marginRight: 8,
              }}>
                <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>{unreadNotifCount}</Text>
              </View>
            )}
            <Text style={s.menuArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.menuBtn} onPress={() => setScreen('players')}>
            <View style={s.menuIconBox}><Text>👥</Text></View>
            <Text style={s.menuBtnText}>Oyuncu Havuzu ({players.length} Kişi)</Text>
            <Text style={s.menuArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.menuBtn} onPress={() => setScreen('my_team')}>
            <View style={[s.menuIconBox, { backgroundColor: '#EDE9FE' }]}><Text>🛡️</Text></View>
            <Text style={s.menuBtnText}>Takımım</Text>
            <Text style={s.menuArrow}>→</Text>
          </TouchableOpacity>

          {hasKadro && (
            <TouchableOpacity
              style={[s.menuBtn, kadroStale && { borderWidth: 1.5, borderColor: COLORS.warning }]}
              onPress={() => { setTeamA(savedTeamA); setTeamB(savedTeamB); setSubstitutes(savedSubstitutes); setSelectedForSwap(null); setScreen('kadro'); }}
            >
              <View style={[s.menuIconBox, { backgroundColor: kadroStale ? COLORS.warningLight : COLORS.successLight }]}><Text>🏟️</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuBtnText}>Kadroyu Gör</Text>
                {kadroStale && <Text style={{ fontSize: 11, color: COLORS.warning, fontWeight: '600', marginTop: 2 }}>⚠ Yoklama değişti, kadro güncel olmayabilir</Text>}
              </View>
              <Text style={s.menuArrow}>→</Text>
            </TouchableOpacity>
          )}

          {/* Sadece Kaptan Hızlı Takım Kurabilir */}
          {isCaptain && (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 40 }}>
              <TouchableOpacity style={[s.btnPrimary, { flex: 1 }]} onPress={handleBuildBalanced}>
                <Text style={s.btnPrimaryText}>Dengeli Kur</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={handleBuildRandom}>
                <Text style={s.btnSecondaryText}>Rastgele Kur</Text>
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
        <MatchDetailModal visible={showMatchDetail} match={match} onClose={() => setShowMatchDetail(false)} poolSize={(teamA.length + teamB.length) > 0 ? (teamA.length + teamB.length) : (players.filter(p => votes[p.id] === 'yes').length || 1)} />
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
        <ScrollView style={s.body}>
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

            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', marginBottom: 12, color: COLORS.textMain }}>Ana Mevkin</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {['KL', 'DEF', 'ORT', 'FOR'].map(pos => (
                    <TouchableOpacity key={pos} onPress={() => setPosition(pos)}
                      style={{ width: '45%', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: position === pos ? COLORS.primary : COLORS.border, alignItems: 'center', backgroundColor: position === pos ? COLORS.primaryLight : COLORS.bg }}>
                      <Text style={{ fontWeight: '700', fontSize: 12, color: position === pos ? COLORS.primary : COLORS.textMuted }}>{pos}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', marginBottom: 12, color: COLORS.textMain }}>Ayak</Text>
                <View style={{ flexDirection: 'column', gap: 8 }}>
                  {['Sağ', 'Sol', 'İkisi de'].map(f => (
                    <TouchableOpacity key={f} onPress={() => setFoot(f)}
                      style={{ paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: foot === f ? COLORS.success : COLORS.border, alignItems: 'center', backgroundColor: foot === f ? COLORS.successLight : COLORS.bg }}>
                      <Text style={{ fontWeight: '700', fontSize: 12, color: foot === f ? COLORS.fieldDark : COLORS.textMuted }}>{f}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
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
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32 }}>
              {['KL', 'DEF', 'ORT', 'FOR'].map(pos => (
                <TouchableOpacity key={pos} onPress={() => setPosition(pos)}
                  style={{ flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: position === pos ? COLORS.primary : COLORS.border, alignItems: 'center', backgroundColor: position === pos ? COLORS.primaryLight : COLORS.bg }}>
                  <Text style={{ fontWeight: '600', color: position === pos ? COLORS.primary : COLORS.textMuted }}>{pos}</Text>
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
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('home')} style={s.backBtn}>
            <Text style={s.backText}>← Geri</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Maç Kadrosu</Text>
          <TouchableOpacity onPress={shareKadro} style={{ paddingLeft: 10 }}>
            <Text style={{ fontSize: 20 }}>📤</Text>
          </TouchableOpacity>
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

        <ScrollView style={s.body} contentContainerStyle={{ paddingVertical: 20 }} showsVerticalScrollIndicator={false}>
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
            // SAHA GÖRÜNÜMÜ YER TUTUCUSU (FullField bileşenini buraya entegre edersin)
            <View ref={fieldRef} collapsable={false} style={{ alignItems: 'center', backgroundColor: COLORS.fieldDark, borderRadius: 16, padding: 30, overflow: 'hidden' }}>
              <Text style={{ color: 'white', textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}>Saha Görünümü</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 10 }}>Buraya görsel saha çizimi (FullField) bileşenini ekleyebilirsin. Şimdilik liste görünümünü kullanabilirsin.</Text>
            </View>
          )}
        </ScrollView>

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
          <TouchableOpacity onPress={() => { setScreen('home'); cancelEdit(); }} style={s.backBtn}>
            <Text style={s.backText}>← Geri</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Oyuncu Havuzu</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView ref={playersScrollRef} style={s.body} showsVerticalScrollIndicator={false} onScroll={e => { playersScrollY.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}>
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
          <Text style={s.sectionTitle}>Mevcut Oyuncular ({players.length})</Text>

          {players.map(p => (
            <View key={p.id} style={s.playerCard}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{p.name[0]}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.playerName}>{p.name}</Text>
                <View style={s.statsRowLine}>
                  <Text style={s.statItemBold}>{p.pos}</Text>
                  {p.secPos && <><Text style={s.statDivider}>|</Text><Text style={s.statItemMuted}>{p.secPos}</Text></>}
                  <Text style={s.statDivider}>•</Text>
                  <Text style={s.statItemMuted}>Genel:</Text>
                  <Text style={[s.statItemBold, { marginLeft: 4, color: COLORS.primary }]}>{p.rating}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                <TouchableOpacity onPress={() => {/* handleEditPlayer(p) */}}>
                  <Text style={s.actionTextEdit}>Düzenle</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => {/* handleRemovePlayer(p.id) */}}>
                  <Text style={s.actionTextDelete}>Sil</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // MAÇ OLUŞTUR / DÜZENLE
  // ═══════════════════════════════════════════════════════════
  if (screen === 'create') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('home')} style={s.backBtn}>
            <Text style={s.backText}>← İptal</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Maç Detayları</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* KeyboardAvoidingView sayesinde klavye açılınca ekran yukarı kayar */}
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView style={s.body} contentContainerStyle={{ paddingVertical: 20 }} showsVerticalScrollIndicator={false}>
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
                {/* Harita Açma Butonu */}
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

              {/* SABİT FORMAT BUTONLARI (6-6, 7-7, 8-8) */}
              <Text style={s.inputLabel}>Maç Formatı</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                {[6, 7, 8].map(size => (
                  <TouchableOpacity
                    key={size}
                    style={{
                      flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1,
                      borderColor: editMatch.teamSize === size ? COLORS.primary : COLORS.border,
                      backgroundColor: editMatch.teamSize === size ? COLORS.primaryLight : COLORS.bg,
                      alignItems: 'center'
                    }}
                    onPress={() => setEditMatch({ ...editMatch, teamSize: size })}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '700', color: editMatch.teamSize === size ? COLORS.primary : COLORS.textMuted }}>
                      {size} vs {size}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* FİYAT ALANI VE KLAVYE GİZLEME BİTTİ BUTONU */}
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

              <TouchableOpacity style={[s.btnPrimary, { marginTop: 12 }]} onPress={() => saveMatchData(editMatch)}>
                <Text style={s.btnPrimaryText}>Kaydet ve Dön</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <LocationPickerModal visible={showMapModal} onClose={() => setShowMapModal(false)} onSelect={(loc: string) => setEditMatch({ ...editMatch, location: loc })} />
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

        <ScrollView style={s.body} contentContainerStyle={{ paddingVertical: 20 }}>
          <Text style={s.sectionTitle}>Formasyon Seçimi</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 30 }}>
            {['3-2-1', '2-3-1', '3-1-2', '2-2-2'].map(f => (
              <TouchableOpacity
                key={f}
                style={[
                  s.formBtn,
                  currentForm === f && { borderColor: teamColor, backgroundColor: isA ? COLORS.primaryLight : COLORS.successLight }
                ]}
                onPress={() => {
                  if (isA) { setFormationA(f as Formation); setTeamA(applyFormation(teamA, f as Formation)); }
                  else { setFormationB(f as Formation); setTeamB(applyFormation(teamB, f as Formation)); }
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
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('home')} style={s.backBtn}>
            <Text style={s.backText}>← Geri</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Takımım</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={s.body} contentContainerStyle={{ paddingVertical: 20 }}>
          {myTeamInfo ? (
            <View>
              <View style={[s.card, { alignItems: 'center', paddingVertical: 30 }]}>
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Text style={{ fontSize: 40 }}>🛡️</Text>
                </View>
                <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.textMain, marginBottom: 8 }}>{myTeamInfo.name}</Text>
                <View style={{ backgroundColor: isCaptain ? COLORS.warningLight : COLORS.successLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: isCaptain ? '#92400E' : '#065F46' }}>
                    Senin Rolün: {isCaptain ? 'Kaptan 👑' : 'Oyuncu 🏃‍♂️'}
                  </Text>
                </View>
              </View>

              <Text style={s.sectionTitle}>Takım Üyeleri ({myTeamMembers.length})</Text>
              <View style={s.card}>
                {myTeamMembers.map((member, index) => (
                  <View key={member.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: index === myTeamMembers.length - 1 ? 0 : 1, borderColor: COLORS.bg }}>
                    <View style={s.avatar}>
                      <Text style={s.avatarText}>{member.display_name ? member.display_name[0] : '?'}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={s.playerName}>{member.display_name || 'İsimsiz Oyuncu'}</Text>
                      <Text style={s.playerMetaMuted}>{member.main_position || 'Mevki Belirtilmemiş'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={[s.card, { alignItems: 'center', paddingVertical: 40 }]}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>🔍</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.textMain, marginBottom: 8, textAlign: 'center' }}>Bir Takıma Bağlı Değilsin</Text>
              <Text style={{ fontSize: 14, color: COLORS.textMuted, textAlign: 'center' }}>Halı saha takımına katılmak için kaptanından davet linki veya kodu isteyebilirsin.</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  
  // ==========================================

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