/**
 * PlayerVoteScreen.tsx
 * 
 * OYUNCU OY EKRANI — Kaptanın yoklama ekranından TAMAMEN FARKLI.
 * 
 * Kaptan: Tüm oyuncuların durumunu görür, yoklama ayarlarını düzenler.
 * Oyuncu: Sadece kendi oyunu verir. Takım arkadaşlarının sadece
 *         sayısını (kaç var, kaç yok) görür — kim ne dedi görmez.
 * 
 * Supabase polls + poll_votes tablolarıyla çalışır.
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../supabase';

// ─── Tipler ──────────────────────────────────────────────────────────────────

type VoteValue = 'yes' | 'sub' | 'no' | null;

interface Poll {
  id: string;
  team_id: string;
  match_name: string;
  match_date: string | null;
  match_location: string | null;
  option_yes_label: string;
  option_sub_label: string;
  option_no_label: string;
  is_active: boolean;
  created_at: string;
}

interface PollSummary {
  yes_count: number;
  sub_count: number;
  no_count: number;
  wait_count: number;
  total_members: number;
}

interface Props {
  userId: string;
  teamId: string;
  onBack: () => void;
}

// ─── Renkler (orijinal uygulama renk sistemiyle uyumlu) ───────────────────────

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

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  const DAYS   = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];
  const date   = new Date(y, m - 1, d);
  return `${DAYS[date.getDay()]}, ${d} ${MONTHS[m - 1]}`;
}

// ─── Bileşen ──────────────────────────────────────────────────────────────────

export default function PlayerVoteScreen({ userId, teamId, onBack }: Props) {
  const [poll, setPoll]           = useState<Poll | null>(null);
  const [myVote, setMyVote]       = useState<VoteValue>(null);
  const [summary, setSummary]     = useState<PollSummary | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [noActivePoll, setNoActivePoll] = useState(false);

  // Yoklama + kendi oyumu yükle
  useEffect(() => {
    loadData();

    // Gerçek zamanlı oy güncellemeleri (Supabase Realtime)
    const channel = supabase
      .channel('poll_votes_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'poll_votes' },
        () => loadSummary()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [teamId]);

  async function loadData() {
    setLoading(true);
    try {
      // 1. Aktif yoklamayı çek
      const { data: pollData, error: pollError } = await supabase
        .from('polls')
        .select('*')
        .eq('team_id', teamId)
        .eq('is_active', true)
        .single();

      if (pollError || !pollData) {
        setNoActivePoll(true);
        setLoading(false);
        return;
      }

      setPoll(pollData);

      // 2. Kendi oyumu çek
      const { data: voteData } = await supabase
        .from('poll_votes')
        .select('vote_value')
        .eq('poll_id', pollData.id)
        .eq('user_id', userId)
        .single();

      if (voteData) setMyVote(voteData.vote_value as VoteValue);

      // 3. Özet sayıları çek
      await loadSummaryForPoll(pollData.id);
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary() {
    if (!poll) return;
    await loadSummaryForPoll(poll.id);
  }

  async function loadSummaryForPoll(pollId: string): Promise<PollSummary | null> {
    const { data } = await supabase.rpc('get_poll_summary', { p_poll_id: pollId });
    if (data && data[0]) {
      setSummary(data[0]);
      return data[0];
    }
    return null;
  }

  // Oy ver veya değiştir
  async function castVote(value: VoteValue) {
    if (!poll || saving || value === null) return;
    setSaving(true);

    try {
      // Önce kendi oyumu kontrol et
      const { data: existing } = await supabase
        .from('poll_votes')
        .select('id')
        .eq('poll_id', poll.id)
        .eq('user_id', userId)
        .single();

      const isNewVote = !existing;

      if (existing) {
        // Oy zaten var → güncelle
        await supabase
          .from('poll_votes')
          .update({ vote_value: value })
          .eq('poll_id', poll.id)
          .eq('user_id', userId);
      } else {
        // Yeni oy
        await supabase
          .from('poll_votes')
          .insert({ poll_id: poll.id, user_id: userId, vote_value: value });
      }

      setMyVote(value);
      const newSummary = await loadSummaryForPoll(poll.id);

      // Yeni oy ise ve herkes oy kullandıysa kaptana bildirim gönder
      if (isNewVote && newSummary && newSummary.wait_count === 0 && newSummary.total_members > 0) {
        try {
          await supabase.functions.invoke('send-notification', {
            body: {
              team_id: poll.team_id,
              title: '✅ Yoklama Tamamlandı',
              body: 'Herkes oy kullandı, kadroları açıklama vakti!',
              type: 'poll_completed',
              captain_only: true,
            },
          });
        } catch (e) {
          console.log('Tamamlanma bildirimi gönderilemedi:', e);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  if (noActivePoll) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>← Geri</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Yoklama</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📭</Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: C.textMain, marginBottom: 8 }}>
            Aktif yoklama yok
          </Text>
          <Text style={{ fontSize: 14, color: C.textMuted, textAlign: 'center', paddingHorizontal: 40 }}>
            Kaptan yeni bir yoklama başlattığında burada görünecek.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const buttons: { value: VoteValue; label: string; color: string; lightColor: string; icon: string }[] = [
    { value: 'yes', label: poll!.option_yes_label, color: C.success,  lightColor: C.successLight,  icon: '✅' },
    { value: 'sub', label: poll!.option_sub_label, color: C.warning,  lightColor: C.warningLight,  icon: '🔄' },
    { value: 'no',  label: poll!.option_no_label,  color: C.danger,   lightColor: C.dangerLight,   icon: '❌' },
  ];

  const yesPercent  = summary && summary.total_members > 0
    ? Math.round((summary.yes_count / summary.total_members) * 100) : 0;
  const subPercent  = summary && summary.total_members > 0
    ? Math.round((summary.sub_count / summary.total_members) * 100) : 0;
  const noPercent   = summary && summary.total_members > 0
    ? Math.round((summary.no_count / summary.total_members) * 100) : 0;
  const waitPercent = summary && summary.total_members > 0
    ? Math.round((summary.wait_count / summary.total_members) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Yoklama</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>

        {/* Maç Bilgi Kartı */}
        <View style={styles.matchCard}>
          <View style={styles.matchIconBox}>
            <Text style={{ fontSize: 28 }}>⚽</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.matchName}>{poll!.match_name}</Text>
            {poll!.match_date && (
              <Text style={styles.matchMeta}>📅 {formatDate(poll!.match_date)}</Text>
            )}
            {poll!.match_location && (
              <Text style={styles.matchMeta}>📍 {poll!.match_location}</Text>
            )}
          </View>
        </View>

        {/* ═══ OYUNCU OY BÖLÜMÜ ═══ */}
        <Text style={styles.sectionTitle}>Cevabın ne?</Text>

        {myVote && (
          <View style={styles.alreadyVotedBanner}>
            <Text style={styles.alreadyVotedText}>
              ✏️ Oyunu değiştirebilirsin — son seçimin geçerlidir.
            </Text>
          </View>
        )}

        <View style={styles.voteButtonsCol}>
          {buttons.map(btn => {
            const isSelected = myVote === btn.value;
            return (
              <TouchableOpacity
                key={btn.value}
                onPress={() => castVote(btn.value)}
                disabled={saving}
                activeOpacity={0.82}
                style={[
                  styles.voteBtn,
                  isSelected && {
                    backgroundColor: btn.lightColor,
                    borderColor: btn.color,
                    borderWidth: 2,
                  },
                  saving && { opacity: 0.6 },
                ]}
              >
                <Text style={{ fontSize: 28, marginRight: 14 }}>{btn.icon}</Text>
                <Text style={[
                  styles.voteBtnText,
                  isSelected && { color: btn.color },
                ]}>
                  {btn.label}
                </Text>
                {isSelected && (
                  <View style={[styles.selectedDot, { backgroundColor: btn.color }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ═══ TAKIM ÖZET (Sayılar — isimler değil) ═══ */}
        {summary && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 28 }]}>
              Takım durumu ({summary.total_members} kişi)
            </Text>

            <View style={styles.summaryCard}>
              {/* Satır: Var */}
              <SummaryRow
                label={poll!.option_yes_label}
                count={summary.yes_count}
                total={summary.total_members}
                color={C.success}
              />
              <View style={styles.divider} />
              {/* Satır: Yedek */}
              <SummaryRow
                label={poll!.option_sub_label}
                count={summary.sub_count}
                total={summary.total_members}
                color={C.warning}
              />
              <View style={styles.divider} />
              {/* Satır: Yok */}
              <SummaryRow
                label={poll!.option_no_label}
                count={summary.no_count}
                total={summary.total_members}
                color={C.danger}
              />
              <View style={styles.divider} />
              {/* Satır: Cevap Bekliyor */}
              <SummaryRow
                label="Cevap Bekliyor"
                count={summary.wait_count}
                total={summary.total_members}
                color={C.textMuted}
              />
            </View>

            {/* NOT: Kimin ne dediği burada kasıtlı olarak gösterilmiyor.
                 Oyuncular birbirinin oyunu göremez — sadece kaptan görebilir. */}
            <Text style={styles.privacyNote}>
              🔒 Kimin ne oyladığı sadece kaptan tarafından görülebilir.
            </Text>
          </>
        )}

      </View>
    </SafeAreaView>
  );
}

// ─── Özet Satırı Alt Bileşeni ─────────────────────────────────────────────────

function SummaryRow({
  label, count, total, color,
}: {
  label: string; count: number; total: number; color: string;
}) {
  const pct = total > 0 ? (count / total) : 0;

  return (
    <View style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: C.textMain }}>{label}</Text>
        <Text style={{ fontSize: 14, fontWeight: '800', color }}>{count} kişi</Text>
      </View>
      {/* Progress bar */}
      <View style={{ height: 6, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden' }}>
        <View style={{
          height: '100%',
          width: `${Math.round(pct * 100)}%`,
          backgroundColor: color,
          borderRadius: 4,
        }} />
      </View>
    </View>
  );
}

// ─── Stiller ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.textMain, flex: 1, textAlign: 'center' },
  backBtn: { paddingVertical: 5, paddingRight: 15 },
  backText: { fontSize: 15, color: C.primary, fontWeight: '600' },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },

  matchCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 18,
    flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8,
    elevation: 2,
  },
  matchIconBox: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center',
  },
  matchName: { fontSize: 17, fontWeight: '700', color: C.textMain, marginBottom: 4 },
  matchMeta: { fontSize: 13, color: C.textMuted, marginTop: 2 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.textMain, marginBottom: 14 },

  alreadyVotedBanner: {
    backgroundColor: C.primaryLight, borderRadius: 10, padding: 10,
    marginBottom: 14, borderLeftWidth: 4, borderColor: C.primary,
  },
  alreadyVotedText: { fontSize: 13, color: C.primary, fontWeight: '600' },

  voteButtonsCol: { gap: 12, marginBottom: 4 },

  voteBtn: {
    backgroundColor: C.card, borderRadius: 16, padding: 20,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4,
    elevation: 1,
  },
  voteBtnText: {
    fontSize: 17, fontWeight: '700', color: C.textMain, flex: 1,
  },
  selectedDot: {
    width: 10, height: 10, borderRadius: 5,
  },

  summaryCard: {
    backgroundColor: C.card, borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6,
    elevation: 2,
  },
  divider: { height: 1, backgroundColor: C.bg, marginHorizontal: 16 },

  privacyNote: {
    fontSize: 12, color: C.textMuted, textAlign: 'center',
    marginTop: 12, fontWeight: '500',
  },
});