# YAPILACAKLAR — Halı Saha Uygulaması

> `/baslat` ile okunur, `/bitir` ile güncellenir. "Sonraya / Erken" bölümü = unutturma notları.

## Aktif (şu an üstünde çalışılan)

> 📋 **Sıra `YOL_HARITASI.md`'de.** **Faz 0 ✅ · Faz 1.0 ✅ · Faz 1.1 ✅** → şu an **Faz 1.2**.
> 📐 Görsel şartname: https://claude.ai/code/artifact/5d60e8d8-7c61-43ed-870a-d7908f3d682c

- [ ] **▶️ SIRADAKİ İŞ — Faz 1.2: ortak bileşenler.** `Card`, `Button` (primary/secondary/ghost/danger), `Chip`, `SectionHeader`, `EmptyState`, `ListRow`, `Badge`, `Sheet`, `Segmented`, `Avatar`, `IconTile`. Şartnamenin "Bileşen Dili" bölümü birebir bunun tarifi. Hepsi `constants/theme.ts` token'larını kullanacak — inline hex/spacing YASAK.
- [ ] **Faz 1.3: emoji → `@expo/vector-icons`.** Zaten kurulu, yeni bağımlılık yok. `Icon` sarmalayıcı + emoji→ikon eşleme tablosu. (Emoji ikonlar şu an en büyük "amatör" sinyali.)
- [ ] **Faz 1.4: i18n iskeleti.** `i18n/tr.ts`, `i18n/en.ts` (boş başlar), `useT()`, `@lang` AsyncStorage + cihaz dili varsayılanı. Bu andan sonra yazılan/yenilenen HER string `t()` ile.
- [ ] **Faz 1.5: `screens/` deseni** — ilk ekran çıkarılarak ispatlanır.
- [ ] **Faz 2.1: Ayarlar ekranı** — ilk gerçek ekran. Aynı anda tasarımı, i18n'i ve Tier 0'ı (Hesabı Sil + Gizlilik/Koşullar/Destek) ispatlıyor.

### Faz 1 boyunca dikkat
- [ ] **Gündüz okunabilirliği testi (YÜKSEK RİSK)** — koyu kimliğin tek gerçek zayıflığı. Uygulama sahada, açık havada, bazen güneş altında açılıyor. İlk ekran bittiğinde **dışarıda** bakılmalı. Sorun çıkarsa zemini bir kademe açmak yeter; token'lar semantik olduğu için ekranlar yeniden yazılmaz.
- [ ] **`team.B` (#10B981) / `success` (#22E07A) / koyu yeşil zemin çakışması** — A/B ayrımı saha ekranında okunaklı kalıyor mu, Faz 2.6'da doğrula. Takım renkleri sabit → çözüm rengi değil MUAMELEYİ değiştirmek (dolu rozet + koyu metin).
- [ ] **Paylaşım görseli koyu zeminde** — WhatsApp'ta çoğu kişi açık temada bakıyor; çim dokusu ve ışıma sıkıştırmadan sonra nasıl duruyor, gerçek paylaşımla test et.
- [ ] **CLAUDE.md güncellemesi** — "tek dosya SPA" mimari notu, her ekran `screens/` altına çıktıkça güncellenmeli.

## Bilinen Buglar (takip et — durumları belirsiz, test edilecek)
- [ ] **⏳ Otomatik maç-sonu oylama doğrulaması**: Otomatik bitiş düzeltmesi kodlandı ama geçmişe-dönük kurulan maçta tetiklenmiyor gibi. **İleri saatte gerçek bir maç** kurup, saati geçince oylamanın otomatik geldiğini doğrula. Test aşamasındaki arkadaşlardan feedback al. (Kod: `fetchActivePoll` zaman aşımı dalı + `onRefresh` home.)
- [ ] **Yedek yerleştirme mevkiye göre yapılıyor mu** — hâlâ test edilmedi. Tek açık yerleştirme testi.
- [ ] **`match_lineups`'a hiç `bench` satırı yazılmamış** — bu oturumda veri incelenirken fark edildi: 24 açıklanmış kadronun HEPSİ sadece `lineup='field'`, tek bir bench satırı yok. DURUM.md eskiden "field/bench yazılır" diyordu ama veri öyle demiyor. Yukarıdaki yedek yerleştirme maddesiyle ilgili olabilir — `saveLineupToSupabase`'e bakılacak.

## Sıradaki İşler (acelesi yok ama sırada)
- [ ] **Oyuncu detay menüsü UI**: Oyuncuya tıklayınca açılan menü referans görseldeki gibi görünmeli — mevcut UI kötü. ✅ **Referans görseller artık var**: `SS/referans/` (Altıpas v2.0.0, 24 ekran). → **Faz 2.7'de** yapılacak.
- [ ] **Maç hatırlatıcı bildirimi**: Maç saati yaklaşınca push/local bildirim. Kaç saat önce ve açık/kapalı kullanıcı ayarı olmalı. (expo-notifications local schedule; ayar `@pollSettings` benzeri saklanır.) → **Faz 3.1'de** yapılacak.

## Sonraya / Erken (UNUTTURMA — şimdi yapma, ama hatırlat)

### Yol haritasından gelenler (sırası `YOL_HARITASI.md`'de, burada unutturma notu)
- [ ] **Tier 0 — yayın öncesi ZORUNLU** (→ Faz 2.1'de Ayarlar ekranına gömülü yapılacak):
  - **Hesabı Sil** — Apple Guideline 5.1.1(v). Yoksa App Store **reddeder**. UI + cascade silen RPC birlikte.
  - Gizlilik Politikası + Kullanım Koşulları + Destek linkleri.
- [ ] **Tier 1 — Faz 2/3'e dağıtıldı**: onboarding carousel + bildirim izni priming (3.2), granular bildirim ayarları (3.1), boş durum kartları + "örnek maça bak" (2.3), profil tamamlanma halkası (2.2), profil zenginleştirme — fotoğraf/emoji avatar, @kullanıcı adı, isim gösterimi, doğum yılı, şehir/ilçe (2.2), Maçlar ekranı Aktif/Geçmiş + skor kartı (2.8), bildirim merkezi (2.9), davet kodu kartı (2.3).
- [ ] **Tier 2 — Faz 5, ağa girmeden değer üretenler** (Erken: önce tasarım ve i18n otursun):
  - 🔥 **Hızlı Maç Kur** — kadro listesini yapıştır → takımlar hazır. **En değerli çalma adayı**: çeşitlilik algoritmamızın vitrini, kayıtsız denenebilir, paylaşıma uygun.
  - MVP oylaması (nitelik oylaması var, MVP kavramı yok — tek dokunuş, katılım artırır)
  - Mini lig / sezon tablosu · Kadro Dene · "boş gün" modülü (penaltı/tahmin tarzı)
- [ ] **Tier 3 — Faz 7 ağ katmanı. RLS OLMADAN BAŞLANMAZ.** Sıra dar ihtiyaçtan geniş olana: **Eksik Var** (tek maçlık eksik oyuncu ilanı — ağa buradan girilir, Transfer Pazarı'ndan değil) → Rakip Bul → Topluluklar/Keşfet → Sohbet → videolu Transfer Pazarı → uzak push altyapısı. (Erken: boş bir pazaryeri, pazaryeri olmamasından kötüdür.)
- [ ] **i18n EN çevirisi** (Faz 4) — makine çevirisi + gözden geçirme mi, elle mi? Karar verilmedi, şu an bloklamıyor.
- [ ] **Açık tema** — "Saha Gecesi" koyu bir kimlik; açık tema İSTENİRSE opsiyonel eklenti olarak sonradan gelir. Token'lar semantik yazıldığı için ekranlar yeniden yazılmaz. (Erken: önce koyu kimlik gerçek kullanımda otursun.)

### Diğer
- [ ] **RLS'i aç** — public TestFlight/yayın ÖNCESİ zorunlu, **Faz 6**. Şu an kapalı. En kritik yayın-öncesi iş. (Erken: önce özellikler otursun. NOT: 2026-08-16 oturumunda da gerçek veriyi anon key ile REST üzerinden okuyabildik — kapalı olduğunun canlı kanıtı.)
  - **Bu turda `team_logos` storage policy'lerini de daralt**: şu an "giriş yapmış herkes yazabilir". Olması gereken: sadece o takımın kaptanı/yardımcısı `teamId/` klasörüne yazabilsin. (`supabase/migrations/20260801120000_team_identity.sql` içine not düşüldü.)
- [ ] **Mevcut oyuncuların OVR'ını toplu yeniden-hesapla** — nitelik sistemi değişti; eski satırların stored `overall_rating`'i ancak yeniden kaydedilince güncelleniyor. (Açık soru — gerçek veri az olduğu için acil değil.)
- [ ] **Eski profillerin `main_position`'ı** — artık SkillPosition KODU saklanıyor (`ON_LIBERO`). Eskiden `DEF`/`FOR` kaydedilmiş profillerde profil ekranında hiçbir chip seçili görünmez, kullanıcı bir kez yeniden seçmeli. İşlevsel etkisi yok (takım kurma `team_members.primary_position` kullanıyor). İstenirse tek seferlik eşleme scripti yazılabilir.
- [ ] **Çeşitlilik/varyasyon sabitlerinin ince ayarı** — gerçek kullanım oturunca gözden geçir: `DIVERSITY_LAMBDA` (off 0 / mid 8 / high 20), `VARIANT_SPREAD = 15`, `VARIANT_COUNT = 3`, `VARIANT_RESTARTS = 150`, `PAIR_HISTORY_MATCHES = 3`, `PAIR_DECAY = 0.65`. Varyasyon sayısını 4'e çıkarmak için sadece `VARIANT_COUNT` yeter, UI kendini ona göre çiziyor.
- [ ] **Formasyon öneri sabitlerinin ince ayarı** — `SHORTAGE_WEIGHT.DEF = 1.5`, `EXTRA_STRIKER_COST = 3`, `NO_COVER_COST = 3`. Üç senaryoda doğrulandı ama gerçek kullanımda gözden geçir.
- [ ] **`react-native-keyboard-aware-scroll-view` bağımlılığı** — kodda artık HİÇ kullanılmıyor, `package.json`'da duruyor. Temizlik istenirse kaldırılabilir (aceleye gerek yok).
- [ ] **Sohbet / mesajlaşma özelliği** (emoji + GIF). Ayrı sistem: messages tablosu, realtime, emoji picker, Giphy/Tenor API. (Erken: en sona → **Faz 7.4**.)
- [ ] **guestVotesLocal kalıcılığı**: misafirin "Kesin Var" işareti uygulama kapanınca sıfırlanıyor. Kalıcı yapılsın mı? (Açık soru.)
- [ ] **POSITION_WEIGHTS ince ayarı** — yeni 6'lı sisteme göre makul varsayılanlarla kuruldu (SECONDARY_WEIGHT_FACTOR=0.5 dahil). Gerçek kullanım oturunca gözden geçir.
- [ ] **Kondisyon çarpan aralığı (~0.90–1.05) ve OVR sabiti K (0.18)** — gerçek oylama verisi gelince ayarla.
- [ ] **Supabase pause**: free tier 7 günde bir duraklıyor. Haftada 1 manuel dashboard girişiyle idare. Launch'a yakın Pro'ya geçiş düşünülebilir.

## Tamamlananlar (2026-08-16)
- [x] **Rakip analizi — Altıpas v2.0.0** — 24 ekran incelendi (`SS/referans/`). Onlar pazaryeri/sosyal ağ, biz araç. Biz algoritma derinliğinde öndeyiz, onlar ürün olgunluğu + dağıtımda 2-3 tur önde. Tutma olasılığı: onboard takımda %60-70, organik %10-15.
- [x] **`YOL_HARITASI.md`** — Faz 0-7 uygulama sırası, gerekçeleriyle. İki temel karar: i18n altyapısı başta/çevirisi sonda; Tier 0 ayrı faz değil Ayarlar'a gömülü.
- [x] **Faz 0 kapatıldı** — Bekleyen sanılan migration ve build'in ZATEN yapılmış olduğu doğrulandı (dokümanlar bayattı, düzeltildi). İki özellik test edildi, çalışıyor.
- [x] **`checkpoint-2026-08-16-01`** — tasarım turundan önceki son temiz hal.
- [x] **Faz 1.0 — "Saha Gecesi" kimliği seçildi.** Koyu tema ayrı bir mod değil, kimliğin kendisi.
- [x] **Faz 1.1 — `constants/theme.ts` token sistemi.** Semantik renkler, spacing, radius, elevation, tipografi ölçeği, `alpha()`. `tsc` temiz.
- [x] **Görsel şartname yayımlandı** — palet + tipografi + bileşen dili + ana ekran/saha maketleri.
- [x] ~~Bekleyen migration~~ / ~~build #9'da olmayan iki özellik~~ / ~~1.0.6 testi~~ — üçü de kapandı (yukarıda).

## Tamamlananlar (2026-07-31 / 08-01)
- [x] **Eksik kadroyu yedeklerden otomatik tamamlama** (`fillFieldPool`) — "Kesin Var" kapasiteden azken saha eksik kuruluyordu ve yedekler hiç kullanılmıyordu. Artık mevki ihtiyacına göre dolduruluyor; denge `buildTeamVariants` aşamasında zaten kuruluyor. Gerçek veriyle test edildi (9/11/14 kişilik senaryolar).
- [x] **Takımım'da oyuncu çıkarma** — üye `⋯` menüsü `amIManager`'a açıldı; yetki devri işlemleri (yardımcı yap / yetkisini al / kaptanlığı devret) kaptanda kaldı, yardımcı kaptanı çıkaramıyor.
- [x] **Joker (misafir) silme** — sıfırdan yazıldı, iki modlu: geçmişi olmayan sert, geçmişi olan yumuşak (`is_active=false`). `match_lineups.guest_id` FK'sı doğrulandı; sert silme geçmiş kadroları ve çeşitlilik algoritmasının verisini bozardı. Migration `20260801160000_guest_soft_delete.sql`.
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
