# DURUM — Halı Saha Uygulaması

> Bu dosya Claude Code'un kendi hafızasıdır. `/baslat` ile okunur, `/bitir` ile güncellenir.
> Her oturum sonunda güncel tutulur. Amaç: yeni oturumda projeye sıfırdan hakim olmak.

## Genel Durum
- **Proje**: Halı saha (amatör futbol) takım yönetim uygulaması
- **Stack**: Expo (React Native) + Supabase
- **Mimari**: Tek dosyada SPA-tarzı state navigasyonu — `app/(tabs)/index.tsx` (~5300 satır)
- **Dağıtım**: iOS TestFlight'ta yayında. Şu an **1.0.3 / build #8** EAS'te derlendi ve App Store Connect'e **başarıyla submit edildi** (Apple "Processing" sürecinde). Otomatik submit artık sorunsuz: `eas.json`'da `ascAppId: 169829` ekli → `eas build -p ios --profile production --auto-submit --non-interactive` tek komutla build+submit yapıyor. Android build sürüyor.
- **KRİTİK / yayın öncesi**: RLS (Row Level Security) hâlâ KAPALI — public yayından önceki en büyük iş. Tablolar: profiles, teams, team_members, polls, poll_votes, guest_players, notifications, team_invites, match_lineups, player_ratings.

## Oturmuş Sistemler (çalışıyor)
- Supabase şeması: 9+ tablo temiz kurulu (+ player_ratings maç-sonu oylama için)
- RPC'ler: transfer_captaincy, leave_team, get_poll_summary; handle_new_user trigger
- Rol sistemi: captain / deputy / player (+ oyuncu detayında etiket)
- İki adımlı maç oluşturma sihirbazı; maç saati tam 24 saat
- Maç yaşam döngüsü: iptal = sil (cascade), arşiv = sakla (is_active=false); maç bitir = MatchStatsScreen `is_finished=true` + `finished_at` set eder
- Kadro kurma: manuel + otomatik boşluk doldurma; kadro açıklanınca `match_lineups`'a field/bench yazılır
- Misafir oyuncular kadroya girebiliyor (üye+misafir havuzu birleşik)
- **Maç-sonu performans oylaması ÇALIŞIYOR** (migration push'landı). Saha oyuncuları birbirini niteliklerinden 10 üzerinden puanlar; pencere 24 saat açık; kapanınca OVR kademeli güncellenir (atomik guard'lı).
- **Sadeleştirilmiş nitelik sistemi + Kondisyon çarpanı** (aşağıda mimari not)
- Maç sonu istatistik girişi + toplam gol gösterimi
- Pull-to-refresh tüm ekranlarda
- Çok takımlı kullanım: takım scope'u artık düzgün izole (scope açığı kapandı)
- **Ana takım seçimi**: Kalıcı `@mainTeamId` — tek takımda otomatik, çok takımda seçili ana takım gösterilir (aşağıda mimari not)

## Son Oturumda Yapılanlar (2026-07-30/31)
- **TestFlight rebuild** → `app.json` version 1.0.2 → **1.0.3**, commit+push. `eas build -p ios --profile production --auto-submit --non-interactive` çalıştırıldı: build #8 alındı, App Store Connect'e **başarıyla submit edildi** (Apple işlemede). Önceki oturumda kapatılan `ascAppId` (169829) sayesinde non-interactive submit sorunsuz çalıştı.
  - Not: Log'da bir Apple 401 uyarısı çıktı ama sorun olmadı — EAS kayıtlı ASC API Key ile devam etti, credential'lar (sertifika + provisioning profile) hazırdı.

## Geçmiş Oturumlar (özet)
- **2026-07-24**: Maç otomatik bitince oylama gelmeme bug'ı kök nedeni bulundu+düzeltildi (⏳ hâlâ ileri saatli gerçek maçla doğrulanacak — Bilinen Buglar'a bak); pull-to-refresh'e `fetchOpenRatingMatch` eklendi; nitelik girişi scroll zıplaması (KeyboardAware otomatik kaydırma kapatıldı, onLayout y ile elle kaydırma); paylaşımda maç bilgisi saha görseline şerit olarak basıldı; maç oluşturunca home'a dönüş; ana takım / "takımda değilsiniz" bug'ı (`fetchMyTeam` `.single()` kaldırıldı, `@mainTeamId` mimarisi).

## Mevki / Nitelik Mimarisi (kalıcı notlar — GÜNCEL)
Bu bölüm bu oturumda TAMAMEN yenilendi. Eski "ortak + primary + secondary union" modeli KALDIRILDI.
- 6 mevki: Kaleci, Defans, Ön Libero, Orta Saha, Forvet Arkası, Forvet.
- **Nitelik seti artık SABİT** (sadeleştirme — 11'e kadar çıkan set yorucu idi):
  - Saha oyuncuları HEPSİ aynı 6: `OUTFIELD_ATTRIBUTES = ['Şut','Pas','Top Kontrolü','Markaj','Hız','Fiziksel Güç']`
  - Kaleci kendi 6'sı: `GOALKEEPER_ATTRIBUTES = ['Uzanış','Tutuş','Dağıtım','Refleks','Hız','Pozisyon']`
  - **İkincil mevki artık nitelik SETİ eklemez** (yalnızca OVR ağırlığına harmanlanır).
- **Kondisyon = ÖZEL**: `CONDITION_ATTR='Kondisyon'`. 6'nın DIŞINDA, form/oylamada "GENEL" başlığıyla AYRI gösterilir. OVR'a ağırlık DEĞİL **çarpan** olarak girer: `conditionFactor()` → 1–99'u ~0.90–1.05'e eşler (nötr 60). Formu iyi oyuncu OVR'ında artı, düşük kondisyon eksi.
- **OVR (`computeOverall(attrs, primary, secondary)`)**:
  - Beceri OVR = 6 niteliğin ağırlıklı ortalaması. Ağırlık = `POSITION_WEIGHTS[primary] + SECONDARY_WEIGHT_FACTOR × POSITION_WEIGHTS[secondary]` (SECONDARY_WEIGHT_FACTOR = 0.5). → Defans+Forvet oyuncusunun şutu, saf Defans'a göre OVR'ına daha çok yansır.
  - Nihai OVR = beceri OVR × conditionFactor. 1–99 clamp.
  - Girilmemiş nitelik = 60. `computeOverall` çağıran her yere secondary geçirildi (kart, liste, kaydetme, oylama işleme).
- **Eski veri eşleme**: `migrateAttributeNames()` okuma anında eski adları yeniye çevirir — `Şut Gücü→Şut`, `Kurtarış→Tutuş`, `Pozisyon Alma→Pozisyon`. Eşlenmeyen eskiler düşer. Mevcut satırların stored `overall_rating`'i eski değerde kalır; ancak oyuncu **yeniden kaydedilince** ya da oylama işlenince yeni sisteme göre hesaplanır. (İstenirse toplu yeniden-hesapla eklenebilir.)
- İlgili sabitler `app/(tabs)/index.tsx` başında ~satır 144–290.

## Maç-Sonu Oylama Mimarisi (kalıcı notlar)
- Tablo `player_ratings` (poll_id="maç", voter_id hep üye, rated_user_id/rated_guest_id'den biri, attribute, score 1–10). Unique: (poll_id, voter_id, coalesce(rated_user,rated_guest), attribute). Guard: `polls.ratings_processed_at`.
- Sabitler: `OVR_K = 0.18` (kademeli yumuşatma `yeni = eski + K×(maç_ort − eski)`), `RATING_WINDOW_HOURS = 24`.
- Akış: `fetchOpenRatingMatch` (home yüklenince + takım değişince) → biten (is_finished, finished_at<24h) ve voter'ın `lineup='field'` olduğu maçı bulur → 🗳️ "Performans Oyla" butonu. `submitMatchRatings` delete+insert. `processExpiredRatingMatches`/`processMatchRatings` pencere kapanınca atomik guard'lı (koşullu UPDATE `ratings_processed_at is null`) kademeli OVR günceller. Misafir oylanır, oy veremez.
- **OTOMATİK BİTİŞ DÜZELTMESİ (bu oturum)**: Maç saati kendi kendine geçince oylama gelmiyordu. Kök neden: `fetchActivePoll` zaman aşımında SADECE `is_active:false` yapıyor, `is_finished`/`finished_at` yazmıyordu → pencere hiç açılmıyordu (maç "silinmiyor", arşivleniyor). Düzeltildi: zaman aşımı dalında artık `is_active:false + is_finished:true + finished_at` (`.is('finished_at', null)` guard'lı) yazılıyor ve `fetchOpenRatingMatch` tetikleniyor. Ayrıca pull-to-refresh (`onRefresh` home dalı) `fetchOpenRatingMatch` çağırmıyordu → eklendi. NOT: yalnızca `is_active=true` maçlar bu dala girer; düzeltmeden önce kapanmış eski maçlar geriye dönük açılmaz. ⏳ **İleri saatli GERÇEK maçla doğrulanacak** (geçmişe-dönük kurulanda tetiklenmiyor gibi görünüyor — test edilecek).

## Ana Takım Mimarisi (kalıcı notlar)
- Kalıcı anahtar `@mainTeamId` (AsyncStorage). Hangi takımın ana ekranda gösterileceğini tutar.
- `fetchMyTeam` artık `.single()` KULLANMIYOR (çok takımda "çok satır" hatası verip hasTeam=false → "takımda değilsiniz" yapıyordu). Bunun yerine tüm üyelikleri çeker; `@mainTeamId` üyeliklerden biriyse onu, değilse ilk takımı seçer ve `@mainTeamId`'ye sabitler → tek takımda otomatik seçim.
- `switchTeam` / `switchTeamAndGoMyTeam` (Takımım'dan seçim) seçilen takımı `@mainTeamId`'ye yazar → kalıcı.
- `handleCreateTeam` ve `handleAcceptInvite` yeni takımı `@mainTeamId` yapar → oluşturunca/katılınca o takım görünür.
- Takımdan ayrılma (`leave_team`): ayrılan ana takımsa `@mainTeamId` silinir, `fetchMyTeam` tekrar çağrılır → kalan takıma otomatik geçer (reload gerekmez).

## Devam Eden / Yarım Kalan İş
- **⏳ TestFlight işleme (1.0.3 / build #8)**: Apple "Processing" bitince TestFlight'ta test edilebilir olur (email gelecek). https://appstoreconnect.apple.com/apps/169829/testflight/ios
- **⏳ HATIRLAT — otomatik maç-sonu oylama doğrulaması**: Otomatik bitiş düzeltmesi kodlandı ama geçmişe-dönük kurulan maçta tetiklenmiyor gibi. Kullanıcı **ileri saatli gerçek bir maç** kurup saati geçince oylamanın otomatik geldiğini doğrulayacak. Test aşamasındaki arkadaşlardan da feedback alınacak. (Bu oturumda unutmadan hatırlat.)

## Çalışma Tarzı / Tercihler
- Kullanıcı Türkçe konuşur.
- İş bitince ayrıca "tamamlandı" mesajı ATMA — kullanıcı kendi test eder, geri bildirir.
- Büyük/mimari işlerde ÖNCE planı (şema, mantık) açıkla, ONAY alınca kodla. Körlemesine patch atma; tekrarlayan bir bug varsa önce kök nedeni veriyle (log) göster.
- Sadeleştirme sırasını doğru kur: önce veri/nitelik modeli, sonra ona bağlı UI/oylama.
- Supabase migration'ları `npx supabase db push` ile kullanıcı tarafından uygulanır (DB şifresi Claude Code'da yok).
- EAS: giriş `gamwi` (tugrulkeser@msn.com). Build numarası remote + autoIncrement (elle bump yok). Marketing version app.json'da.
