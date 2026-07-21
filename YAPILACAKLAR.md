# YAPILACAKLAR — Halı Saha Uygulaması

> `/baslat` ile okunur, `/bitir` ile güncellenir. "Sonraya / Erken" bölümü = unutturma notları.

## Aktif (şu an üstünde çalışılan)
- [ ] **TestFlight submit — 1.0.1 / build #6**: EAS build çalıştı, otomatik submit `ascAppId` yokluğundan takıldı. Build bitince: `! eas submit -p ios --latest` (interaktif) VEYA `eas.json` submit.production'a `ascAppId` ekleyip non-interactive gönder.

## Bilinen Buglar (takip et — durumları belirsiz, test edilecek)
- [ ] Saha yerleştirmede mevki karışması (defans→orta saha, forvet→defans). Güçlü modele geçildi ama doğrulanmadı — test et. (NOT: nitelik seti sadeleştiği için deriveStats/posScore yeni adlarla çalışıyor, bir daha bakmak gerekebilir.)
- [ ] Yedek yerleştirme de mevkiye göre yapılıyor mu — doğrula.
- [ ] Gruba paylaşımda metin gitmiyor (sadece görsel). Talimat verildi, sonuç belirsiz — test et.
- [ ] "Kadroları Açıkla" bayat state — önceki oturumdan; scope düzeltmesiyle ilgili olabilir ama ayrıca test et.

## Sonraya / Erken (UNUTTURMA — şimdi yapma, ama hatırlat)
- [ ] **RLS'i aç** — public TestFlight/yayın ÖNCESİ zorunlu. Şu an kapalı. En kritik yayın-öncesi iş. (Erken: önce özellikler otursun.)
- [ ] **Mevcut oyuncuların OVR'ını toplu yeniden-hesapla** — nitelik sistemi değişti; eski satırların stored `overall_rating`'i ancak yeniden kaydedilince güncelleniyor. İstenirse "hepsini yeni sisteme çevir" butonu/script eklenebilir. (Açık soru — gerçek veri az olduğu için acil değil.)
- [ ] **eas.json'a `ascAppId` ekle** — kalıcı otomatik TestFlight submit için. Bir kez App Store Connect Apple ID'si girilince `--auto-submit --non-interactive` sorunsuz çalışır.
- [ ] **Sohbet / mesajlaşma özelliği** (emoji + GIF). Ayrı sistem: messages tablosu, realtime, emoji picker, Giphy/Tenor API. (Erken: en sona.)
- [ ] **guestVotesLocal kalıcılığı**: misafirin "Kesin Var" işareti uygulama kapanınca sıfırlanıyor. Kalıcı yapılsın mı? (Açık soru.)
- [ ] **POSITION_WEIGHTS ince ayarı** — yeni 6'lı sisteme göre makul varsayılanlarla kuruldu (SECONDARY_WEIGHT_FACTOR=0.5 dahil). Gerçek kullanım oturunca gözden geçir.
- [ ] **Kondisyon çarpan aralığı (~0.90–1.05) ve OVR sabiti K (0.18)** — gerçek oylama verisi gelince ayarla.
- [ ] **Supabase pause**: free tier 7 günde bir duraklıyor. Haftada 1 manuel dashboard girişiyle idare. Launch'a yakın Pro'ya geçiş düşünülebilir.

## Tamamlananlar (son oturum)
- [x] **Nitelik sistemi sadeleştirildi**: saha 6 ortak (Şut/Pas/Top Kontrolü/Markaj/Hız/Fiziksel Güç) + kaleci 6 (Uzanış/Tutuş/Dağıtım/Refleks/Hız/Pozisyon); ikincil mevki nitelik seti eklemez.
- [x] **Kondisyon = çarpan**: ayrı gösterim + OVR'a conditionFactor (~0.90–1.05, nötr 60).
- [x] **OVR ikincil mevki harmanı** (primary + 0.5×secondary); `computeOverall` artık secondary alıyor; eski nitelik adları `migrateAttributeNames` ile eşleniyor.
- [x] **Maç-sonu oylama sistemi çalışır hale geldi** (player_ratings migration push'landı; UI + kademeli OVR + atomik guard).
- [x] **Takım scope açığı kapatıldı** — `fetchActivePoll` aktif yoklama yokken sızan poll/kadro state'ini temizliyor (A'da oyuncu/B'de kaptan sızıntısı).
- [x] **Maç oluştur → geri** artık home'a gidiyor (yoklama ekranına değil).
- [x] **Takımım kırmızı daire** — oy vermediğin aktif yoklaması olan takımların yanında.
- [x] Sürüm 1.0.1'e yükseltildi, iOS build alındı.

## Tamamlananlar (önceki oturumlar)
- [x] Mevki bazlı nitelik sistemi + ağırlıklı OVR; "vizyon"/"hareketlilik" kaldırıldı
- [x] measureLayout hatası (KeyboardAwareScrollView); maç saati 24 saat
- [x] Maç sonu istatistik şema blokajı; oyuncu rol etiketi; toplam gol; misafir kadroya girişi
