# YAPILACAKLAR — Halı Saha Uygulaması

> `/baslat` ile okunur, `/bitir` ile güncellenir. "Sonraya / Erken" bölümü = unutturma notları.

## Aktif (şu an üstünde çalışılan)
- [ ] **⏳ TestFlight işleme — 1.0.3 / build #8**: Submit başarılı, Apple "Processing" sürecinde. Bitince (email) TestFlight'ta test et. Yeni build almak gerekirse tek komut: `! eas build -p ios --profile production --auto-submit --non-interactive`.

## Bilinen Buglar (takip et — durumları belirsiz, test edilecek)
- [ ] **⏳ Otomatik maç-sonu oylama doğrulaması**: Otomatik bitiş düzeltmesi kodlandı ama geçmişe-dönük kurulan maçta tetiklenmiyor gibi. **İleri saatte gerçek bir maç** kurup, saati geçince oylamanın otomatik geldiğini doğrula. Test aşamasındaki arkadaşlardan feedback al. (Kod: `fetchActivePoll` zaman aşımı dalı + `onRefresh` home.)
- [ ] Saha yerleştirmede mevki karışması (defans→orta saha, forvet→defans). Güçlü modele geçildi ama doğrulanmadı — test et. (NOT: nitelik seti sadeleştiği için deriveStats/posScore yeni adlarla çalışıyor, bir daha bakmak gerekebilir.)
- [ ] Yedek yerleştirme de mevkiye göre yapılıyor mu — doğrula.
- [ ] "Kadroları Açıkla" bayat state — önceki oturumdan; scope düzeltmesiyle ilgili olabilir ama ayrıca test et.

## Sıradaki İşler (acelesi yok ama sırada)
- [ ] **Oyuncu detay menüsü UI**: Oyuncuya tıklayınca açılan menü referans görseldeki gibi görünmeli — mevcut UI kötü. (⚠️ Referans görsel işe başlarken kullanıcıdan alınacak — görsel olmadan başlanamaz.)
- [ ] **Takım logosu + "Takımım" özelleştirme**: Takım logosu oluşturma/yükleme, "Takımım" ekranını özelleştirme (isim, renk, logo). (Supabase storage bucket + teams tablosuna logo_url gerekebilir.)
- [ ] **Maç hatırlatıcı bildirimi**: Maç saati yaklaşınca push/local bildirim. Kaç saat önce ve açık/kapalı kullanıcı ayarı olmalı. (expo-notifications local schedule; ayar `@pollSettings` benzeri saklanır.)

## Sonraya / Erken (UNUTTURMA — şimdi yapma, ama hatırlat)
- [ ] **RLS'i aç** — public TestFlight/yayın ÖNCESİ zorunlu. Şu an kapalı. En kritik yayın-öncesi iş. (Erken: önce özellikler otursun.)
- [ ] **Mevcut oyuncuların OVR'ını toplu yeniden-hesapla** — nitelik sistemi değişti; eski satırların stored `overall_rating`'i ancak yeniden kaydedilince güncelleniyor. İstenirse "hepsini yeni sisteme çevir" butonu/script eklenebilir. (Açık soru — gerçek veri az olduğu için acil değil.)
- [ ] **Sohbet / mesajlaşma özelliği** (emoji + GIF). Ayrı sistem: messages tablosu, realtime, emoji picker, Giphy/Tenor API. (Erken: en sona.)
- [ ] **guestVotesLocal kalıcılığı**: misafirin "Kesin Var" işareti uygulama kapanınca sıfırlanıyor. Kalıcı yapılsın mı? (Açık soru.)
- [ ] **POSITION_WEIGHTS ince ayarı** — yeni 6'lı sisteme göre makul varsayılanlarla kuruldu (SECONDARY_WEIGHT_FACTOR=0.5 dahil). Gerçek kullanım oturunca gözden geçir.
- [ ] **Kondisyon çarpan aralığı (~0.90–1.05) ve OVR sabiti K (0.18)** — gerçek oylama verisi gelince ayarla.
- [ ] **Supabase pause**: free tier 7 günde bir duraklıyor. Haftada 1 manuel dashboard girişiyle idare. Launch'a yakın Pro'ya geçiş düşünülebilir.

## Tamamlananlar (son oturum — 2026-07-30/31)
- [x] **TestFlight rebuild — 1.0.3 / build #8** — version 1.0.2→1.0.3 bump + commit/push; `--auto-submit --non-interactive` ile build+submit tek komutta başarılı (ascAppId ekli). Apple işleme sürecinde.
- [x] **eas.json'a `ascAppId` ekle** — TAMAM (169829). Otomatik non-interactive submit artık çalışıyor.

## Tamamlananlar (2026-07-24)
- [x] **Nitelik girişi scroll zıplaması** — DÜZELTİLDİ + TEST EDİLDİ. `KeyboardAwareScrollView` otomatik kaydırması kapatıldı; `onLayout` y + odaklanınca üst-ortaya elle kaydırma.
- [x] **Paylaşımda WhatsApp grup caption'ı düşürüyor** — DÜZELTİLDİ + TEST EDİLDİ. Maç bilgisi saha görselinin içine şerit olarak basılıyor (`FullField` `matchInfo` prop + `buildShareInfo()`).
- [x] **Maç oluşturunca ana ekrana dön** — DÜZELTİLDİ + TEST EDİLDİ. "Yoklamayı Başlat" `setScreen('home')`.
- [x] **Ana takım / "takımda değilsiniz" bug'ı** — DÜZELTİLDİ (kullanıcı test edecek). `fetchMyTeam` `.single()` kaldırıldı, kalıcı `@mainTeamId` mimarisi (tek takım otomatik, çok takım kalıcı ana takım; oluştur/katıl/ayrıl akışları güncellendi).
- [x] **Maç otomatik bitince oylama gelmiyordu** — KÖK NEDEN + DÜZELTİLDİ (⏳ ileri saatli gerçek maçla doğrulanacak — Bilinen Buglar'a bakılacak). `fetchActivePoll` zaman aşımında `is_finished`+`finished_at` yazıyor; pull-to-refresh'e `fetchOpenRatingMatch` eklendi.

## Tamamlananlar (önceki oturumlar)
- [x] Nitelik sistemi sadeleştirildi (saha 6 ortak + kaleci 6; ikincil mevki set eklemez); Kondisyon=çarpan; OVR ikincil harman; `migrateAttributeNames`.
- [x] Maç-sonu oylama sistemi (player_ratings migration; UI + kademeli OVR + atomik guard).
- [x] Takım scope açığı kapatıldı; maç oluştur→geri home; Takımım kırmızı daire; 1.0.1 iOS build.
- [x] Mevki bazlı nitelik + ağırlıklı OVR; measureLayout hatası; maç saati 24 saat; maç sonu istatistik; misafir kadroya girişi.
