# Halı Saha Yönetim Uygulaması

Türkçe dilli, halı saha maç organizasyonu ve kadro yönetimi uygulaması.  
**Expo (React Native)** + **Supabase** ile geliştirilmiştir.

---

## Hızlı Başlangıç

```bash
npm install

npx expo start              # QR kodu Expo Go ile tara
npx expo start --tunnel     # Farklı ağlardaysan
npx expo start --android
npx expo start --ios
```

TypeScript hatalarını kontrol etmek için:

```bash
npx tsc --noEmit
```

Test veya lint scripti yapılandırılmamıştır.

---

## Proje Yapısı

```
halisaha/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx        # Tab kabuğu (tek sekme)
│   │   └── index.tsx          # Uygulamanın tamamı bu dosyada
│   ├── _layout.tsx            # Kök layout
│   └── modal.tsx
├── components/
│   ├── Auth.tsx               # Giriş / Kayıt ekranı
│   ├── PlayerVoteScreen.tsx   # Oyuncu yoklama ekranı (Realtime)
│   └── TeamSelection.tsx      # Takım seçimi bileşeni
├── supabase/
│   └── functions/
│       ├── send-notification/ # Push bildirim Edge Function
│       └── toonify-avatar/    # Avatar Edge Function
├── constants/
│   └── theme.ts               # Paylaşılan tema token'ları
├── supabase.ts                # Supabase client
└── Talimat.md                 # Türkçe görev ve şema belgesi
```

---

## Mimari

### Navigasyon

Uygulama **SPA tarzı state navigasyonu** kullanır; Expo Router'ın dosya bazlı navigasyonu değil.  
`app/(tabs)/index.tsx` içindeki tek bir `screen` state'i tüm ekran geçişlerini yönetir:

```ts
type Screen =
  | 'home'         // Ana ekran
  | 'create'       // Maç oluştur / düzenle
  | 'votes'        // Kaptan yoklama yönetimi
  | 'votes_player' // Oyuncu yoklama ekranı
  | 'kadro'        // Takım kadrosu (saha görünümü)
  | 'taktik'       // Formasyon düzenleme
  | 'players'      // Oyuncu havuzu
  | 'settings'     // Profil & ayarlar
  | 'profile_setup'
  | 'my_team';     // Takım üyeleri & misafirler
```

`router.push()` çağrısı yoktur; her geçiş `setScreen(...)` ile yapılır.

### Rol Sistemi

| Rol | Kaynak | Yetkiler |
|-----|--------|----------|
| `captain` | `team_members.role` | Maç düzenleme, yoklama açma, kadro kurma, davet oluşturma |
| `player` | `team_members.role` | Yoklamaya katılma, kadro görüntüleme |

`isCaptain` state'i oturum açılışında `fetchMyTeam()` ile Supabase'den çekilir.

---

## Özellikler

### Maç Yönetimi
- Maç adı, konum, tarih, saat, format (6v6 / 7v7 / 8v8) ve saha ücreti girişi
- Harita üzerinden konum seçimi (`react-native-maps` + `expo-location` reverse geocoding)
- Kişi başı ücret hesabı (toplam ücret ÷ aktif oyuncu sayısı)
- Maç detay kartı modalı

### Yoklama Sistemi
- Kaptan yoklama açar → takım üyelerine push bildirimi gönderilir
- Oyuncular `yes` / `sub` / `no` seçeneğiyle oy kullanır
- Buton etiketleri özelleştirilebilir ("Kesin Var", "Yedek", "Yok" → değiştirilebilir)
- Kaptan: tüm bireysel oyları görür + canlı özet (count)
- Oyuncu: yalnızca toplu sayıları görür (gizlilik tasarımı)
- `polls` tablosunda takım başına yalnızca bir aktif yoklama zorunluluğu (partial unique index)

### Kadro & Formasyon
- **Dengeli Takım:** Oyuncuları mevki puanlarına göre dağıtır
- **Rastgele Takım:** Oyuncuları karıştırarak atar
- Desteklenen formasyonlar: `3-2-1` · `2-3-1` · `3-1-2` · `2-2-2` (6v6 bazlı)
- Saha görünümü SVG ile çizilir, oyuncular seç-taşı yöntemiyle değiştirilebilir
- Oyuncu yedek kulübesine indirme / sahaya alma
- Kadro paylaşımı: metin olarak veya saha ekran görüntüsü olarak

### Takım Yönetimi
- Takım oluşturma ve davet kodu ile katılma (7 günlük geçerlilik)
- Birden fazla takım üyeliği; takımlar arası geçiş
- Misafir oyuncu ekleme (`guest_players` tablosu)
- Üye istatistikleri düzenleme: PAS · ŞUT · HIZ · FİZİK (1-99)

### Bildirimler
- Yoklama açıldığında takıma push bildirimi (`send-notification` Edge Function)
- Uygulama içi bildirim rozeti (okunmamış sayısı)
- Bildirime tıklanınca ilgili ekrana yönlendirme

---

## Veritabanı Şeması

### Tablolar

```sql
-- Kullanıcı profilleri
profiles (
  id UUID PK,           -- Supabase Auth user_id ile eşleşir
  display_name TEXT,
  main_position TEXT,   -- KL | DEF | ORT | FOR
  avatar_url TEXT,
  preferred_foot TEXT,  -- Sağ | Sol | İkisi de
  push_token TEXT,      -- Expo push token
  pending_invite_code TEXT
)

-- Takımlar
teams (
  id UUID PK,
  name TEXT,
  captain_id UUID → profiles,
  created_by UUID → profiles,
  join_code TEXT
)

-- Takım üyeliği
team_members (
  id UUID PK,
  team_id UUID → teams,
  user_id UUID → profiles,
  role TEXT CHECK ('captain' | 'player' | 'admin'),
  position TEXT,
  pace INT, shooting INT, passing INT, physical INT, overall INT
)

-- Misafir oyuncular
guest_players (
  id UUID PK,
  team_id UUID → teams,
  added_by UUID → profiles,
  name TEXT,
  position TEXT,
  pace INT, shooting INT, passing INT, physical INT, overall INT
)

-- Yoklamalar
polls (
  id UUID PK,
  team_id UUID → teams,
  created_by UUID → profiles,
  match_name TEXT,
  match_date DATE,
  match_location TEXT,
  option_yes_label TEXT DEFAULT 'Kesin Var',
  option_sub_label TEXT DEFAULT 'Yedek',
  option_no_label  TEXT DEFAULT 'Yok',
  is_active BOOLEAN DEFAULT TRUE,
  teams_revealed BOOLEAN DEFAULT FALSE
)

-- Oy kayıtları
poll_votes (
  id UUID PK,
  poll_id UUID → polls,
  user_id UUID → profiles,
  vote_value TEXT CHECK ('yes' | 'sub' | 'no'),
  UNIQUE (poll_id, user_id)
)

-- Bildirimler
notifications (
  id UUID PK,
  team_id UUID → teams,
  user_id UUID → profiles,
  type TEXT DEFAULT 'poll_opened',
  title TEXT,
  body TEXT,
  is_read BOOLEAN DEFAULT FALSE
)

-- Davet kodları
team_invites (
  id UUID PK,
  team_id UUID → teams,
  created_by UUID → profiles,
  code TEXT UNIQUE,
  expires_at TIMESTAMPTZ
)
```

### Kısıtlamalar & Özel Nesneler

```sql
-- Takım başına yalnızca bir aktif yoklama
CREATE UNIQUE INDEX polls_one_active_per_team
  ON polls (team_id) WHERE is_active = TRUE;

-- Toplu oy özeti için RPC fonksiyonu
get_poll_summary(p_poll_id UUID)
  → { yes_count, sub_count, no_count, wait_count, total_members }
```

---

## Yerel Kalıcılık (AsyncStorage)

| Anahtar | İçerik |
|---------|--------|
| `@players` | Oyuncu havuzu listesi |
| `@votes` | Yerel oy kaydı |
| `@match` | Maç bilgileri |
| `@teamA` / `@teamB` | Kaydedilmiş kadro |
| `@formationA` / `@formationB` | Formasyon seçimi |
| `@pollSettings` | Yoklama buton etiketleri |

---

## Supabase Edge Functions

| Fonksiyon | Tetikleyici | Açıklama |
|-----------|-------------|----------|
| `send-notification` | Kaptan yoklama açınca | Expo Push API üzerinden takıma toplu push bildirimi gönderir, `notifications` tablosuna kayıt ekler |
| `toonify-avatar` | Avatar değiştirilince | Avatar görselini işler |

---

## Anahtar Bileşenler

| Dosya | Sorumluluk |
|-------|------------|
| `app/(tabs)/index.tsx` | Tüm uygulama UI'ı — her ekran `setScreen()` ile render edilir |
| `components/Auth.tsx` | E-posta / şifre giriş ve kayıt ekranı |
| `components/PlayerVoteScreen.tsx` | Oyuncu yoklama ekranı; Supabase Realtime ile canlı oy sayısı |
| `components/TeamSelection.tsx` | Takım seçimi bileşeni |
| `supabase.ts` | Supabase client; AsyncStorage ile oturum kalıcılığı |
| `constants/theme.ts` | Renk ve boyut token'ları |

---

## Takım Dengesi Algoritması

```
1. Kaleciler belirlenir
   - KL pozisyonlu oyuncular önceliklidir
   - KL yoksa rating'i en düşük 2 kişi kaleci yapılır

2. KL1 → Takım A, KL2 → Takım B

3. Alan oyuncuları pozisyon puanına göre sıralanır:
   DEF puanı = fizik×1.5 + hız + pas×0.5
   ORT puanı = pas×1.5  + hız + fizik×0.5
   FOR puanı = şut×1.5  + hız + pas×0.5

   Bonus: Asıl pozisyon +1000 | İkincil pozisyon +500

4. Her oyuncu, o an toplam ratingleri düşük olan takıma eklenir
```

---

## Push Bildirim Akışı

```
Kaptan → handleOpenPoll()
  └─ polls INSERT (is_active: true)
  └─ sendTeamNotification() → send-notification Edge Function
       └─ team_members'dan user_id listesi çek
       └─ profiles'dan ExponentPushToken'ları çek
       └─ Expo Push API'ye toplu POST
       └─ notifications tablosuna her üye için kayıt ekle
```

---

## EAS / Yayın Bilgileri

| Alan | Değer |
|------|-------|
| Project ID | `bfa8d530-4b08-450d-be80-97fe073cae94` |
| Bundle ID | `com.gamwi.halisaha` |
| Supabase Proje | `jvkanwkhlzwyahbspjks.supabase.co` |

---

## Bağımlılıklar (Öne Çıkanlar)

| Paket | Versiyon | Kullanım |
|-------|----------|---------- |
| `expo` | ~54.0 | Temel framework |
| `react-native` | 0.81.5 | UI katmanı |
| `@supabase/supabase-js` | ^2.106 | Backend |
| `react-native-maps` | 1.20.1 | Harita & konum seçimi |
| `expo-notifications` | ~0.32 | Push bildirimler |
| `expo-location` | ~19.0 | Reverse geocoding |
| `react-native-calendars` | ^1.1314 | Tarih seçici |
| `react-native-svg` | 15.12.1 | Saha çizimi |
| `react-native-view-shot` | 4.0.3 | Kadro ekran görüntüsü |
| `expo-sharing` | ~14.0 | Kadro paylaşımı |
| `expo-clipboard` | ~8.0 | Davet kodu kopyalama |
