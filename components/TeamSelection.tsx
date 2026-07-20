import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function TeamSelection({ onTeamJoined }: { onTeamJoined: () => void }) {
  const [loading, setLoading] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  async function createTeam() {
    if (!teamName.trim() || !joinCode.trim()) {
      Alert.alert('Hata', 'Lütfen takım adını ve klan tagını boş bırakmayın.');
      return;
    }

    setLoading(true);
    try {
      // 1. Mevcut kullanıcıyı al
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Kullanıcı oturumu bulunamadı.');

      // 2. Takımı oluştur (teams tablosuna yaz)
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .insert([{ 
          name: teamName, 
          join_code: joinCode.toUpperCase(), // Tag her zaman büyük harf olsun
          captain_id: user.id 
        }])
        .select()
        .single();

      if (teamError) {
        // 23505 kodu PostgreSQL'de "Unique" (Benzersiz) kuralı ihlalidir
        if (teamError.code === '23505') throw new Error('Bu davet kodu (tag) zaten kullanılıyor. Lütfen daha yaratıcı bir kod seçin.');
        throw teamError;
      }

      // 3. Kaptanı otomatik olarak kendi takımına üye olarak ekle
      const { error: memberError } = await supabase
        .from('team_members')
        .insert([{ team_id: teamData.id, user_id: user.id }]);

      if (memberError) throw memberError;

      Alert.alert('Harika!', 'Ekibiniz başarıyla kuruldu.');
      
      // Başarılı olursa ana ekrana haber ver
      onTeamJoined();

    } catch (error: any) {
      Alert.alert('Kurulum Başarısız', error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Yeni Ekip Kur</Text>
      <Text style={styles.subtitle}>Kendi halı saha grubunu oluştur ve oyuncularını davet et.</Text>

      <View style={styles.inputBox}>
        <Text style={styles.label}>Ekip / Takım Adı</Text>
        <TextInput 
          style={styles.input} 
          placeholder="Örn: Cuma Gecesi Tayfası" 
          value={teamName} 
          onChangeText={setTeamName} 
        />
      </View>

      <View style={styles.inputBox}>
        <Text style={styles.label}>Davet Kodu (Klan Tagı)</Text>
        <TextInput 
          style={styles.input} 
          placeholder="Örn: MEME" 
          value={joinCode} 
          onChangeText={setJoinCode} 
          autoCapitalize="characters" 
          maxLength={6}
        />
        <Text style={styles.hint}>Oyuncular bu 4-6 harflik kısa kod ile grubuna katılacak.</Text>
      </View>

      <TouchableOpacity style={styles.buttonPrimary} onPress={createTeam} disabled={loading}>
        {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Ekibi Kur</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#F9FAFB' },
  title: { fontSize: 28, fontWeight: '800', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 32, lineHeight: 20 },
  inputBox: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginLeft: 4 },
  input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#111827' },
  hint: { fontSize: 12, color: '#9CA3AF', marginTop: 6, marginLeft: 4 },
  buttonPrimary: { backgroundColor: '#4F46E5', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' }
});