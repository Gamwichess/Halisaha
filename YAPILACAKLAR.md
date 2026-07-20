# YAPILACAKLAR — Halı Saha Uygulaması

> `/baslat` ile okunur, `/bitir` ile güncellenir. "Sonraya / Erken" bölümü = unutturma notları.

## Aktif (şu an üstünde çalışılan)
- [ ] Otomatik maç-sonu performans oylaması (kararlar DURUM.md'de). Adımlar:
  - [ ] Migration: player_ratings tablosu + unique constraint + ratings_processed_at guard
  - [ ] Oylama UI'ı: maç sonu, kendisi hariç saha oyuncuları, mevkiye göre nitelikler, 10'luk puanlama
  - [ ] Kaleci hibrit: o maçta played_as_goalkeeper işaretli oyuncuya kalecilik nitelikleri de sorulsun
  - [ ] Pencere kapanınca (24 saat) client-side lazy kademeli OVR güncellemesi (atomik guard'lı)

## Bilinen Buglar (takip et — durumları belirsiz, test edilecek)
- [ ] "Kadroları Açıkla" bayat state: önceki maç iptal edilip yeni maç açılınca buton yanlış aktif geliyordu. Teşhis edildi, çözüldü mü belirsiz — test et.
- [ ] Saha yerleştirmede mevki karışması (defans→orta saha, forvet→defans). Birkaç kez denendi, güçlü modele geçildi. Doğrulanmadı — test et.
- [ ] Yedek yerleştirme de mevkiye göre yapılmıyordu — saha ile aynı mantığa çekildi mi doğrula.
- [ ] Gruba paylaşımda metin gitmiyor (sadece görsel). Talimat verildi, sonuç belirsiz — test et.

## Sonraya / Erken (UNUTTURMA — şimdi yapma, ama hatırlat)
- [ ] **RLS'i aç** — public TestFlight/yayın ÖNCESİ zorunlu. Şu an kapalı. En kritik yayın-öncesi iş. (Erken: önce özellikler otursun.)
- [ ] **Sohbet / mesajlaşma özelliği** (emoji + GIF destekli). Ayrı sistem: messages tablosu, realtime subscription, emoji picker, GIF için Giphy/Tenor API. (Erken: en sona bırakıldı, diğer işler bitince.)
- [ ] **guestVotesLocal kalıcılığı**: misafirin "Kesin Var" işareti uygulama kapanınca sıfırlanıyor. Gerçek üye oyu gibi kalıcı yapılsın mı? (Açık soru — oylama sistemi oturunca değerlendir.)
- [ ] **Mevki ağırlıkları (POSITION_WEIGHTS) ince ayarı** — ilk sürüm makul varsayılanlarla kuruldu, denge oturunca gözden geçir.
- [ ] **OVR kademeli güncelleme sabiti K** — 0.15–0.2 ile başla, gerçek oylama verisi gelince ayarla.
- [ ] **Supabase pause**: free tier 7 günde bir duraklıyor. Şimdilik haftada 1 manuel dashboard girişiyle idare ediliyor. Gerçek kullanıcı trafiği başlayınca sorun kendiliğinden çözülebilir; launch'a yakın Pro'ya geçiş düşünülebilir.

## Tamamlananlar (son oturumlar)
- [x] Mevki bazlı nitelik sistemi + ağırlıklı OVR
- [x] "vizyon" ve "hareketlilik" nitelikleri kaldırıldı
- [x] measureLayout hatası (KeyboardAwareScrollView'e geçildi)
- [x] Maç saati 24 saat yapıldı
- [x] Maç sonu istatistik şema blokajı çözüldü
- [x] Oyuncu rol etiketi (Kaptan/Yardımcı Kaptan/Takım Üyesi)
- [x] Toplam gol istatistiği gösterimi
- [x] Misafir oyuncular kadroya girebiliyor (üye+misafir havuzu birleşik)
