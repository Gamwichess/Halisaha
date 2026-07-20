/**
 * MatchRatingScreen.tsx
 *
 * Maç sonu performans oylaması (oy veren üye tek ekranda tüm saha oyuncularını
 * puanlar). Bu bileşen "aptal UI"dir: puanlanacak oyuncular ve her oyuncunun
 * nitelik listesi PARENT'tan (app/(tabs)/index.tsx) gelir — POSITION_ATTRIBUTES
 * / getAttributeFieldsFor mantığı orada tek kaynakta durur. Ekran sadece 1-10
 * puanları toplayıp onSubmit ile geri verir.
 *
 * Kurallar (parent tarafından hazırlanır):
 *   - Liste: o maçta lineup='field' olan oyuncular, KENDİSİ HARİÇ (üye + misafir)
 *   - Her oyuncu kendi nitelik seti üzerinden puanlanır (mevkiye göre)
 *   - played_as_goalkeeper olan oyuncuda kalecilik nitelikleri de listede olur
 */

import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
};

const DEFAULT_SCORE = 6;

export interface RatablePlayer {
  key:           string;          // benzersiz (user_id ya da guest_id)
  name:          string;
  isGuest:       boolean;
  ratedUserId:   string | null;
  ratedGuestId:  string | null;
  fieldPos:      string;          // KL/DEF/ORT/FOR — sadece gösterim
  playedAsGoalkeeper?: boolean;
  attributes:    string[];        // puanlanacak nitelik adları (sıralı, tekrarsız)
}

interface Props {
  teamName: string;
  players: RatablePlayer[];
  onSubmit: (scores: Record<string, Record<string, number>>) => Promise<void>;
  onCancel: () => void;
}

const POS_COLORS: Record<string, string> = {
  KL: '#FB923C', DEF: '#60A5FA', ORT: '#34D399', FOR: '#F87171',
};

export default function MatchRatingScreen({ teamName, players, onSubmit, onCancel }: Props) {
  // scores[playerKey][attribute] = 1..10
  const [scores, setScores] = useState<Record<string, Record<string, number>>>(() => {
    const init: Record<string, Record<string, number>> = {};
    players.forEach(p => {
      init[p.key] = {};
      p.attributes.forEach(a => { init[p.key][a] = DEFAULT_SCORE; });
    });
    return init;
  });
  const [saving, setSaving] = useState(false);

  function setScore(playerKey: string, attr: string, value: number) {
    setScores(prev => ({ ...prev, [playerKey]: { ...prev[playerKey], [attr]: value } }));
  }

  async function handleSubmit() {
    if (saving) return;
    setSaving(true);
    try {
      await onSubmit(scores);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.header}>
        <TouchableOpacity onPress={onCancel} style={st.backBtn}>
          <Text style={st.backText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>Performans Oyla</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={{ backgroundColor: C.card, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.border }}>
        <Text style={{ fontSize: 13, color: C.textMuted, textAlign: 'center' }}>
          {teamName ? `${teamName} — ` : ''}Her oyuncuyu niteliklerine göre 1-10 arası puanla
        </Text>
      </View>

      {players.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontSize: 14, color: C.textMuted, textAlign: 'center' }}>
            Bu maçta oylanacak başka saha oyuncusu yok.
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          {players.map(p => {
            const accent = POS_COLORS[p.fieldPos] || '#94A3B8';
            return (
              <View key={p.key} style={st.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: accent + '22', borderWidth: 2, borderColor: accent, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: accent }}>{(p.name[0] || '?').toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: C.textMain }} numberOfLines={1}>{p.name}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 3 }}>
                      <View style={{ backgroundColor: accent + '22', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 6 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: accent }}>{p.fieldPos}</Text>
                      </View>
                      {p.playedAsGoalkeeper && (
                        <View style={{ backgroundColor: '#FB923C22', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 6 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#FB923C' }}>🧤 Kalecilik</Text>
                        </View>
                      )}
                      {p.isGuest && (
                        <View style={{ backgroundColor: C.warningLight, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 6 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#92400E' }}>Misafir</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                {p.attributes.map(attr => {
                  const val = scores[p.key]?.[attr] ?? DEFAULT_SCORE;
                  return (
                    <View key={attr} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: C.textMain }}>{attr}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: accent }}>{val}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 3 }}>
                        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                          const active = n === val;
                          return (
                            <TouchableOpacity
                              key={n}
                              onPress={() => setScore(p.key, attr, n)}
                              style={{
                                flex: 1, paddingVertical: 7, borderRadius: 6, alignItems: 'center',
                                backgroundColor: active ? accent : C.bg,
                                borderWidth: 1, borderColor: active ? accent : C.border,
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFF' : C.textMuted }}>{n}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={st.bottomBar}>
        <TouchableOpacity style={[st.btnSecondary, { flex: 1 }]} onPress={onCancel} disabled={saving}>
          <Text style={st.btnSecondaryText}>Vazgeç</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.btnPrimary, { flex: 2, opacity: saving || players.length === 0 ? 0.6 : 1 }]}
          onPress={handleSubmit}
          disabled={saving || players.length === 0}
        >
          <Text style={st.btnPrimaryText}>{saving ? 'Gönderiliyor…' : 'Oyları Gönder'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

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
    backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  bottomBar: {
    flexDirection: 'row', gap: 12,
    padding: 20, paddingBottom: 8,
    backgroundColor: C.card, borderTopWidth: 1, borderColor: C.border,
  },
  btnPrimary: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  btnPrimaryText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  btnSecondary: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  btnSecondaryText: { color: C.textMain, fontSize: 16, fontWeight: '600' },
});
