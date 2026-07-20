import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session } from '@supabase/supabase-js';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList,
  Image,
  Keyboard, KeyboardAvoidingView,
  Modal, Platform,
  ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import Auth from '../../components/Auth';
import TeamSelection from '../../components/TeamSelection';
import { supabase } from '../../supabase';

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

type Position = 'KL' | 'DEF' | 'ORT' | 'FOR';
interface PlayerStats { pas: number; sut: number; fizik: number; hiz: number; }
interface PlayerInfo { 
  id: string; name: string; pos: Position; 
  secPos?: Position | null; 
  rating: number; stats: PlayerStats; 
  hasPaid?: boolean; isGuest?: boolean; statsKnown?: boolean; 
}

// BÜTÜN MAÇ BİLGİLERİ TEK BİR ŞABLONDA TOPLANDI
interface MatchInfo {
  name: string;
  location: string;
  dateStr: string;
  startTime: string;
  endTime: string;
  price?: number; 
  teamSize?: number; 
}

interface FieldPlayer extends PlayerInfo { fieldPos: Position; fieldOrder: number; }

type Formation = '3-2-1' | '2-3-1' | '3-1-2' | '2-2-2';
const FORMATIONS: Formation[] = ['3-2-1', '2-3-1', '3-1-2', '2-2-2'];
function parseFormation(f: Formation): { def: number; ort: number; forv: number } {
  const [d, o, fw] = f.split('-').map(Number);
  return { def: d, ort: o, forv: fw };
}

const INITIAL_PLAYERS: PlayerInfo[] = [
  { id: '1', name: 'Ahmet',  pos: 'FOR', rating: 85, stats: { pas: 80, sut: 90, fizik: 85, hiz: 85 } },
  { id: '2', name: 'Burak',  pos: 'DEF', rating: 78, stats: { pas: 75, sut: 65, fizik: 85, hiz: 85 } },
  { id: '3', name: 'Can',    pos: 'ORT', rating: 83, stats: { pas: 88, sut: 80, fizik: 75, hiz: 88 } },
  { id: '4', name: 'Deniz',  pos: 'KL',  rating: 78, stats: { pas: 60, sut: 40, fizik: 85, hiz: 75 } },
  { id: '5', name: 'Emre',   pos: 'FOR', rating: 90, stats: { pas: 85, sut: 95, fizik: 88, hiz: 92 } },
  { id: '6', name: 'Furkan', pos: 'DEF', rating: 84, stats: { pas: 80, sut: 70, fizik: 90, hiz: 80 } },
  { id: '7', name: 'Gökhan', pos: 'ORT', rating: 79, stats: { pas: 82, sut: 75, fizik: 78, hiz: 81 } },
];

const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 23; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2,'0')}:00`);
  TIME_OPTIONS.push(`${String(h).padStart(2,'0')}:30`);
}
const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const DAYS   = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];

type Vote   = 'yes' | 'sub' | 'no' | null;
type Screen = 'home' | 'create' | 'votes' | 'kadro' | 'players' | 'taktik' | 'settings' | 'profile_setup' | 'my_team';

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
  let goalies = pool.filter(p => p.pos === 'KL');
  let outfield = pool.filter(p => p.pos !== 'KL');

  if (goalies.length >= 2) {
    goalies.sort((a,b) => b.rating - a.rating); 
    outfield.push(...goalies.slice(2)); 
    goalies = goalies.slice(0, 2);
  } else if (goalies.length === 1) {
    outfield.sort((a,b) => a.rating - b.rating); 
    goalies.push(outfield.shift()!); 
  } else if (goalies.length === 0) {
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

  const kl = team[klIndex];
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

function buildBalancedTeams(pool: PlayerInfo[], formation: Formation): { teamA: FieldPlayer[]; teamB: FieldPlayer[] } {
  const { goalies, outfield } = getGoaliesAndOutfield(pool);
  const rawA: PlayerInfo[] = [goalies[0]];
  const rawB: PlayerInfo[] = [goalies[1]];
  let scoreA = goalies[0]?.rating || 0;
  let scoreB = goalies[1]?.rating || 0;

  const grouped: Record<Position, PlayerInfo[]> = {
    KL: [],
    FOR: outfield.filter(p => p.pos === 'FOR').sort((a, b) => b.rating - a.rating),
    ORT: outfield.filter(p => p.pos === 'ORT').sort((a, b) => b.rating - a.rating),
    DEF: outfield.filter(p => p.pos === 'DEF').sort((a, b) => b.rating - a.rating),
  };

  (['FOR', 'ORT', 'DEF'] as Position[]).forEach(pos => {
    grouped[pos].forEach((p: PlayerInfo) => {
      if (rawA.length < 7 && rawB.length < 7) {
        if (scoreA <= scoreB) { rawA.push(p); scoreA += p.rating; }
        else { rawB.push(p); scoreB += p.rating; }
      } else if (rawA.length < 7) { rawA.push(p); scoreA += p.rating; }
      else if (rawB.length < 7) { rawB.push(p); scoreB += p.rating; }
    });
  });

  const teamA = applyFormation(rawA, formation);
  const teamB = applyFormation(rawB, formation);
  return { teamA, teamB };
}

function buildRandomTeams(pool: PlayerInfo[], formation: Formation): { teamA: FieldPlayer[]; teamB: FieldPlayer[] } {
  const { goalies, outfield } = getGoaliesAndOutfield(pool);
  
  const rawA: PlayerInfo[] = [goalies[0]];
  const rawB: PlayerInfo[] = [goalies[1]];
  const shuffled = [...outfield].sort(() => Math.random() - 0.5);

  shuffled.forEach(p => {
    if (rawA.length < 7) rawA.push(p);
    else if (rawB.length < 7) rawB.push(p);
  });

  const teamA = applyFormation(rawA, formation);
  const teamB = applyFormation(rawB, formation);
  return { teamA, teamB };
}

// ─── ALT BİLEŞENLER ───────────────────────────────────────────

function TimePickerModal({ visible, selected, onSelect, onClose }: {
  visible: boolean; selected: string; onSelect: (t: string) => void; onClose: () => void;
}) {
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

function CalendarModal({ visible, selected, onSelect, onClose }: {
  visible: boolean; selected: string; onSelect: (d: string) => void; onClose: () => void;
}) {
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
            onDayPress={(day: { dateString: string }) => { onSelect(day.dateString); onClose(); }}
            markedDates={{ [selected]: { selected: true, selectedColor: COLORS.primary } }}
            theme={{ selectedDayBackgroundColor: COLORS.primary, todayTextColor: COLORS.primary, arrowColor: COLORS.primary, textDayFontWeight: '500' }}
          />
        </View>
      </View>
    </Modal>
  );
}

function MatchDetailModal({ visible, match, onClose, poolSize }: { visible: boolean; match: MatchInfo; onClose: () => void; poolSize: number; }) {
  const activeCount = poolSize || 1;
  const maxCapacity = match.teamSize ? (match.teamSize * 2) : activeCount;
  const divisor = Math.min(activeCount, maxCapacity); // 16 oy varsa 14'e, 12 oy varsa 12'ye böler
  const pp = Math.ceil((match.price || 0) / Math.max(divisor, 1));

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
              { icon: '⚽', label: 'Maç Adı',  val: match.name },
              { icon: '📍', label: 'Konum',    val: match.location },
              { icon: '📅', label: 'Tarih',    val: formatDateStr(match.dateStr) },
              { icon: '🕐', label: 'Saat',     val: `${match.startTime} – ${match.endTime}` },
              { icon: '🏟️', label: 'Format',   val: match.teamSize ? `${match.teamSize} vs ${match.teamSize}` : 'Belirtilmedi' },
              { icon: '💵', label: 'Ücret Durumu', val: `${match.price || 0} ₺ (Kişi Başı: ~${pp} ₺)` },
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

function PlayerStatModal({ visible, player, teamColor, onClose }: {
  visible: boolean; player: PlayerInfo | null; teamColor: 'A' | 'B' | null; onClose: () => void;
}) {
  if (!player) return null;
  const isA = teamColor === 'A';
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

function HalfField({
  team, isTop, selectedId, onTap, onLongPress, votes,
}: {
  team: FieldPlayer[]; isTop: boolean;
  selectedId: string | null;
  onTap: (p: FieldPlayer) => void;
  onLongPress: (p: FieldPlayer) => void;
  votes: Record<string, Vote>;
}) {
  const pad = 16;
  const W = FIELD_W;
  const H = HALF_FIELD_H;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;

  const grouped: Record<Position, FieldPlayer[]> = { KL: [], DEF: [], ORT: [], FOR: [] };
  team.forEach(p => { if (grouped[p.fieldPos]) grouped[p.fieldPos].push(p); else grouped.ORT.push(p); });
  Object.values(grouped).forEach(g => g.sort((a, b) => a.fieldOrder - b.fieldOrder));

  const yFor = isTop ? pad + innerH * 0.82 : pad + innerH * 0.18;
  const yOrt = isTop ? pad + innerH * 0.58 : pad + innerH * 0.42;
  const yDef = isTop ? pad + innerH * 0.32 : pad + innerH * 0.68;
  const yKl  = isTop ? pad + innerH * 0.10 : pad + innerH * 0.90;

  const posY: Record<Position, number> = { FOR: yFor, ORT: yOrt, DEF: yDef, KL: yKl };

  const dots: { x: number; y: number; p: FieldPlayer }[] = [];
  (['KL','DEF','ORT','FOR'] as Position[]).forEach(pos => {
    const grp = grouped[pos]; const n = grp.length;
    grp.forEach((p, i) => {
      dots.push({ x: pad + (innerW / (n + 1)) * (i + 1), y: posY[pos], p });
    });
  });

  return (
    <View style={{ width: W, height: H, borderRadius: 12, overflow: 'hidden', backgroundColor: COLORS.fieldDark }}>
      <Svg width={W} height={H} style={{ position: 'absolute' }}>
        <Rect x={0} y={0} width={W} height={H} fill={COLORS.fieldDark} />
        <Rect x={pad} y={pad} width={innerW} height={innerH} fill="none" stroke={COLORS.fieldLine} strokeWidth={1.5} opacity={0.5} />
        <Line x1={pad} y1={isTop ? pad : H - pad} x2={W - pad} y2={isTop ? pad : H - pad} stroke={COLORS.fieldLine} strokeWidth={2} opacity={0.7} />
        <Rect x={W/2 - innerW*0.19} y={isTop ? pad : H-pad-36} width={innerW*0.38} height={36}
          fill="none" stroke={COLORS.fieldLine} strokeWidth={1.5} opacity={0.6} />
      </Svg>
      {dots.map(({ x, y, p }) => {
        const isSel = p.id === selectedId;
        return (
          <TouchableOpacity key={p.id}
            onPress={() => onTap(p)}
            onLongPress={() => onLongPress(p)}
            style={{ position: 'absolute', left: x - 25, top: y - 18, alignItems: 'center', width: 50,
              opacity: votes[p.id] === 'sub' ? 0.75 : 1 }}>
            <View style={[s.playerDotA, isSel && s.playerDotSelected,
              votes[p.id] === 'sub' && { borderColor: COLORS.warning, borderWidth: 3 }]}>
              <Text style={s.playerDotText}>{p.name[0]}</Text>
            </View>
            <View style={[s.playerLabelBox, isSel && { backgroundColor: COLORS.selectHighlight }]}>
              <Text style={s.playerLabelText} numberOfLines={1}>{p.name}</Text>
            </View>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, marginTop: 2 }}>
              <Text style={{ fontSize: 8, color: '#ccc', fontWeight: '700' }}>{p.fieldPos}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function FullField({
  teamA, teamB, substitutes, selectedId, onTap, onLongPress, onSubTap, onMoveToBench, onMoveToField, votes, fieldRef,
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
}) {
  const pad = 16;
  const W = FIELD_W; const H = FIELD_H;
  const innerW = W - pad * 2; const innerH = H - pad * 2;
  const cx = W / 2; const midY = H / 2;
  const goalW = innerW * 0.38; const boxH = 48; const goalH = 16;

  const getPos = (team: FieldPlayer[], isTop: boolean) => {
    const grouped: Record<Position, FieldPlayer[]> = { KL: [], DEF: [], ORT: [], FOR: [] };
    team.forEach(p => { if (grouped[p.fieldPos]) grouped[p.fieldPos].push(p); else grouped.ORT.push(p); });
    Object.values(grouped).forEach(g => g.sort((a, b) => a.fieldOrder - b.fieldOrder));
    const halfH = innerH / 2;
    const yMap = isTop
      ? { KL: pad + halfH * 0.10, DEF: pad + halfH * 0.35, ORT: pad + halfH * 0.65, FOR: pad + halfH * 0.90 }
      : { KL: H-(pad + halfH*0.10), DEF: H-(pad+halfH*0.35), ORT: H-(pad+halfH*0.65), FOR: H-(pad+halfH*0.90) };
    const dots: { x: number; y: number; p: FieldPlayer }[] = [];
    (['KL','DEF','ORT','FOR'] as Position[]).forEach(pos => {
      const grp = grouped[pos]; const n = grp.length;
      grp.forEach((p, i) => dots.push({ x: pad + (innerW/(n+1))*(i+1), y: yMap[pos], p }));
    });
    return dots;
  };

  const dotsA = getPos(teamA, true);
  const dotsB = getPos(teamB, false);

  const renderDot = (x: number, y: number, p: FieldPlayer, isTeamA: boolean) => {
    const isSel = p.id === selectedId;
    const dotStyle = isTeamA ? s.playerDotA : s.playerDotB;
    return (
      <TouchableOpacity key={p.id} onPress={() => onTap(p)} onLongPress={() => onLongPress(p)}
        style={{ position: 'absolute', left: x-25, top: y-15, alignItems: 'center', width: 50,
          opacity: votes[p.id] === 'sub' ? 0.75 : 1 }}>
        <View style={[dotStyle, isSel && s.playerDotSelected,
          votes[p.id] === 'sub' && { borderColor: COLORS.warning, borderWidth: 3 }]}>
          <Text style={s.playerDotText}>{p.name[0]}</Text>
        </View>
        <View style={[s.playerLabelBox, isSel && { backgroundColor: COLORS.selectHighlight }]}>
          <Text style={s.playerLabelText} numberOfLines={1}>{p.name}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const isSubSelected = substitutes.some(p => p.id === selectedId);

  return (
    <View ref={fieldRef} collapsable={false}
      style={{ width: '100%', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 20, ...s.shadow }}>
      
      {/* Yeşil Saha */}
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
        {dotsA.map(({ x, y, p }) => renderDot(x, y, p, true))}
        {dotsB.map(({ x, y, p }) => renderDot(x, y, p, false))}
      </View>

      {/* YEDEK KULÜBESİ BÖLÜMÜ */}
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

// ─── ANA UYGULAMA ───────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [hasTeam, setHasTeam] = useState<boolean | null>(false);
  const [nickname, setNickname] = useState('');
  const [position, setPosition] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [profileCompleted, setProfileCompleted] = useState(false);
  const [avatar, setAvatar] = useState('default');
  // KULLANICIYA KAMERA MI GALERİ Mİ DİYE SORAN YAPI
  const handlePremiumAvatar = () => {
    Alert.alert(
      "Yapay Zeka Avatarı 🤖",
      "Fotoğrafını nereden seçmek istersin?",
      [
        { text: "Kamera ile Çek", onPress: () => openPicker('camera') },
        { text: "Galeriden Seç", onPress: () => openPicker('gallery') },
        { text: "İptal", style: "cancel" }
      ]
    );
  };

  
 // 1. FOTOĞRAFI VE BASE64 KODUNU ALAN MOTOR
  const openPicker = async (type: 'camera' | 'gallery') => {
    try {
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true, // SİHİRLİ AYAR BURADA
      };

      let result;

      if (type === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('İzin Gerekli', 'Kameranı kullanabilmek için iznine ihtiyacımız var.');
          return;
        }
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('İzin Gerekli', 'Fotoğraf seçebilmemiz için iznine ihtiyacımız var.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync(options);
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedImageUri = result.assets[0].uri;
        const selectedBase64 = result.assets[0].base64;

        setShowAvatarModal(false);

        // MOTOR 2 PARAMETRE YOLLUYOR
        if (selectedBase64) {
          processAndToonifyImage(selectedImageUri, selectedBase64);
        } else {
          Alert.alert("Hata", "Fotoğraf okunamadı, lütfen başka bir fotoğraf deneyin.");
        }
      }
    } catch (error) {
      Alert.alert('Hata', 'Fotoğraf seçilirken bir sorun oluştu.');
      console.error(error);
    }
  };


  // 2. GELEN İKİ PARAMETREYİ YAKALAYIP YAPAY ZEKAYA GÖNDEREN KÖPRÜ
  const processAndToonifyImage = async (localUri: string, base64String: string) => {
    try {
      Alert.alert("Yapay Zeka Devrede 🤖", "Fotoğrafın atölyeye alındı. Toon stiline çevrilip orijinali imha edilecek. Bu işlem 15-20 saniye sürebilir...");

      const userId = session?.user?.id;
      if (!userId) {
        Alert.alert("Hata", "Kullanıcı kimliği bulunamadı.");
        return;
      }

      const tempPath = `${userId}/temp_original_${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('user_avatars')
        .upload(tempPath, decode(base64String), { contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      const { data: signedData, error: signedError } = await supabase.storage
        .from('user_avatars')
        .createSignedUrl(tempPath, 60);

      if (signedError) throw signedError;

      const { data: aiData, error: aiError } = await supabase.functions.invoke('toonify-avatar', {
        body: {
          imageUrl: signedData.signedUrl,
          userId: userId,
          tempOriginalPath: tempPath
        }
      });

      if (aiError) {
        console.error("AI İşlem Hatası:", aiError);
        throw new Error("Yapay Zeka sunucusunda bir hata oluştu.");
      }

      setAvatar(aiData.toonUrl);
      Alert.alert("Efsane Oldu! 🌟", "Yeni avatarın hazır! Orijinal fotoğrafın ise sunuculardan kalıcı olarak imha edildi.");

    } catch (error: any) {
      Alert.alert("İşlem Hatası", error.message);
      console.error(error);
    }
  };

  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [foot, setFoot] = useState('Sağ');
  const [favTimes, setFavTimes] = useState<string[]>([]);
  const [transport, setTransport] = useState('');
  const [maxDistance, setMaxDistance] = useState('');

  const toggleFavTime = (time: string) => {
    if (favTimes.includes(time)) setFavTimes(favTimes.filter(t => t !== time));
    else setFavTimes([...favTimes, time]);
  };
  const [myTeamInfo, setMyTeamInfo] = useState<any>(null);
  const [myTeamMembers, setMyTeamMembers] = useState<any[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [screen, setScreen]   = useState<Screen>('home');
  
  const [match, setMatch] = useState<MatchInfo>({
    name: 'Haftalık maç', dateStr: todayStr(), startTime: '21:00', endTime: '22:00', location: 'Çankaya Halı Saha', price: 1400
  });
  const [editMatch, setEditMatch] = useState<MatchInfo>(match);
  
  const [players, setPlayers]     = useState<PlayerInfo[]>([]);
  const [votes, setVotes]         = useState<Record<string, Vote>>({});
  const [showCal, setShowCal]     = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker]     = useState(false);

  const [teamA, setTeamA] = useState<FieldPlayer[]>([]);
  const [teamB, setTeamB] = useState<FieldPlayer[]>([]);
  const [substitutes, setSubstitutes] = useState<PlayerInfo[]>([]);
  const [savedSubstitutes, setSavedSubstitutes] = useState<PlayerInfo[]>([]);
  const [savedTeamA, setSavedTeamA] = useState<FieldPlayer[]>([]);
  const [savedTeamB, setSavedTeamB] = useState<FieldPlayer[]>([]);
  const [kadroStale, setKadroStale] = useState(false);

  const [formationA, setFormationA] = useState<Formation>('3-2-1');
  const [formationB, setFormationB] = useState<Formation>('3-2-1');
  const [kadroTab, setKadroTab] = useState<'field' | 'list'>('field');

  const [taktikTeam, setTaktikTeam] = useState<'A' | 'B'>('A');

  const [selectedForSwap, setSelectedForSwap] = useState<any>(null);
  const [statModal, setStatModal] = useState<{ visible: boolean; player: PlayerInfo | null; teamColor: 'A' | 'B' | null }>({ visible: false, player: null, teamColor: null });
  const [showMatchDetail, setShowMatchDetail] = useState(false);
  const [voteDetailModal, setVoteDetailModal] = useState<{ visible: boolean; type: Vote | 'wait' }>({ visible: false, type: 'wait' });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPos, setNewPos] = useState<Position>('ORT');
  const [newSecPos, setNewSecPos] = useState<Position | null>(null);
  const [newPas, setNewPas] = useState(''); const [newSut, setNewSut] = useState('');
  const [newFizik, setNewFizik] = useState(''); const [newHiz, setNewHiz] = useState('');

  const fieldRef = useRef<View>(null);
  const playersScrollRef = useRef<ScrollView>(null);
  const playersScrollY = useRef<number>(0);

  async function fetchProfile(userId: string) {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (data) {
        if (data.display_name) setNickname(data.display_name);
        if (data.main_position) setPosition(data.main_position);
        if (data.avatar_url) setAvatar(data.avatar_url);
        if (data.preferred_foot) setFoot(data.preferred_foot);
        if (data.fav_times) setFavTimes(data.fav_times);
        if (data.transport_status) setTransport(data.transport_status);
        if (data.max_distance) setMaxDistance(data.max_distance);
        setIsAvailable(data.is_available_for_hiring ?? true);
        
        if (data.display_name && data.main_position) {
          setProfileCompleted(true);
        }
      }
    } catch (e) {
      console.log('Profil bilgileri çekilemedi:', e);
    }
  }

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

        const lp: PlayerInfo[] = sp ? JSON.parse(sp).map((p: any) => ({
          ...p, stats: p.stats || { pas: p.rating, sut: p.rating, fizik: p.rating, hiz: p.rating }
        })) : INITIAL_PLAYERS;

        setPlayers(lp);
        if (sm) setMatch(JSON.parse(sm));
        if (sta) { setSavedTeamA(JSON.parse(sta)); }
        if (stb) { setSavedTeamB(JSON.parse(stb)); }
        if (sfa) setFormationA(JSON.parse(sfa));
        if (sfb) setFormationB(JSON.parse(sfb));

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
      }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
        fetchMyTeam(session.user.id);
      }
    });
  }, []);

  const saveMatchData = async (m: MatchInfo) => {
    setMatch(m); await AsyncStorage.setItem('@match', JSON.stringify(m)); setScreen('home');
  };

  const saveVote = async (id: string, vote: Vote) => {
    const nv = { ...votes, [id]: vote };
    setVotes(nv); await AsyncStorage.setItem('@votes', JSON.stringify(nv));
    setKadroStale(true);
  };

  const handleResetVotes = () => {
    Alert.alert("Oyları Sıfırla", "Tüm oylar sıfırlanacak. Emin misiniz?", [
      { text: "İptal", style: "cancel" },
      { text: "Sıfırla", style: "destructive", onPress: async () => {
        const cv: Record<string, Vote> = {};
        players.forEach(p => cv[p.id] = null);
        setVotes(cv); await AsyncStorage.setItem('@votes', JSON.stringify(cv));
        setKadroStale(true);
      }}
    ]);
  };

  const counts = {
    yes:  Object.values(votes).filter(v => v === 'yes').length,
    sub: Object.values(votes).filter(v => v === 'sub').length,
    no:   Object.values(votes).filter(v => v === 'no').length,
    wait: Object.values(votes).filter(v => v === null).length,
  };

  async function fetchMyTeam(userId: string) {
    try {
      const { data: memberData } = await supabase.from('team_members').select('team_id').eq('user_id', userId).single();
      
      if (memberData) {
        setHasTeam(true);
        const { data: teamData } = await supabase.from('teams').select('*').eq('id', memberData.team_id).single();
        setMyTeamInfo(teamData);
        
        const { data: roster } = await supabase.from('team_members').select('user_id').eq('team_id', memberData.team_id);
        
        if (roster && roster.length > 0) {
          const userIds = roster.map((r: any) => r.user_id);
          const { data: profs } = await supabase.from('profiles').select('*').in('id', userIds);
          setMyTeamMembers(profs || []);
        }
      } else {
        setHasTeam(false);
      }
    } catch (e) {
      console.log('Takım bilgisi bulunamadı veya çekilemedi');
      setHasTeam(false);
    }
  }

  async function commitTeams(a: FieldPlayer[], b: FieldPlayer[], subs: PlayerInfo[], fa: Formation, fb: Formation) {
    setTeamA(a); setTeamB(b); setSubstitutes(subs);
    setSavedTeamA(a); setSavedTeamB(b); setSavedSubstitutes(subs);
    setFormationA(fa); setFormationB(fb);
    setKadroStale(false);
    await AsyncStorage.setItem('@teamA', JSON.stringify(a));
    await AsyncStorage.setItem('@teamB', JSON.stringify(b));
    await AsyncStorage.setItem('@substitutes', JSON.stringify(subs));
    await AsyncStorage.setItem('@formationA', JSON.stringify(fa));
    await AsyncStorage.setItem('@formationB', JSON.stringify(fb));
  }

  function handleBuildBalanced() {
    const yesVoters = players.filter(p => votes[p.id] === 'yes');
    const subVoters = players.filter(p => votes[p.id] === 'sub');

    const main = yesVoters.slice(0, 14);
    const overflow = yesVoters.slice(14);
    const subs = [...overflow, ...subVoters];

    const { teamA: a, teamB: b } = buildBalancedTeams(main, '3-2-1');
    commitTeams(a, b, subs, '3-2-1', '3-2-1');
    setSelectedForSwap(null);
    setScreen('kadro');
  }

  function handleBuildRandom() {
    const yesVoters = players.filter(p => votes[p.id] === 'yes');
    const subVoters = players.filter(p => votes[p.id] === 'sub');

    const main = yesVoters.slice(0, 14);
    const overflow = yesVoters.slice(14);
    const subs = [...overflow, ...subVoters];

    const { teamA: a, teamB: b } = buildRandomTeams(main, '3-2-1');
    commitTeams(a, b, subs, '3-2-1', '3-2-1');
    setSelectedForSwap(null);
    setScreen('kadro');
  }

  function changeFormation(team: 'A' | 'B', f: Formation) {
    if (team === 'A') {
      const newT = applyFormation(teamA, f);
      setTeamA(newT); setSavedTeamA(newT); setFormationA(f);
      AsyncStorage.setItem('@teamA', JSON.stringify(newT));
      AsyncStorage.setItem('@formationA', JSON.stringify(f));
    } else {
      const newT = applyFormation(teamB, f);
      setTeamB(newT); setSavedTeamB(newT); setFormationB(f);
      AsyncStorage.setItem('@teamB', JSON.stringify(newT));
      AsyncStorage.setItem('@formationB', JSON.stringify(f));
    }
    setSelectedForSwap(null);
  }

  function handlePlayerTap(player: any) {
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
      if (inA_A) { newA = newA.map(p => p.id === idA ? { ...player } : p); newB = newB.map(p => p.id === idB ? { ...selField } : p); } 
      else { newB = newB.map(p => p.id === idA ? { ...player } : p); newA = newA.map(p => p.id === idB ? { ...selField } : p); }
    }
    setTeamA(newA as any); setTeamB(newB as any); setSavedTeamA(newA as any); setSavedTeamB(newB as any);
    AsyncStorage.setItem('@teamA', JSON.stringify(newA)); AsyncStorage.setItem('@teamB', JSON.stringify(newB));
    setSelectedForSwap(null);
  }

  function handleSubTap(sub: any) {
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
      setSelectedForSwap(null);
    } else {
      setSelectedForSwap(sub);
    }
  }

  function handleMoveToBench() {
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
      setSelectedForSwap(null);
    }
  }

  function handleMoveToField(teamId: 'A' | 'B') {
    if (!selectedForSwap) return;
    
    const isSub = substitutes.find(p => p.id === selectedForSwap.id);
    if (!isSub) return; 

    const team = teamId === 'A' ? teamA : teamB;
    const setTeam = teamId === 'A' ? setTeamA : setTeamB;
    const key = teamId === 'A' ? '@teamA' : '@teamB';

    const newFieldPlayer: any = {
      ...isSub,
      fieldPos: isSub.pos || 'ORT', 
      fieldOrder: team.length + 1
    };

    const newTeam = [...team, newFieldPlayer];
    const newSubs = substitutes.filter(p => p.id !== isSub.id);

    setTeam(newTeam as any); 
    setSubstitutes(newSubs as any);
    AsyncStorage.setItem(key, JSON.stringify(newTeam));
    AsyncStorage.setItem('@substitutes', JSON.stringify(newSubs));
    setSelectedForSwap(null);
  }

  function handleTaktikTap(player: FieldPlayer) {
    const team = taktikTeam === 'A' ? teamA : teamB;
    const setFn = taktikTeam === 'A' ? setTeamA : setTeamB;
    const saveFn = taktikTeam === 'A' ? setSavedTeamA : setSavedTeamB;
    const key = taktikTeam === 'A' ? '@teamA' : '@teamB';

    if (!selectedForSwap) { setSelectedForSwap(player); return; }
    if (selectedForSwap.id === player.id) { setSelectedForSwap(null); return; }

    const newT = team.map(p => {
      if (p.id === selectedForSwap.id) return { ...p, fieldPos: player.fieldPos, fieldOrder: player.fieldOrder };
      if (p.id === player.id) return { ...p, fieldPos: selectedForSwap.fieldPos, fieldOrder: selectedForSwap.fieldOrder };
      return p;
    });
    setFn(newT); saveFn(newT);
    AsyncStorage.setItem(key, JSON.stringify(newT));
    setSelectedForSwap(null);
  }

  function swapPlayerList(player: FieldPlayer) {
    let newA = [...teamA]; let newB = [...teamB];
    if (teamA.find(p => p.id === player.id)) {
      newA = newA.filter(p => p.id !== player.id); newB = [...newB, player];
    } else {
      newB = newB.filter(p => p.id !== player.id); newA = [...newA, player];
    }
    setTeamA(newA); setTeamB(newB); setSavedTeamA(newA); setSavedTeamB(newB);
    AsyncStorage.setItem('@teamA', JSON.stringify(newA));
    AsyncStorage.setItem('@teamB', JSON.stringify(newB));
  }

  function handleLongPress(player: FieldPlayer) {
    const inA = teamA.find(p => p.id === player.id);
    setStatModal({ visible: true, player, teamColor: inA ? 'A' : 'B' });
  }

  // ── PAYLAŞIM EKRANI: YENİ AKILLI ÜCRET MANTIĞI BURADA ──
  const shareKadro = async () => {
    const activeCount = (teamA.length + teamB.length) || 1;
    const maxCapacity = match.teamSize ? (match.teamSize * 2) : activeCount;
    const divisor = Math.min(activeCount, maxCapacity); // Zeki hesaplama: Kapasite ile sahaya dizilen kişi sayısından KÜÇÜK olanı baz al
    const perPerson = Math.ceil((match.price || 0) / Math.max(divisor, 1));

    // 2. WhatsApp Mesaj Başlığı
    let msg = `⚽ *${match.name}*\n📍 ${match.location}\n📅 ${formatDateStr(match.dateStr)} ⏰ ${match.startTime} - ${match.endTime}\n`;
    
    // Format seçilmişse mesajın en üstüne gururla ekle
    if (match.teamSize) {
      msg += `🏟️ *Format:* ${match.teamSize} vs ${match.teamSize}\n`;
    }
    
    msg += `💵 *Kasa:* ${match.price || 0} ₺ (Kişi Başı Ücret: ~${perPerson} ₺)\n\n`;
    
    msg += `🔵 *Takım A (${formationA}):*\n${teamA.map(p=>p.name).join(', ')}\n\n🟢 *Takım B (${formationB}):*\n${teamB.map(p=>p.name).join(', ')}`;
    
    if (substitutes && substitutes.length > 0) {
      msg += `\n\n🔶 *Yedekler:*\n${substitutes.map((p: PlayerInfo) => p.name).join(', ')}`;
    }

    try {
      if (kadroTab === 'field' && fieldRef.current) {
        const uri = await captureRef(fieldRef, { format: 'png', quality: 0.9 });
        if (Platform.OS === 'ios') await Share.share({ url: uri, message: msg });
        else await Sharing.shareAsync(uri, { dialogTitle: 'Kadroyu Paylaş', mimeType: 'image/png' });
      } else { await Share.share({ message: msg }); }
    } catch { Alert.alert('Hata', 'Paylaşım sırasında hata oluştu.'); }
  };

  const handleSavePlayer = async () => {
    if (!newName.trim()) return Alert.alert('Hata', 'Oyuncu adı boş olamaz.');
    const hasCustomStats = newPas !== '' || newSut !== '' || newFizik !== '' || newHiz !== '';
    const pas = parseInt(newPas)||50; const sut = parseInt(newSut)||50;
    const fizik = parseInt(newFizik)||50; const hiz = parseInt(newHiz)||50;
    const rating = Math.round((pas+sut+fizik+hiz)/4);
    
    let up: PlayerInfo[];
    if (editingId) {
      up = players.map(p => p.id === editingId ? { ...p, name: newName.trim(), pos: newPos, secPos: newSecPos, rating, stats: { pas, sut, fizik, hiz }, statsKnown: p.statsKnown || hasCustomStats } : p);
    } else {
      const np: PlayerInfo = { id: Date.now().toString(), name: newName.trim(), pos: newPos, secPos: newSecPos, rating, stats: { pas, sut, fizik, hiz }, isGuest: true, statsKnown: hasCustomStats };
      up = [...players, np];
      const nv = { ...votes, [np.id]: null };
      setVotes(nv); await AsyncStorage.setItem('@votes', JSON.stringify(nv));
    }
    setPlayers(up); await AsyncStorage.setItem('@players', JSON.stringify(up));
    cancelEdit();
  };

  const handleEditPlayer = (p: PlayerInfo) => {
    setEditingId(p.id); setNewName(p.name); setNewPos(p.pos); setNewSecPos(p.secPos || null);
    setNewPas(p.stats.pas.toString()); setNewSut(p.stats.sut.toString());
    setNewFizik(p.stats.fizik.toString()); setNewHiz(p.stats.hiz.toString());
    playersScrollRef.current?.scrollTo({ y: 0, animated: true });
  };

const handleRemovePlayer = async (id: string) => {
    Alert.alert("Oyuncuyu Sil", "Emin misiniz?", [
      { text: "İptal", style: "cancel" },
      { text: "Sil", style: "destructive", onPress: async () => {
        const up = players.filter(p => p.id !== id);
        setPlayers(up); await AsyncStorage.setItem('@players', JSON.stringify(up));
        const nv = { ...votes }; delete nv[id];
        setVotes(nv); await AsyncStorage.setItem('@votes', JSON.stringify(nv));
      }}
    ]);
  };
  const cancelEdit = () => { 
    Keyboard.dismiss(); 
    setEditingId(null); setNewName(''); setNewPas(''); setNewSut(''); setNewFizik(''); setNewHiz(''); setNewPos('ORT'); setNewSecPos(null);
    playersScrollRef.current?.scrollTo({ y: playersScrollY.current, animated: true });
  };

  const renderVoteDetailsModal = () => {
    const type = voteDetailModal.type;
    const title = type==='yes' ? 'Kesin Var' : type==='sub' ? 'Yedek' : type==='no' ? 'Yok' : 'Bekliyor';
    const fp = players.filter(p => type==='wait' ? (!votes[p.id]) : votes[p.id]===type);
    return (
      <Modal visible={voteDetailModal.visible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { paddingBottom: 24, maxHeight: '60%' }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{title} ({fp.length})</Text>
              <TouchableOpacity onPress={() => setVoteDetailModal({ ...voteDetailModal, visible: false })}><Text style={s.modalClose}>Kapat</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              {fp.length === 0
                ? <Text style={{ textAlign: 'center', color: COLORS.textMuted, marginTop: 20 }}>Bu listede kimse yok.</Text>
                : fp.map((p, i) => (
                  <View key={p.id} style={s.voteDetailItem}>
                    <Text style={s.voteDetailIndex}>{i+1}.</Text>
                    <Text style={s.voteDetailName}>{p.name}</Text>
                    <Text style={s.voteDetailPos}>{p.pos}</Text>
                  </View>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };
const renderAvatarModal = () => {
    // KENDİ GÖRSELLERİNİ BURAYA EKLEYECEKSİN
    // Şimdilik örnek test görselleri koydum, bunları Supabase'e veya internete yüklediğin resimlerin linkleriyle değiştirebilirsin.
    const PREDEFINED_AVATARS = [
      'https://api.dicebear.com/7.x/avataaars/png?seed=Messi',
      'https://jvkanwkhlzwyahbspjks.supabase.co/storage/v1/object/public/avatars/ronaldo.jpg',
      'https://api.dicebear.com/7.x/avataaars/png?seed=Neymar',
      'https://api.dicebear.com/7.x/avataaars/png?seed=Mbappe',
      'https://api.dicebear.com/7.x/avataaars/png?seed=DeBruyne',
      'https://api.dicebear.com/7.x/avataaars/png?seed=Haaland',
    ];

    return (
      <Modal visible={showAvatarModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { paddingBottom: 40 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Profil Görseli Seç</Text>
              <TouchableOpacity onPress={() => setShowAvatarModal(false)}><Text style={s.modalClose}>Kapat</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textMain, marginBottom: 12 }}>Hazır Toon Karakterler</Text>
              
              {/* EMOJİLER YERİNE RESİMLER GELDİ */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
                {PREDEFINED_AVATARS.map((imgUrl, i) => (
                  <TouchableOpacity 
                    key={i} 
                    onPress={() => { setAvatar(imgUrl); setShowAvatarModal(false); }}
                    style={{ 
                      width: 70, height: 70, borderRadius: 35, 
                      backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', 
                      borderWidth: 3, borderColor: avatar === imgUrl ? COLORS.primary : 'transparent',
                      overflow: 'hidden' // Resmin yuvarlaktan taşmamasını sağlar
                    }}
                  >
                    <Image source={{ uri: imgUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ height: 1, backgroundColor: COLORS.border, marginBottom: 24 }} />

              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.warning, marginBottom: 8 }}>👑 Premium Özellik</Text>
              <TouchableOpacity 
                onPress={handlePremiumAvatar}
                style={{ backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B', borderRadius: 16, padding: 20, alignItems: 'center', flexDirection: 'row', gap: 16 }}
              >
                <Text style={{ fontSize: 40 }}>✨</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#92400E' }}>Kendi Fotoğrafını Ekle</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#B45309', marginTop: 4 }}>Yapay Zeka (AI) seni efsanevi bir Toon futbolcuya dönüştürsün!</Text>
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  if (!isReady) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );

  if (!session && isReady) {
    return <Auth />;
  }

  // ═══════════════════════════════════════════════════════════
  // EKRANLAR
  // ═══════════════════════════════════════════════════════════

  // ── TAKTİK EKRANI ──────────────────────────────────────────
  if (screen === 'taktik') {
    const currentTeam   = taktikTeam === 'A' ? teamA : teamB;
    const currentForm   = taktikTeam === 'A' ? formationA : formationB;
    const teamColor     = taktikTeam === 'A' ? '#3B82F6' : '#34D399';
    const score = currentTeam.reduce((s, p) => s + p.rating, 0);

    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => { setScreen('kadro'); setSelectedForSwap(null); }} style={s.backBtn}>
            <Text style={s.backText}>← Geri</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Taktik Düzeni</Text>
          {selectedForSwap && (
            <TouchableOpacity onPress={() => setSelectedForSwap(null)} style={{ paddingLeft: 10 }}>
              <Text style={{ color: COLORS.danger, fontSize: 13, fontWeight: '700' }}>İptal</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.tabContainer}>
          <TouchableOpacity style={[s.tab, taktikTeam === 'A' && s.tabActive]} onPress={() => { setTaktikTeam('A'); setSelectedForSwap(null); }}>
            <Text style={[s.tabText, taktikTeam === 'A' && s.tabTextActive]}>Takım A</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tab, taktikTeam === 'B' && s.tabActive]} onPress={() => { setTaktikTeam('B'); setSelectedForSwap(null); }}>
            <Text style={[s.tabText, taktikTeam === 'B' && s.tabTextActive]}>Takım B</Text>
          </TouchableOpacity>
        </View>

        {selectedForSwap && (
          <View style={s.swapBanner}>
            <Text style={s.swapBannerText}>↔  <Text style={{ fontWeight: '800' }}>{selectedForSwap.name}</Text> seçildi — yer değiştirmek için başka oyuncuya dokun</Text>
          </View>
        )}

        <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 40, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 16, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: teamColor }} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textMain }}>Takım {taktikTeam}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={[s.formBadge, { backgroundColor: teamColor + '22', borderColor: teamColor }]}>
                <Text style={[s.formBadgeText, { color: teamColor }]}>{currentForm}</Text>
              </View>
              <View style={[s.formBadge, { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary }]}>
                <Text style={[s.formBadgeText, { color: COLORS.primary }]}>⚡ {score}</Text>
              </View>
            </View>
          </View>

          <HalfField
            team={currentTeam}
            isTop={true}
            selectedId={selectedForSwap?.id ?? null}
            onTap={handleTaktikTap}
            onLongPress={handleLongPress}
            votes={votes}
          />

          <Text style={[s.instructionText, { marginTop: 10 }]}>
            İki oyuncuya sırayla dokun → yer değiştir  •  Uzun bas → istatistik
          </Text>

          <View style={s.formCard}>
            <Text style={s.formCardTitle}>Diziliş Değiştir</Text>
            <Text style={s.formCardSub}>Oyuncular istatistiklerine göre en uygun mevkiye otomatik kaydırılır.</Text>
            <View style={s.formGrid}>
              {FORMATIONS.map(f => (
                <TouchableOpacity key={f}
                  style={[s.formBtn, currentForm === f && { backgroundColor: teamColor, borderColor: teamColor }]}
                  onPress={() => changeFormation(taktikTeam, f)}>
                  <Text style={[s.formBtnNum, currentForm === f && { color: '#FFF' }]}>{f}</Text>
                  <Text style={[s.formBtnSub, currentForm === f && { color: 'rgba(255,255,255,0.8)' }]}>
                    {f === '3-2-1' ? '3 DEF 2 ORT 1 FOR' : f === '2-3-1' ? '2 DEF 3 ORT 1 FOR' : f === '3-1-2' ? '3 DEF 1 ORT 2 FOR' : '2 DEF 2 ORT 2 FOR'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ width: '100%', marginTop: 8 }}>
            <Text style={[s.sectionTitle, { marginBottom: 8 }]}>İstatistiğe Göre Yeni Mevkiler</Text>
            {currentTeam
              .slice().sort((a, b) => {
                const order: Record<Position, number> = { KL: 0, DEF: 1, ORT: 2, FOR: 3 };
                return order[a.fieldPos] - order[b.fieldPos];
              })
              .map((p, i) => (
                <View key={p.id} style={s.taktikPlayerRow}>
                  <View style={[s.taktikPosBadge, {
                    backgroundColor: p.fieldPos === 'KL' ? '#FEF3C7' : p.fieldPos === 'DEF' ? '#DBEAFE' : p.fieldPos === 'ORT' ? '#D1FAE5' : '#FEE2E2'
                  }]}>
                    <Text style={[s.taktikPosBadgeText, {
                      color: p.fieldPos === 'KL' ? '#92400E' : p.fieldPos === 'DEF' ? '#1E40AF' : p.fieldPos === 'ORT' ? '#065F46' : '#991B1B'
                    }]}>{p.fieldPos}</Text>
                  </View>
                  <Text style={[s.playerName, { flex: 1, marginLeft: 10 }]}>{p.name}</Text>
                  <Text style={[s.playerMetaMuted, { marginLeft: 8 }]}>Ort: {p.rating}</Text>
                </View>
              ))}
          </View>

        </ScrollView>

        <PlayerStatModal
          visible={statModal.visible} player={statModal.player} teamColor={statModal.teamColor}
          onClose={() => setStatModal({ visible: false, player: null, teamColor: null })}
        />
      </SafeAreaView>
    );
  }

 // ── OYUNCU HAVUZU (BU HAFTANIN KADROSU) ─────────────────────────
  if (screen === 'players') {
    // 1. Önce sahaya bakılır, saha boşsa oylamaya bakılır
    const activeFieldCount = teamA.length + teamB.length;
    const asilVoteCount = players.filter(p => votes[p.id] === 'yes').length;
    const activeCount = activeFieldCount > 0 ? activeFieldCount : (asilVoteCount || 1);
    
    // 2. Maksimum kapasite aşılmasın diye kontrol edilir
    const maxCapacity = match.teamSize ? (match.teamSize * 2) : activeCount;
    const divisor = Math.min(activeCount, maxCapacity); 
    const perPerson = Math.ceil((match.price || 0) / Math.max(divisor, 1));
    
    const totalCollected = players.filter(p => p.hasPaid).length * perPerson;

    const togglePayment = async (id: string) => {
      const up = players.map(p => p.id === id ? { ...p, hasPaid: !p.hasPaid } : p);
      setPlayers(up);
      await AsyncStorage.setItem('@players', JSON.stringify(up));
    };

    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('home')} style={s.backBtn}><Text style={s.backText}>← Geri</Text></TouchableOpacity>
          <Text style={s.headerTitle}>Haftanın Havuzu</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView 
          ref={playersScrollRef}
          onScroll={(e) => {
            if (!editingId) playersScrollY.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          style={s.body} 
          contentContainerStyle={{ paddingBottom: 40 }} 
          keyboardShouldPersistTaps="handled"
        >
          
          <View style={[s.card, { marginTop: 16 }]}>
            <Text style={s.sectionTitle}>{editingId ? 'Oyuncuyu Düzenle' : 'Havuza Yeni/Misafir Ekle'}</Text>
            <View style={s.inputContainer}>
              <TextInput style={s.inputFlex} placeholder="Oyuncu Adı (Örn: Ahmet - Misafir)" placeholderTextColor="#A1A1AA" value={newName} onChangeText={setNewName} />
              {newName.length > 0 && <TouchableOpacity onPress={() => setNewName('')} style={s.clearBtn}><Text style={s.clearBtnText}>✕</Text></TouchableOpacity>}
            </View>
            
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {[{l:'Pas',v:newPas,s:setNewPas},{l:'Şut',v:newSut,s:setNewSut},{l:'Fizik',v:newFizik,s:setNewFizik},{l:'Hız',v:newHiz,s:setNewHiz}].map(item => (
                <View key={item.l} style={{ flex: 1 }}>
                  <Text style={s.inputLabelCenter}>{item.l}</Text>
                  <TextInput style={s.inputCenter} placeholder="?" placeholderTextColor="#A1A1AA" value={item.v} onChangeText={item.s} keyboardType="numeric" maxLength={3} />
                </View>
              ))}
            </View>
            <Text style={s.inputLabel}>Ana Mevki</Text>
            <View style={s.posSelector}>
              {(['KL','DEF','ORT','FOR'] as Position[]).map(pos => (
                <TouchableOpacity key={`main-${pos}`} style={[s.posBtn, newPos===pos && s.posBtnActive]} onPress={() => setNewPos(pos)}>
                  <Text style={[s.posBtnText, newPos===pos && s.posBtnTextActive]}>{pos}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.inputLabel}>Yan Mevki (Opsiyonel)</Text>
            <View style={[s.posSelector, { marginBottom: 24 }]}>
              <TouchableOpacity 
                style={[s.posBtn, newSecPos === null && s.posBtnActive]} 
                onPress={() => setNewSecPos(null)}
              >
                <Text style={[s.posBtnText, newSecPos === null && s.posBtnTextActive]}>Yok</Text>
              </TouchableOpacity>
              {(['KL','DEF','ORT','FOR'] as Position[]).map(pos => (
                <TouchableOpacity key={`sec-${pos}`} style={[s.posBtn, newSecPos===pos && s.posBtnActive]} onPress={() => setNewSecPos(pos)}>
                  <Text style={[s.posBtnText, newSecPos===pos && s.posBtnTextActive]}>{pos}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={[s.btnPrimary, { flex: 1 }]} onPress={handleSavePlayer}>
                <Text style={s.btnPrimaryText}>{editingId ? 'Güncelle' : 'Havuza Ekle'}</Text>
              </TouchableOpacity>
              {editingId && <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={cancelEdit}><Text style={s.btnSecondaryText}>Vazgeç</Text></TouchableOpacity>}
            </View>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 12, marginLeft: 4 }}>
            <Text style={s.sectionTitle}>Mevcut Havuz ({players.length})</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.textMain }}>Kişi Başı: {perPerson} ₺</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.success, marginTop: 4 }}>
                💵 Kasa: {totalCollected} / {match.price || 0} ₺
              </Text>
            </View>
          </View>

          {players.map(p => {
            const showStats = p.statsKnown || !p.isGuest;
            return (
              <View key={p.id} style={[s.playerCard, p.isGuest && { borderColor: COLORS.warning, borderWidth: 1 }]}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{p.name[0]}</Text>
                </View>
                
                <View style={{ flex: 1, paddingLeft: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={s.playerName}>{p.name}</Text>
                      {p.isGuest && <Text style={{ fontSize: 10, backgroundColor: COLORS.warningLight, color: '#92400E', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, fontWeight: '700' }}>MİSAFİR</Text>}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <TouchableOpacity onPress={() => handleEditPlayer(p)}><Text style={s.actionTextEdit}>Düzenle</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => handleRemovePlayer(p.id)}><Text style={s.actionTextDelete}>Sil</Text></TouchableOpacity>
                    </View>
                  </View>

                  <View style={s.statsRowLine}>
                    <Text style={s.statItemBold}>{p.pos}</Text><Text style={s.statDivider}>•</Text>
                    <Text style={s.statItemBold}>Ort: {showStats ? p.rating : '?'}</Text><Text style={s.statDivider}>|</Text>
                    <Text style={s.statItemMuted}>
                      P:{showStats ? p.stats.pas : '?'} Ş:{showStats ? p.stats.sut : '?'} F:{showStats ? p.stats.fizik : '?'} H:{showStats ? p.stats.hiz : '?'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: COLORS.bg }}>
                    <TouchableOpacity 
                      onPress={() => togglePayment(p.id)}
                      style={{ flex: 1, backgroundColor: p.hasPaid ? COLORS.successLight : COLORS.bg, paddingVertical: 6, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: p.hasPaid ? COLORS.success : COLORS.border }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: p.hasPaid ? COLORS.fieldDark : COLORS.textMuted }}>
                        {p.hasPaid ? '✅ Ödedi' : '💵 Ödeme Bekliyor'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      onPress={() => {
                        if(p.isGuest) Alert.alert('Davet Gönderildi', `${p.name} isimli misafir oyuncuya takım daveti gönderildi!`);
                        else Alert.alert('Bilgi', 'Bu oyuncu zaten takım kadronuzda yer alıyor.');
                      }}
                      style={{ flex: 1, backgroundColor: p.isGuest ? COLORS.primaryLight : COLORS.bg, paddingVertical: 6, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: p.isGuest ? COLORS.primary : COLORS.border }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: p.isGuest ? COLORS.primary : COLORS.textMuted }}>
                        {p.isGuest ? '✉️ Takıma Davet Et' : '👥 Takım Oyuncusu'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                </View>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    );
  }

 // ── MAÇ BİLGİLERİ ─────────────────────────────────────────
  if (screen === 'create') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('home')} style={s.backBtn}><Text style={s.backText}>← Geri</Text></TouchableOpacity>
          <Text style={s.headerTitle}>Maç Bilgileri</Text>
        </View>

        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView 
            style={s.body} 
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 60 }}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={[s.card, { marginTop: 16 }]}>
                <Text style={s.inputLabel}>Tarih</Text>
                <TouchableOpacity style={s.selectBox} onPress={() => setShowCal(true)}><Text style={s.selectBoxText}>{formatDateStr(editMatch.dateStr)}</Text><Text>📅</Text></TouchableOpacity>
                
                <Text style={s.inputLabel}>Başlangıç Saati</Text>
                <TouchableOpacity style={s.selectBox} onPress={() => setShowStartPicker(true)}><Text style={s.selectBoxText}>{editMatch.startTime}</Text><Text>🕐</Text></TouchableOpacity>
                
                <Text style={s.inputLabel}>Bitiş Saati</Text>
                <TouchableOpacity style={s.selectBox} onPress={() => setShowEndPicker(true)}><Text style={s.selectBoxText}>{editMatch.endTime}</Text><Text>🕐</Text></TouchableOpacity>
                
                <Text style={s.inputLabel}>Konum (Halısaha Adı)</Text>
                <TextInput 
                  style={s.input} 
                  value={editMatch.location} 
                  onChangeText={t => setEditMatch(p => ({ ...p, location: t }))} 
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <Text style={s.inputLabel}>Saha Kiralama Ücreti (₺)</Text>
                <TextInput 
                  style={[s.input, { marginBottom: 20 }]} 
                  value={editMatch.price ? editMatch.price.toString() : ''} 
                  onChangeText={t => setEditMatch(p => ({ ...p, price: parseInt(t) || 0 }))} 
                  keyboardType="numeric" 
                  placeholder="Örn: 1400"
                  placeholderTextColor={COLORS.textMuted}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                {/* YENİ FORMAT BUTONLARI BURADA DOĞRU ŞEKİLDE ÇALIŞIYOR */}
                <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 12, marginBottom: 6, fontWeight: '600' }}>Maç Formatı (Kaça Kaç)</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                  {[6, 7, 8].map(size => (
                    <TouchableOpacity
                      key={size}
                      onPress={() => setEditMatch({ ...editMatch, teamSize: size })} 
                      style={{ 
                        flex: 1, paddingVertical: 10, alignItems: 'center', 
                        backgroundColor: editMatch.teamSize === size ? '#3B82F6' : '#F3F4F6', 
                        borderRadius: 8, borderWidth: 1, 
                        borderColor: editMatch.teamSize === size ? '#2563EB' : '#E5E7EB' 
                      }}
                    >
                      <Text style={{ fontWeight: '700', color: editMatch.teamSize === size ? '#FFF' : '#374151' }}>
                        {size} vs {size}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity style={s.btnPrimary} onPress={() => { Keyboard.dismiss(); saveMatchData(editMatch); }}>
                  <Text style={s.btnPrimaryText}>Değişiklikleri Kaydet</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </ScrollView>
        </KeyboardAvoidingView>

        <CalendarModal visible={showCal} selected={editMatch.dateStr} onSelect={d => setEditMatch(p => ({ ...p, dateStr: d }))} onClose={() => setShowCal(false)} />
        <TimePickerModal visible={showStartPicker} selected={editMatch.startTime} onSelect={t => setEditMatch(p => ({ ...p, startTime: t }))} onClose={() => setShowStartPicker(false)} />
        <TimePickerModal visible={showEndPicker} selected={editMatch.endTime} onSelect={t => setEditMatch(p => ({ ...p, endTime: t }))} onClose={() => setShowEndPicker(false)} />
      </SafeAreaView>
    );
  }

// ── ANA EKRAN ──────────────────────────────────────────────
  if (screen === 'home') {
    const hasKadro = savedTeamA.length > 0 || savedTeamB.length > 0;
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.headerHome}>
          <View>
            <Text style={s.headerTitleHome}>Saha Yönetimi</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2, marginLeft: 2, fontWeight: '600' }}>
              Hoş geldin, Kaptan
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
          
          {hasTeam === false && !profileCompleted && (
            <View style={{ backgroundColor: COLORS.warningLight, padding: 16, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#FDE68A', flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 24, marginRight: 12 }}>👋</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400E', marginBottom: 4 }}>Henüz bir ekibin yok!</Text>
                <Text style={{ fontSize: 12, color: '#B45309', marginBottom: 8 }}>Bir ekibe katıl, kendi ekibini kur veya "Serbest Oyuncu" olarak maçlara dahil ol.</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity 
                    style={{ backgroundColor: '#D97706', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                    onPress={() => setScreen('profile_setup')}
                  >
                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>Profilini Tamamla</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          <View style={s.heroCard}>
            <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16 }} onPress={() => setShowMatchDetail(true)} activeOpacity={0.8}>
              <View style={s.heroIconBox}><Text style={{ fontSize: 24 }}>⚽</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.heroTitle}>{match.name}</Text>
                <Text style={s.heroSub}>📍 {match.location}</Text>
                <Text style={s.heroSub}>📅 {formatDateStr(match.dateStr)} · {match.startTime}-{match.endTime}</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={{ backgroundColor: COLORS.bg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, marginLeft: 8 }}
              onPress={() => { setEditMatch(match); setScreen('create'); }}
            >
              <Text style={{ fontSize: 16 }}>✏️</Text>
            </TouchableOpacity>
          </View>

          <View style={s.statsGrid}>
            {[
              { count: counts.yes,  label: 'Kesin Var', color: COLORS.success,   type: 'yes' as const },
              { count: counts.sub, label: 'Yedek',     color: COLORS.warning,   type: 'sub' as const },
              { count: counts.no,   label: 'Yok',      color: COLORS.danger,    type: 'no' as const },
              { count: counts.wait,  label: 'Bekliyor',  color: COLORS.textMuted, type: 'wait' as const },
            ].map(item => (
              <TouchableOpacity key={item.type} style={[s.statBlock, { borderLeftColor: item.color, borderLeftWidth: 4 }]}
                onPress={() => setVoteDetailModal({ visible: true, type: item.type })}>
                <Text style={[s.statNum, { color: item.color }]}>{item.count}</Text>
                <Text style={s.statLbl}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={s.menuBtn} onPress={() => setScreen('votes')}>
            <View style={s.menuIconBox}><Text>✋</Text></View>
            <Text style={s.menuBtnText}>Yoklama Al & Düzenle</Text>
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
            <TouchableOpacity style={[s.menuBtn, kadroStale && { borderWidth: 1.5, borderColor: COLORS.warning }]}
              onPress={() => { setTeamA(savedTeamA); setTeamB(savedTeamB); setSubstitutes(savedSubstitutes); setSelectedForSwap(null); setScreen('kadro'); }}>
              <View style={[s.menuIconBox, { backgroundColor: kadroStale ? COLORS.warningLight : COLORS.successLight }]}><Text>🏟️</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuBtnText}>Kadroyu Gör</Text>
                {kadroStale && <Text style={{ fontSize: 11, color: COLORS.warning, fontWeight: '600', marginTop: 2 }}>⚠ Yoklama değişti, kadro güncel olmayabilir</Text>}
              </View>
              <Text style={s.menuArrow}>→</Text>
            </TouchableOpacity>
          )}

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 40 }}>
            <TouchableOpacity style={[s.btnPrimary, { flex: 1 }]} onPress={handleBuildBalanced}><Text style={s.btnPrimaryText}>Dengeli Kur</Text></TouchableOpacity>
            <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={handleBuildRandom}><Text style={s.btnSecondaryText}>Rastgele Kur</Text></TouchableOpacity>
          </View>
        </ScrollView>
        {renderVoteDetailsModal()}
        <MatchDetailModal 
          visible={showMatchDetail} 
          match={match} 
          onClose={() => setShowMatchDetail(false)} 
          poolSize={(teamA.length + teamB.length) > 0 ? (teamA.length + teamB.length) : (players.filter(p => votes[p.id] === 'yes').length || 1)} 
        />
      </SafeAreaView>
    );
  }

// ── AYARLAR VE PROFİL EKRANI ──────────────────────────────────────────────
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
            {/* AVATAR SEÇİMİ */}
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

            <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 12, color: COLORS.textMain }}>Oyuncu Adı / Lakabın 💎</Text>
            <TextInput
              style={{ backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, fontSize: 16, color: COLORS.textMain }}
              value={nickname} onChangeText={setNickname}
            />

            {/* ANA MEVKİ VE AYAK TERCİHİ YAN YANA */}
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 24 }}>
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

            {/* SERBEST OYUNCU MODU AÇ/KAPA */}
            <TouchableOpacity onPress={() => setIsAvailable(!isAvailable)} style={{ marginTop: 32, padding: 16, backgroundColor: isAvailable ? COLORS.successLight : COLORS.bg, borderRadius: 12, borderWidth: 1, borderColor: isAvailable ? '#A7F3D0' : COLORS.border }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: isAvailable ? COLORS.fieldDark : COLORS.textMuted }}>
                {isAvailable ? '✅ Serbest Oyuncu Modu (Açık)' : '❌ Serbest Oyuncu Modu (Kapalı)'}
              </Text>
              <Text style={{ fontSize: 12, color: isAvailable ? COLORS.fieldDark : COLORS.textMuted, marginTop: 4 }}>
                {isAvailable ? 'Eksik kadrosu olan takımlar beni görebilir ve maça çağırabilir.' : 'Sadece kendi ekibimin maçlarına katılırım.'}
              </Text>
            </TouchableOpacity>

            {/* ZORUNLU SERBEST OYUNCU BİLGİLERİ */}
            {isAvailable && (
              <View style={{ marginTop: 16, padding: 16, backgroundColor: '#EFF6FF', borderRadius: 16, borderWidth: 1, borderColor: '#BFDBFE' }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E40AF', marginBottom: 16 }}>📋 Serbest Oyuncu Kriterleri (Zorunlu)</Text>
                
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textMain, marginBottom: 8 }}>Favori Maç Saatlerin</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                  {['Hafta İçi Akşam', 'Hafta Sonu Gündüz', 'Hafta Sonu Akşam', 'Gece (23:00+)'].map(time => (
                    <TouchableOpacity key={time} onPress={() => toggleFavTime(time)}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: favTimes.includes(time) ? COLORS.primary : COLORS.border, backgroundColor: favTimes.includes(time) ? COLORS.primary : COLORS.card }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: favTimes.includes(time) ? '#FFF' : COLORS.textMuted }}>{time}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textMain, marginBottom: 8 }}>Ulaşım Durumun</Text>
                <View style={{ gap: 8, marginBottom: 20 }}>
                  {['🚗 Arabam var (Yolcu alabilirim)', '🚶‍♂️ Kendi imkanımla gelirim', '🚌 Ulaşıma ihtiyacım var'].map(opt => (
                    <TouchableOpacity key={opt} onPress={() => setTransport(opt)}
                      style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: transport === opt ? '#10B981' : COLORS.border, backgroundColor: transport === opt ? '#D1FAE5' : COLORS.card }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: transport === opt ? '#065F46' : COLORS.textMuted }}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textMain, marginBottom: 8 }}>Gidebileceğin Maksimum Mesafe</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['Yakın\n(0-5 km)', 'Orta\n(5-15 km)', 'Tüm\nŞehir'].map(dist => (
                    <TouchableOpacity key={dist} onPress={() => setMaxDistance(dist)}
                      style={{ 
                        flex: 1, 
                        paddingVertical: 12, 
                        borderRadius: 10, 
                        borderWidth: 1, 
                        borderColor: maxDistance === dist ? '#F59E0B' : COLORS.border, 
                        backgroundColor: maxDistance === dist ? '#FEF3C7' : COLORS.card, 
                        alignItems: 'center', 
                        justifyContent: 'center' 
                      }}>
                      <Text style={{ 
                        fontSize: 12, 
                        fontWeight: '700', 
                        color: maxDistance === dist ? '#92400E' : COLORS.textMuted, 
                        textAlign: 'center' 
                      }}>
                        {dist}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity 
              style={[s.btnPrimary, { marginTop: 24 }]} 
              onPress={async () => {
                if (!nickname || !position) { Alert.alert('Eksik Bilgi', 'Lakap ve ana mevki boş bırakılamaz.'); return; }
                if (isAvailable && (favTimes.length === 0 || !transport || !maxDistance)) {
                  Alert.alert('Eksik Bilgi', 'Serbest oyuncu olarak listelenmek için Zaman, Ulaşım ve Mesafe tercihlerini seçmelisin.');
                  return;
                }
                try {
                  const { error } = await supabase.from('profiles').upsert({
                    id: session?.user?.id, display_name: nickname, main_position: position,
                    is_available_for_hiring: isAvailable, avatar_url: avatar, preferred_foot: foot,
                    fav_times: favTimes, transport_status: transport, max_distance: maxDistance
                  });
                  if (error) throw error;
                  Alert.alert('Süper!', 'Profilin başarıyla güncellendi.');
                } catch (err: any) { Alert.alert('Hata Oluştu', err.message); }
              }}
            >
              <Text style={s.btnPrimaryText}>Değişiklikleri Kaydet</Text>
            </TouchableOpacity>

            <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 32 }} />
            
            {/* HESAPTAN ÇIKIŞ YAP BUTONU BURADA KALIYOR (Kodun devamı) */}

            <TouchableOpacity 
              style={[s.btnSecondary, { borderColor: COLORS.danger }]} 
              onPress={async () => {
                await supabase.auth.signOut();
              }}
            >
              <Text style={[s.btnSecondaryText, { color: COLORS.danger }]}>🚪 Hesaptan Çıkış Yap</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        {/* AVATAR PENCERESİ BURADA ÇAĞRILIYOR */}
        {renderAvatarModal()}
        
      </SafeAreaView>
    );
  }

  // ── PROFİL TAMAMLAMA EKRANI ──────────────────────────────────────────────
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
              style={{ backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, fontSize: 16, color: COLORS.textMain }}
              placeholder="Örn: Maestro, Kante..."
              placeholderTextColor={COLORS.textMuted}
              value={nickname}
              onChangeText={setNickname}
            />

            <Text style={{ fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 12, color: COLORS.textMain }}>Ana Mevkin</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['KL', 'DEF', 'ORT', 'FOR'].map(pos => (
                <TouchableOpacity 
                  key={pos} 
                  onPress={() => setPosition(pos)}
                  style={{ flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: position === pos ? COLORS.primary : COLORS.border, alignItems: 'center', backgroundColor: position === pos ? COLORS.primaryLight : COLORS.bg }}
                >
                  <Text style={{ fontWeight: '600', color: position === pos ? COLORS.primary : COLORS.textMuted }}>{pos}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity 
              onPress={() => setIsAvailable(!isAvailable)}
              style={{ marginTop: 24, padding: 16, backgroundColor: isAvailable ? COLORS.successLight : COLORS.bg, borderRadius: 12, borderWidth: 1, borderColor: isAvailable ? '#A7F3D0' : COLORS.border }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: isAvailable ? COLORS.fieldDark : COLORS.textMuted }}>
                {isAvailable ? '✅ Serbest Oyuncu Modu (Açık)' : '❌ Serbest Oyuncu Modu (Kapalı)'}
              </Text>
              <Text style={{ fontSize: 13, color: isAvailable ? COLORS.fieldDark : COLORS.textMuted, marginTop: 4 }}>
                {isAvailable ? 'Eksik kadrosu olan takımlar beni maçlara çağırabilir.' : 'Sadece kendi ekibimin maçlarına katılırım, dışarıdan teklif alamam.'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[s.btnPrimary, { marginTop: 32 }]} 
              onPress={async () => {
                if (!nickname || !position) {
                  Alert.alert('Eksik Bilgi', 'Lütfen lakabınızı yazın ve bir mevki seçin.');
                  return;
                }
                try {
                  const { error } = await supabase.from('profiles').upsert({
                    id: session?.user?.id,
                    display_name: nickname,
                    main_position: position,
                    is_available_for_hiring: isAvailable
                  });
                  
                  if (error) throw error;
                  
                  setProfileCompleted(true);
                  setScreen('home');
                  Alert.alert('Başarılı', 'Profilin harika görünüyor!');
                } catch (err: any) {
                  Alert.alert('Hata Oluştu', err.message);
                }
              }}
            >
              <Text style={s.btnPrimaryText}>Profili Kaydet</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── YOKLAMA ────────────────────────────────────────────────
  if (screen === 'votes') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('home')} style={s.backBtn}><Text style={s.backText}>← Geri</Text></TouchableOpacity>
          <Text style={s.headerTitle}>Yoklama</Text>
          <TouchableOpacity onPress={handleResetVotes} style={{ paddingLeft: 10 }}><Text style={{ color: COLORS.danger, fontSize: 14, fontWeight: '700' }}>Sıfırla</Text></TouchableOpacity>
        </View>
        <View style={s.filterBar}>
          {[{c:COLORS.success,n:counts.yes,l:'Var'},{c:COLORS.warning,n:counts.sub,l:'Yedek'},{c:COLORS.danger,n:counts.no,l:'Yok'},{c:COLORS.border,n:counts.wait,l:'Bekliyor'}].map(i => (
            <View key={i.l} style={s.filterBadge}><View style={[s.dot, { backgroundColor: i.c }]} /><Text style={s.filterText}>{i.n} {i.l}</Text></View>
          ))}
        </View>
        <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 100 }}>
          {players.map(p => (
            <View key={p.id} style={s.voteCard}>
              <View style={[s.avatar, votes[p.id]==='yes' ? { backgroundColor: COLORS.successLight } : votes[p.id]==='sub' ? { backgroundColor: COLORS.warningLight } : votes[p.id]==='no' ? { backgroundColor: COLORS.dangerLight } : {}]}>
                <Text style={s.avatarText}>{p.name[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.playerName}>{p.name}</Text>
                <Text style={s.playerMetaMuted}>{p.pos} • Ort: {p.rating}</Text>
              </View>
              <View style={s.voteBtnGroup}>
                <TouchableOpacity style={[s.voteBtn, votes[p.id]==='yes' && s.voteBtnYes]} onPress={() => saveVote(p.id,'yes')}><Text style={[s.voteBtnText, votes[p.id]==='yes' && s.voteTextActive]}>Var</Text></TouchableOpacity>
                <TouchableOpacity style={[s.voteBtn, votes[p.id]==='sub' && s.voteBtnSub]} onPress={() => saveVote(p.id,'sub')}><Text style={[s.voteBtnText, votes[p.id]==='sub' && s.voteTextActive]}>Yedek</Text></TouchableOpacity>
                <TouchableOpacity style={[s.voteBtn, votes[p.id]==='no' && s.voteBtnNo]} onPress={() => saveVote(p.id,'no')}><Text style={[s.voteBtnText, votes[p.id]==='no' && s.voteTextActive]}>Yok</Text></TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={s.bottomFloatingBar}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity style={[s.btnPrimary, { flex: 1 }]} onPress={handleBuildBalanced}><Text style={s.btnPrimaryText}>Dengeli Kur</Text></TouchableOpacity>
            <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={handleBuildRandom}><Text style={s.btnSecondaryText}>Rastgele Kur</Text></TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── KADROLAR ───────────────────────────────────────────────
  if (screen === 'kadro') {
    const scoreA = teamA.reduce((s, p) => s + p.rating, 0);
    const scoreB = teamB.reduce((s, p) => s + p.rating, 0);

    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => { setScreen('home'); setSelectedForSwap(null); }} style={s.backBtn}><Text style={s.backText}>← Geri</Text></TouchableOpacity>
          <Text style={s.headerTitle}>Kadrolar</Text>
          {selectedForSwap
            ? <TouchableOpacity onPress={() => setSelectedForSwap(null)} style={{ paddingLeft: 10 }}><Text style={{ color: COLORS.danger, fontSize: 13, fontWeight: '700' }}>İptal</Text></TouchableOpacity>
            : <View style={{ width: 40 }} />
          }
        </View>

        {kadroStale && (
          <View style={s.staleWarningBar}>
            <Text style={s.staleWarningText}>⚠ Yoklama değişti — bu kadro güncel olmayabilir. Yeniden kur.</Text>
          </View>
        )}

        <View style={s.tabContainer}>
          <TouchableOpacity style={[s.tab, kadroTab==='field' && s.tabActive]} onPress={() => setKadroTab('field')}><Text style={[s.tabText, kadroTab==='field' && s.tabTextActive]}>Saha Görünümü</Text></TouchableOpacity>
          <TouchableOpacity style={[s.tab, kadroTab==='list' && s.tabActive]} onPress={() => setKadroTab('list')}><Text style={[s.tabText, kadroTab==='list' && s.tabTextActive]}>Liste Görünümü</Text></TouchableOpacity>
        </View>

        <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 40, alignItems: 'center' }}>

          {kadroTab === 'field' ? (
            <>
              <View style={{ marginTop: 10, width: '100%' }}>
                <View style={{ alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textMain }}>⚽ {match.name}</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>📍 {match.location}  ·  📅 {formatDateStr(match.dateStr)}  ·  {match.startTime}</Text>
                </View>
                <FullField
                  teamA={teamA} teamB={teamB} substitutes={substitutes}
                  selectedId={selectedForSwap?.id ?? null}
                  onTap={handlePlayerTap} onLongPress={handleLongPress}
                  onSubTap={handleSubTap} onMoveToBench={handleMoveToBench}
                  onMoveToField={handleMoveToField}
                  votes={votes} fieldRef={fieldRef}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 12, gap: 8 }}>
                  <View style={[s.teamInfoPill, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B82F6', marginRight: 6 }} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E40AF' }}>A · {formationA} · {scoreA}⚡</Text>
                  </View>
                  <View style={[s.teamInfoPill, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#34D399', marginRight: 6 }} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#065F46' }}>B · {formationB} · {scoreB}⚡</Text>
                  </View>
                </View>
              </View>
              <Text style={s.instructionText}>İki oyuncuya sırayla dokun → yer değiştir</Text>
            </>
          ) : (
            <View style={{ width: '100%', marginTop: 10 }}>
              {/* TAKIM A VE TAKIM B LİSTESİ */}
              {[{ team: teamA, label: 'A', color: '#3B82F6', score: scoreA, form: formationA }, { team: teamB, label: 'B', color: '#34D399', score: scoreB, form: formationB }].map(({ team, label, color, score, form }) => (
                <View key={label} style={{ marginBottom: 24 }}>
                  <View style={s.listTeamHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={s.listTeamTitle}>Takım {label}</Text>
                      <View style={[s.formBadge, { backgroundColor: color + '22', borderColor: color }]}>
                        <Text style={[s.formBadgeText, { color }]}>{form}</Text>
                      </View>
                    </View>
                    <Text style={s.listTeamScore}>{score}</Text>
                  </View>
                  <View style={s.listCard}>
                    {team.map((p, i) => {
                      const isSel = selectedForSwap?.id === p.id;
                      return (
                        <View key={p.id} style={{ marginBottom: isSel ? 8 : 0 }}>
                          <TouchableOpacity 
                            onPress={() => setSelectedForSwap(isSel ? null : p)}
                            style={[s.listRow, isSel && { backgroundColor: '#FEF3C7', borderColor: '#D97706', borderWidth: 1, borderBottomWidth: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 }]}
                          >
                            <Text style={s.listIndex}>{i + 1}</Text>
                            <View style={[s.playerDotA, { borderColor: color, backgroundColor: color + '11' }]}>
                              <Text style={[s.playerDotText, { color }]}>{p.name[0]}</Text>
                            </View>
                            <View style={{ flex: 1, paddingLeft: 8 }}>
                              <Text style={s.playerName}>{p.name}</Text>
                              <Text style={s.playerMetaMuted}>{p.pos} • Ort: {p.rating}</Text>
                            </View>
                          </TouchableOpacity>
                          
                          {/* SAHADAKİ OYUNCU İÇİN İÇE AÇILAN BUTON */}
                          {isSel && (
                            <View style={{ padding: 10, backgroundColor: '#FEF3C7', borderColor: '#D97706', borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }}>
                              <TouchableOpacity onPress={handleMoveToBench} style={{ backgroundColor: '#EF4444', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}>
                                <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13 }}>⬇ Yedeğe Çek</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}

              {/* LİSTE GÖRÜNÜMÜ İÇİN YEDEKLER */}
              {substitutes && substitutes.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <View style={s.listTeamHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={s.listTeamTitle}>🪑 Yedek Kulübesi</Text>
                      <View style={[s.formBadge, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                        <Text style={[s.formBadgeText, { color: '#D97706' }]}>{substitutes.length} Kişi</Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.listCard}>
                    {substitutes.map((p, i) => {
                      const isSel = selectedForSwap?.id === p.id;
                      return (
                        <View key={p.id} style={{ marginBottom: isSel ? 8 : 0 }}>
                          <TouchableOpacity 
                            onPress={() => setSelectedForSwap(isSel ? null : p)}
                            style={[s.listRow, isSel && { backgroundColor: '#FEF3C7', borderColor: '#D97706', borderWidth: 1, borderBottomWidth: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 }]}
                          >
                            <Text style={s.listIndex}>{i + 1}</Text>
                            <View style={[s.playerDotA, { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' }]}>
                              <Text style={s.playerDotText}>{p.name[0]}</Text>
                            </View>
                            <View style={{ flex: 1, paddingLeft: 8 }}>
                              <Text style={s.playerName}>{p.name}</Text>
                              <Text style={s.playerMetaMuted}>{p.pos} • Ort: {p.rating}</Text>
                            </View>
                          </TouchableOpacity>

                          {/* YEDEK OYUNCU İÇİN İÇE AÇILAN BUTONLAR */}
                          {isSel && (
                            <View style={{ flexDirection: 'row', gap: 8, padding: 10, backgroundColor: '#FEF3C7', borderColor: '#D97706', borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }}>
                              <TouchableOpacity onPress={() => handleMoveToField('A')} style={{ flex: 1, backgroundColor: '#3B82F6', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}>
                                <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13 }}>⬆ A Takımına Al</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => handleMoveToField('B')} style={{ flex: 1, backgroundColor: '#10B981', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}>
                                <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13 }}>⬆ B Takımına Al</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity style={[s.btnSecondary, { width: '100%', marginTop: 12, flexDirection: 'row', justifyContent: 'center', gap: 8 }]}
            onPress={() => { setTaktikTeam('A'); setSelectedForSwap(null); setScreen('taktik'); }}>
            <Text style={{ fontSize: 16 }}>🎯</Text>
            <Text style={s.btnSecondaryText}>Taktik Düzeni & Diziliş Değiştir</Text>
          </TouchableOpacity>

          {/* YENİ EKLENEN KAYDET BUTONU */}
          <TouchableOpacity 
            style={[s.btnPrimary, { width: '100%', marginTop: 12, backgroundColor: COLORS.success }]} 
            onPress={() => {
              setSavedTeamA(teamA);
              setSavedTeamB(teamB);
              setSavedSubstitutes(substitutes);
              Alert.alert('Harika', 'Kadro değişiklikleri başarıyla kaydedildi!');
            }}
          >
            <Text style={s.btnPrimaryText}>💾 Değişiklikleri Kaydet</Text>
          </TouchableOpacity>

          {/* ESKİ PAYLAŞ BUTONU */}
          <TouchableOpacity style={[s.btnPrimary, { width: '100%', marginTop: 12 }]} onPress={shareKadro}>
            <Text style={s.btnPrimaryText}>{kadroTab === 'field' ? 'Görüntüyü Paylaş' : 'Listeyi Paylaş'}</Text>
          </TouchableOpacity>
        </ScrollView>

        <PlayerStatModal visible={statModal.visible} player={statModal.player} teamColor={statModal.teamColor}
          onClose={() => setStatModal({ visible: false, player: null, teamColor: null })} />
      </SafeAreaView>
    );
  }

  // ── EKİBİM (KLAN) EKRANI ──────────────────────────────────────────────
  if (screen === 'my_team') {
    if (!hasTeam) {
      return (
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setScreen('home')} style={s.backBtn}>
              <Text style={s.backText}>← Geri</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>Ekip Seçimi</Text>
            <View style={{ width: 40 }} />
          </View>
          <TeamSelection onTeamJoined={() => {
            setHasTeam(true);
            if (session?.user?.id) fetchMyTeam(session.user.id);
          }} />
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('home')} style={s.backBtn}>
            <Text style={s.backText}>← Geri</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>{myTeamInfo?.name || 'Takımım'}</Text>
          <View style={{ width: 40 }} />
        </View>
        
        <ScrollView style={s.body}>
          <View style={[s.card, { alignItems: 'center', backgroundColor: COLORS.primary, marginBottom: 24 }]}>
            <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '600', opacity: 0.8 }}>Davet Kodu (Klan Tagı)</Text>
            <Text style={{ color: '#FFF', fontSize: 32, fontWeight: '800', letterSpacing: 4, marginTop: 4 }}>{myTeamInfo?.join_code}</Text>
            <Text style={{ color: '#FFF', fontSize: 12, marginTop: 12, textAlign: 'center', opacity: 0.9 }}>
              Arkadaşların bu kodu kullanarak ekibine katılabilir.
            </Text>
          </View>

          <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.textMain, marginBottom: 12 }}>
            Kadro ({myTeamMembers.length} Oyuncu)
          </Text>

          {myTeamMembers.map((member, index) => (
            <View key={index} style={{ flexDirection: 'row', backgroundColor: COLORS.card, padding: 16, borderRadius: 12, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                <Text style={{ fontSize: 24 }}>👤</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textMain }}>
                  {member.display_name || 'İsimsiz Oyuncu'}
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 2, fontWeight: '600' }}>
                  Mevki: {member.main_position || 'Belirtilmedi'}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }
    {renderAvatarModal()}
  return null;
}

// ─── STİLLER ─────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  shadow: { ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 }, android: { elevation: 3 } }) },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.card, borderBottomWidth: 1, borderColor: COLORS.border },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textMain, flex: 1, textAlign: 'center' },
  backBtn: { paddingVertical: 5, paddingRight: 15, zIndex: 10 },
  backText: { fontSize: 15, color: COLORS.primary, fontWeight: '600' },
  headerHome: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, backgroundColor: COLORS.bg },
  headerTitleHome: { fontSize: 28, fontWeight: '800', color: COLORS.textMain },
  badgeAction: { backgroundColor: COLORS.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  badgeActionText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },

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
  actionTextDuplicate: { color: COLORS.warning, fontSize: 13, fontWeight: '600' },
  actionTextDelete: { color: COLORS.danger, fontSize: 13, fontWeight: '600' },

  filterBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderColor: COLORS.border },
  filterBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  filterText: { fontSize: 12, fontWeight: '600', color: COLORS.textMain },
  voteCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, padding: 12, borderRadius: 16, marginBottom: 8 },
  playerMetaMuted: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, fontWeight: '500' },
  voteBtnGroup: { flexDirection: 'row', gap: 6 },
  voteBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.bg },
  voteBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
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

  playerDotA: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#3B82F6', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 }, android: { elevation: 3 } }) },
  playerDotB: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#34D399', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#065F46', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 }, android: { elevation: 3 } }) },
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
  listCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 8, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6 }, android: { elevation: 1 } }) },
  listRow: { flexDirection: 'row', alignItems: 'center', padding: 8, borderBottomWidth: 1, borderColor: COLORS.bg },
  listIndex: { width: 24, fontSize: 13, fontWeight: '600', color: COLORS.textMuted, textAlign: 'center' },
  swapBtn: { backgroundColor: COLORS.primaryLight, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  swapBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

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

  formCard: { width: '100%', backgroundColor: COLORS.card, borderRadius: 16, padding: 20, marginTop: 16, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6 }, android: { elevation: 2 } }) },
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

  statCardModal: { marginHorizontal: 24, marginBottom: 40, borderRadius: 24, padding: 28, alignItems: 'center', overflow: 'hidden', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.4, shadowRadius: 20 }, android: { elevation: 16 } }) },
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