/**
 * MatchStatsScreen.tsx
 *
 * 3 adımlı wizard:
 *   Adım 1 — Skor (stepper ile A/B takım puanları)
 *   Adım 2 — Goller (oyuncu başına stepper)
 *   Adım 3 — MVP (tek seçimli kart listesi)
 *
 * Kaydet işlemi:
 *   1. match_stats insert
 *   2. match_goals insert (gol > 0 olan gerçek üyeler)
 *   3. polls tablosunu kapat (is_finished: true)
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../supabase';

// index.tsx'deki COLORS ile birebir aynı değerler
const C = {
  primary:      '#4F46E5',
  primaryLight: '#E0E7FF',
  bg:           '#F9FAFB',
  card:         '#FFFFFF',
  textMain:     '#111827',
  textMuted:    '#6B7280',
  border:       '#E5E7EB',
  success:      '#10B981',
  successLight: '#D1FAE5',
  warning:      '#F59E0B',
  warningLight: '#FEF3C7',
  danger:       '#EF4444',
  dangerLight:  '#FEE2E2',
};

// ─── Tipler ──────────────────────────────────────────────────────────────────

type Position = 'KL' | 'DEF' | 'ORT' | 'FOR';
interface PlayerStats { pas: number; sut: number; fizik: number; hiz: number; }
interface PlayerInfo {
  id: string;
  name: string;
  pos: Position;
  secPos?: Position | null;
  rating: number;
  stats: PlayerStats;
  hasPaid?: boolean;
  isGuest?: boolean;
  statsKnown?: boolean;
}

interface Props {
  teamMembers: PlayerInfo[];
  teamName: string;
  pollId: string;
  teamId: string;
  userId: string;
  onSave: () => void;
  onCancel: () => void;
}

interface Scorer {
  id: string;
  name: string;
  goals: number;
  isGuest?: boolean;
}

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export default function MatchStatsScreen({
  teamMembers,
  teamName,
  pollId,
  teamId,
  userId,
  onSave,
  onCancel,
}: Props) {
  const [step, setStep]     = useState(1);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [scorers, setScorers] = useState<Scorer[]>(
    teamMembers.map(m => ({ id: m.id, name: m.name, goals: 0, isGuest: m.isGuest }))
  );
  const [mvpId, setMvpId]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalGoals = scorers.reduce((s, m) => s + m.goals, 0);
  const totalScore = scoreA + scoreB;
  const goalMismatch = totalGoals !== totalScore && totalScore > 0;

  // Misafir olmayan oyuncular — FK kısıtı için sadece bunlar goals/MVP için kullanılır
  const realMembers = teamMembers.filter(m => !m.isGuest);

  function updateGoals(id: string, delta: number) {
    setScorers(prev =>
      prev.map(s => s.id === id ? { ...s, goals: Math.max(0, s.goals + delta) } : s)
    );
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const { data: statData, error: statError } = await supabase
        .from('match_stats')
        .insert({
          poll_id:    pollId,
          team_id:    teamId,
          score_a:    scoreA,
          score_b:    scoreB,
          mvp_id:     mvpId || null,
          entered_by: userId,
        })
        .select()
        .single();

      if (statError) { logSupabaseError('match_stats.insert', statError); throw statError; }

      // Sadece gerçek üyeler (isGuest olmayan) ve gol > 0 olanlar
      const goals = scorers
        .filter(s => s.goals > 0 && !s.isGuest)
        .map(s => ({
          match_stat_id: statData.id,
          player_id:     s.id,
          goals:         s.goals,
        }));

      if (goals.length > 0) {
        const { error: goalsError } = await supabase.from('match_goals').insert(goals);
        if (goalsError) { logSupabaseError('match_goals.insert', goalsError); throw goalsError; }
      }

      const { error: pollError } = await supabase
        .from('polls')
        .update({
          is_active:   false,
          is_finished: true,
          finished_at: new Date().toISOString(),
        })
        .eq('id', pollId);

      if (pollError) { logSupabaseError('polls.update(finish)', pollError); throw pollError; }

      onSave();
    } catch (err: any) {
      // Tam PostgREST hatasını hem konsola hem kullanıcıya göster (kök neden teşhisi için)
      const parts = [err?.message, err?.code && `kod: ${err.code}`, err?.details, err?.hint]
        .filter(Boolean).join('\n');
      Alert.alert('Maç kaydedilemedi', parts || 'Bilinmeyen hata');
    } finally {
      setSaving(false);
    }
  }

  // Supabase/PostgREST hatasının tüm alanlarını konsola basar — hangi tablo/kolon
  // eksik, tam olarak görülür (code/message/details/hint).
  function logSupabaseError(where: string, error: any) {
    console.log(`[MatchStats] ${where} HATA:`, JSON.stringify({
      code: error?.code, message: error?.message, details: error?.details, hint: error?.hint,
    }, null, 2));
  }

  // ─── Adım 1: Skor ────────────────────────────────────────────────────────

  if (step === 1) {
    return (
      <SafeAreaView style={st.safe}>
        <View style={st.header}>
          <TouchableOpacity onPress={onCancel} style={st.backBtn}>
            <Text style={st.backText}>← Geri</Text>
          </TouchableOpacity>
          <Text style={st.headerTitle}>Maç Sonu (1/3)</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={{ flex: 1, padding: 20 }} contentContainerStyle={{ paddingBottom: 24 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.textMuted, textAlign: 'center', marginBottom: 20 }}>
            Skor Girişi
          </Text>

          {[
            { label: 'TAKIM A', score: scoreA, setScore: setScoreA },
            { label: 'TAKIM B', score: scoreB, setScore: setScoreB },
          ].map(team => (
            <View key={team.label} style={[st.card, { marginBottom: 16 }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.textMuted, marginBottom: 16, letterSpacing: 1 }}>
                {team.label}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
                <TouchableOpacity
                  onPress={() => team.setScore(Math.max(0, team.score - 1))}
                  style={st.stepperBtn}
                  disabled={team.score === 0}
                >
                  <Text style={[st.stepperText, team.score === 0 && { color: C.border }]}>–</Text>
                </TouchableOpacity>
                <Text style={st.scoreNum}>{team.score}</Text>
                <TouchableOpacity
                  onPress={() => team.setScore(team.score + 1)}
                  style={[st.stepperBtn, { backgroundColor: C.successLight, borderColor: C.success }]}
                >
                  <Text style={[st.stepperText, { color: C.success }]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <View style={{ backgroundColor: C.primaryLight, borderRadius: 12, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 28, fontWeight: '900', color: C.primary }}>
              {scoreA} – {scoreB}
            </Text>
            <Text style={{ fontSize: 12, color: C.primary, fontWeight: '600', marginTop: 4 }}>
              {teamName || 'Takım'}
            </Text>
          </View>
        </ScrollView>

        <View style={st.bottomBar}>
          <TouchableOpacity style={[st.btnSecondary, { flex: 1 }]} onPress={onCancel}>
            <Text style={st.btnSecondaryText}>Geri</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.btnPrimary, { flex: 2 }]} onPress={() => setStep(2)}>
            <Text style={st.btnPrimaryText}>İleri →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Adım 2: Goller ──────────────────────────────────────────────────────

  if (step === 2) {
    return (
      <SafeAreaView style={st.safe}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => setStep(1)} style={st.backBtn}>
            <Text style={st.backText}>← Geri</Text>
          </TouchableOpacity>
          <Text style={st.headerTitle}>Goller (2/3)</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Toplam gol ve uyarı */}
        <View style={{ backgroundColor: C.card, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.border }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.textMain, textAlign: 'center' }}>
            Toplam: {totalGoals} gol
          </Text>
          {goalMismatch && (
            <View style={{ backgroundColor: C.warningLight, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8 }}>
              <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '600', textAlign: 'center' }}>
                Gol sayısı ({totalGoals}) skor toplamıyla ({totalScore}) uyuşmuyor
              </Text>
            </View>
          )}
        </View>

        <FlatList
          data={scorers}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          renderItem={({ item }) => (
            <View style={[st.card, { flexDirection: 'row', alignItems: 'center', marginBottom: 10, padding: 14 }]}>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: C.textMain }}>{item.name}</Text>
              {item.isGuest && (
                <View style={{ backgroundColor: C.warningLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#92400E' }}>Misafir</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => updateGoals(item.id, -1)}
                  disabled={item.goals === 0}
                  style={[st.miniBtn, { borderColor: item.goals === 0 ? C.border : C.danger, backgroundColor: item.goals === 0 ? C.bg : C.dangerLight }]}
                >
                  <Text style={{ fontSize: 16, fontWeight: '700', color: item.goals === 0 ? C.border : C.danger }}>–</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 18, fontWeight: '800', color: C.textMain, minWidth: 24, textAlign: 'center' }}>
                  {item.goals}
                </Text>
                <TouchableOpacity
                  onPress={() => updateGoals(item.id, 1)}
                  style={[st.miniBtn, { borderColor: C.success, backgroundColor: C.successLight }]}
                >
                  <Text style={{ fontSize: 16, fontWeight: '700', color: C.success }}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />

        <View style={st.bottomBar}>
          <TouchableOpacity style={[st.btnSecondary, { flex: 1 }]} onPress={() => setStep(1)}>
            <Text style={st.btnSecondaryText}>Geri</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.btnPrimary, { flex: 2 }]} onPress={() => setStep(3)}>
            <Text style={st.btnPrimaryText}>İleri →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Adım 3: MVP ─────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => setStep(2)} style={st.backBtn}>
          <Text style={st.backText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>MVP (3/3)</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={{ backgroundColor: C.card, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.border }}>
        <Text style={{ fontSize: 13, color: C.textMuted, textAlign: 'center' }}>
          Maçın en değerlisini seç — zorunlu değil
        </Text>
      </View>

      <FlatList
        data={realMembers}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        renderItem={({ item }) => {
          const isSelected = mvpId === item.id;
          return (
            <TouchableOpacity
              onPress={() => setMvpId(isSelected ? null : item.id)}
              style={[
                st.card,
                { flexDirection: 'row', alignItems: 'center', marginBottom: 10, padding: 14 },
                isSelected && { borderWidth: 2, borderColor: C.success },
              ]}
              activeOpacity={0.75}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isSelected ? C.successLight : C.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: isSelected ? C.success : C.primary }}>
                  {item.name[0]}
                </Text>
              </View>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: C.textMain }}>{item.name}</Text>
              {isSelected && (
                <View style={{ backgroundColor: C.successLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: C.success }}>MVP ⭐</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      <View style={st.bottomBar}>
        <TouchableOpacity style={[st.btnSecondary, { flex: 1 }]} onPress={() => setStep(2)}>
          <Text style={st.btnSecondaryText}>Geri</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.btnPrimary, { flex: 2, opacity: saving ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={st.btnPrimaryText}>Kaydet</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Stiller ─────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.textMain, flex: 1, textAlign: 'center' },
  backBtn: { paddingVertical: 5, paddingRight: 15, zIndex: 10 },
  backText: { fontSize: 15, color: C.primary, fontWeight: '600' },
  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 6,
  },
  stepperBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: C.dangerLight, borderWidth: 1, borderColor: C.danger,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperText: { fontSize: 26, fontWeight: '700', color: C.danger, lineHeight: 30 },
  scoreNum: { fontSize: 52, fontWeight: '900', color: C.textMain, minWidth: 64, textAlign: 'center' },
  miniBtn: {
    width: 36, height: 36, borderRadius: 10,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  bottomBar: {
    flexDirection: 'row', gap: 12,
    padding: 20, paddingBottom: 8,
    backgroundColor: C.card, borderTopWidth: 1, borderColor: C.border,
  },
  btnPrimary: {
    backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  btnSecondary: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  btnSecondaryText: { color: C.textMain, fontSize: 16, fontWeight: '600' },
});
