# YAPILACAKLAR — Halı Saha Uygulaması

> `/baslat` ile okunur, `/bitir` ile güncellenir. "Sonraya / Erken" bölümü = unutturma notları.

## Aktif (şu an üstünde çalışılan)
- [ ] **⏳ 1.0.5 / build #9 TestFlight'ta test edilecek** — submit başarılı, Apple "Processing". Bu build aşağıdakileri İLK KEZ test cihazlarına taşıdı; kendin + test arkadaşlarından feedback al:
  - Nitelik formu: Kondisyon klavyenin altında kalıyor mu, boşluğa tıklayınca zıplıyor mu
  - Profil + profil tamamlama: 6 mevki geliyor mu (Ön Libero / Forvet Arkası)
  - Misafir ekleme: mevki sormuyor, sonra nitelik formundan giriliyor
  - **V1/V2/V3 + 🔄 Yeni**: sahada anlık değişiyor mu, formasyonu bozuyor mu
  - **Otomatik formasyon**: maç kurarken artık formasyon SORULMUYOR — sistem seçiyor, makul mü
  - **Paylaşım görselinde logo**: `captureRef` uzak görsel yüklenmeden yakalarsa logo boş çıkabilir — tek şüpheli nokta
  - Takım kimliği: sen test ettin ✅, başka bir kaptan kendi takımında denesin
- [ ] Feedback gelince: düzeltmeler → `/checkpoint` → `/guncelle` (komut sürümü kendisi 1.0.6 yapar).

## Bilinen Buglar (takip et — durumları belirsiz, test edilecek)
- [ ] **⏳ Otomatik maç-sonu oylama doğrulaması**: Otomatik bitiş düzeltmesi kodlandı ama geçmişe-dönük kurulan maçta tetiklenmiyor gibi. **İleri saatte gerçek bir maç** kurup, saati geçince oylamanın otomatik geldiğini doğrula. Test aşamasındaki arkadaşlardan feedback al. (Kod: `fetchActivePoll` zaman aşımı dalı + `onRefresh` home.)
- [ ] **Yedek yerleştirme mevkiye göre yapılıyor mu** — hâlâ test edilmedi. Tek açık yerleştirme testi.
- [ ] **`match_lineups`'a hiç `bench` satırı yazılmamış** — bu oturumda veri incelenirken fark edildi: 24 açıklanmış kadronun HEPSİ sadece `lineup='field'`, tek bir bench satırı yok. DURUM.md eskiden "field/bench yazılır" diyordu ama veri öyle demiyor. Yukarıdaki yedek yerleştirme maddesiyle ilgili olabilir — `saveLineupToSupabase`'e bakılacak.

## Sıradaki İşler (acelesi yok ama sırada)
- [ ] **Takımım'da oyuncu silme/atma — kaptan + yardımcıya açılsın**. İstenen: hem **Kemik Kadro** hem **Jokerler** sekmesinden oyuncu silinebilsin/atılabilsin.
  Mevcut durum (işe başlarken buradan devam et):
  - Üyeler için `showMemberActionMenu` VAR (`index.tsx:3488`) ve içinde "Takımdan çıkar 🚪" (`handleRemoveMember`) mevcut — ama menü **yalnızca `isCaptain`** koşuluyla açılıyor (üye listesindeki `⋯` butonu). **`amIManager` yapılmalı** ki yardımcı da kullanabilsin.
  - Yardımcı için hangi işlemler açık olmalı, karar gerekiyor: "Kaptanlığı devret" ve "Yardımcı kaptan yap" muhtemelen kaptana özel kalmalı; yalnızca "Takımdan çıkar" yardımcıya açılmalı.
  - **Jokerler (misafir) için silme HİÇ YOK** — `guest_players` tablosundan silen bir fonksiyon yok, sıfırdan yazılacak (`handleDeleteGuest` + joker kartında `⋯`/uzun bas menüsü).
  - ⚠️ Misafir silinince `match_lineups` / `player_ratings` içindeki `guest_id` referanslarına ne olacağına bakılmalı (cascade var mı, yoksa geçmiş kadrolar bozulur mu).
- [ ] **Oyuncu detay menüsü UI**: Oyuncuya tıklayınca açılan menü referans görseldeki gibi görünmeli — mevcut UI kötü. (⚠️ Referans görsel işe başlarken kullanıcıdan alınacak — görsel olmadan başlanamaz.)
- [ ] **Maç hatırlatıcı bildirimi**: Maç saati yaklaşınca push/local bildirim. Kaç saat önce ve açık/kapalı kullanıcı ayarı olmalı. (expo-notifications local schedule; ayar `@pollSettings` benzeri saklanır.)

## Sonraya / Erken (UNUTTURMA — şimdi yapma, ama hatırlat)
- [ ] **RLS'i aç** — public TestFlight/yayın ÖNCESİ zorunlu. Şu an kapalı. En kritik yayın-öncesi iş. (Erken: önce özellikler otursun. NOT: bu oturumda gerçek veriyi anon key ile okuyabildik — kapalı olduğunun canlı kanıtı.)
  - **Bu turda `team_logos` storage policy'lerini de daralt**: şu an "giriş yapmış herkes yazabilir". Olması gereken: sadece o takımın kaptanı/yardımcısı `teamId/` klasörüne yazabilsin. (`supabase/migrations/20260801120000_team_identity.sql` içine not düşüldü.)
- [ ] **Mevcut oyuncuların OVR'ını toplu yeniden-hesapla** — nitelik sistemi değişti; eski satırların stored `overall_rating`'i ancak yeniden kaydedilince güncelleniyor. (Açık soru — gerçek veri az olduğu için acil değil.)
- [ ] **Eski profillerin `main_position`'ı** — artık SkillPosition KODU saklanıyor (`ON_LIBERO`). Eskiden `DEF`/`FOR` kaydedilmiş profillerde profil ekranında hiçbir chip seçili görünmez, kullanıcı bir kez yeniden seçmeli. İşlevsel etkisi yok (takım kurma `team_members.primary_position` kullanıyor). İstenirse tek seferlik eşleme scripti yazılabilir.
- [ ] **Çeşitlilik/varyasyon sabitlerinin ince ayarı** — gerçek kullanım oturunca gözden geçir: `DIVERSITY_LAMBDA` (off 0 / mid 8 / high 20), `VARIANT_SPREAD = 15`, `VARIANT_COUNT = 3`, `VARIANT_RESTARTS = 150`, `PAIR_HISTORY_MATCHES = 3`, `PAIR_DECAY = 0.65`. Varyasyon sayısını 4'e çıkarmak için sadece `VARIANT_COUNT` yeter, UI kendini ona göre çiziyor.
- [ ] **Formasyon öneri sabitlerinin ince ayarı** — `SHORTAGE_WEIGHT.DEF = 1.5`, `EXTRA_STRIKER_COST = 3`, `NO_COVER_COST = 3`. Üç senaryoda doğrulandı ama gerçek kullanımda gözden geçir.
- [ ] **`react-native-keyboard-aware-scroll-view` bağımlılığı** — kodda artık HİÇ kullanılmıyor, `package.json`'da duruyor. Temizlik istenirse kaldırılabilir (aceleye gerek yok).
- [ ] **Sohbet / mesajlaşma özelliği** (emoji + GIF). Ayrı sistem: messages tablosu, realtime, emoji picker, Giphy/Tenor API. (Erken: en sona.)
- [ ] **guestVotesLocal kalıcılığı**: misafirin "Kesin Var" işareti uygulama kapanınca sıfırlanıyor. Kalıcı yapılsın mı? (Açık soru.)
- [ ] **POSITION_WEIGHTS ince ayarı** — yeni 6'lı sisteme göre makul varsayılanlarla kuruldu (SECONDARY_WEIGHT_FACTOR=0.5 dahil). Gerçek kullanım oturunca gözden geçir.
- [ ] **Kondisyon çarpan aralığı (~0.90–1.05) ve OVR sabiti K (0.18)** — gerçek oylama verisi gelince ayarla.
- [ ] **Supabase pause**: free tier 7 günde bir duraklıyor. Haftada 1 manuel dashboard girişiyle idare. Launch'a yakın Pro'ya geçiş düşünülebilir.

## Tamamlananlar (2026-07-31 / 08-01)
- [x] **Takım kimliği: logo + isim + marka rengi** — TEST EDİLDİ, ÇALIŞIYOR. Migration uygulandı (`teams.logo_url`, `teams.color`, `team_logos` public bucket + policy'ler). Logo yükleme `expo-image-picker` base64 → Storage; `expo-file-system` kullanılmadı (SDK 54'te API değişti). `TeamLogo` bileşeni 4 yerde. Düzenleme kaptan + yardımcıya açık.
- [x] **Takım listesi boş kalma bug'ı** — DÜZELTİLDİ. `fetchUserTeams` yeni kolonları isteyince migration'sız DB'de sorgu komple hata verip Takımım menüsünü boşaltıyordu; hata artık loglanıyor ve kimliksiz select'e geri düşülüyor.
- [x] **`/guncelle` her seferinde sürüm bump'lıyor** — artık sormuyor, patch +1 yapıp commit/push ediyor. Sürüm 1.0.4.
- [x] **`/checkpoint` komutu + git tag tabanlı geri dönüş noktaları** — `.claude/commands/checkpoint.md`. İlk checkpoint: `checkpoint-2026-08-01-01`. (Claude Code'un yerleşik rewind'i oturum içi olduğu için kalıcı çözüm olarak tag seçildi. ⚠️ Tag yalnızca kodu geri alır, Supabase şemasını GERİ ALMAZ.)
- [x] **TestFlight build 1.0.5 / #9** — sürüm 1.0.4→1.0.5, build + otomatik submit başarılı (build ID `b9d581fe`).
- [x] **Takım çeşitliliği sistemi** — aynı çekirdeğin her hafta aynı tarafta oynaması çözüldü. Kök neden: `buildBalancedTeams` tamamen deterministikti. `match_lineups`'tan son 3 maçın birliktelik geçmişi + mevki kovası içi yerel arama. Gerçek veriyle doğrulandı: tekrar puanı 32.1→20, denge farkı 15→0-5.
- [x] **Varyasyon seçimi V1/V2/V3 + 🔄 Yeni** — kadro (saha) ekranında, geri dönmeden anlık geçiş. Orta'da 29, Yüksek'te 22 farklı varyasyon üretilebiliyor.
- [x] **"Dengeli Kur" + "Rastgele Kur" → tek ⚡ Kadroları Kur** + Çeşitlilik seçici (Kapalı/Orta/Yüksek, `@diversity`).
- [x] **Otomatik formasyon önerisi** (`suggestFormation`) — maç oluşturma ve düzenlemedeki formasyon seçici kaldırıldı. 3 senaryoda doğrulandı.
- [x] **Varyasyon geçişinde formasyon sıfırlanması** — DÜZELTİLDİ. `TeamVariant` artık ham bölünme tutuyor, diziliş seçim anında geçerli `formationA`/`formationB` ile kuruluyor.
- [x] **Nitelik formu scroll** — `KeyboardAwareScrollView` kaldırıldı; `KeyboardAvoidingView` + `flexShrink: 1`. Hem "en üste zıplama" hem "Kondisyon klavye altında" düzeldi.
- [x] **Profil mevki listeleri** — 6 mevki (Ön Libero + Forvet Arkası dahil), kod saklanıyor, `positionLabel()` ile gösteriliyor.
- [x] **Misafir eklerken mevki sorulmuyor** — nitelik formunda seçiliyor.
- [x] ~~Saha yerleştirmede mevki karışması~~ — TEST EDİLDİ, TAMAM.
- [x] ~~"Kadroları Açıkla" bayat state~~ — TEST EDİLDİ, TAMAM.

## Tamamlananlar (önceki oturumlar)
- [x] TestFlight rebuild 1.0.3 / build #8; `eas.json`'a `ascAppId` (169829) — otomatik non-interactive submit çalışıyor.
- [x] Nitelik girişi scroll zıplaması (ilk deneme), paylaşımda WhatsApp caption, maç oluşturunca home'a dönüş, ana takım / "takımda değilsiniz" bug'ı.
- [x] Maç otomatik bitince oylama gelmiyordu — kök neden + düzeltme (⏳ doğrulama bekliyor).
- [x] Nitelik sistemi sadeleştirildi (saha 6 ortak + kaleci 6); Kondisyon=çarpan; OVR ikincil harman; `migrateAttributeNames`.
- [x] Maç-sonu oylama sistemi (player_ratings migration; UI + kademeli OVR + atomik guard).
- [x] Takım scope açığı kapatıldı; Takımım kırmızı daire; 1.0.1 iOS build.
- [x] Mevki bazlı nitelik + ağırlıklı OVR; measureLayout hatası; maç saati 24 saat; maç sonu istatistik; misafir kadroya girişi.
