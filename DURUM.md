# DURUM — Halı Saha Uygulaması

> Bu dosya Claude Code'un kendi hafızasıdır. `/baslat` ile okunur, `/bitir` ile güncellenir.
> Her oturum sonunda güncel tutulur. Amaç: yeni oturumda projeye sıfırdan hakim olmak.

## Genel Durum
- **Proje**: Halı saha (amatör futbol) takım yönetim uygulaması
- **Stack**: Expo (React Native) + Supabase
- **Mimari**: Tek dosyada SPA-tarzı state navigasyonu — `app/(tabs)/index.tsx` (~2000+ satır)
- **Dağıtım**: iOS TestFlight'ta yayında. Android build sürüyor.
- **KRİTİK / yayın öncesi**: RLS (Row Level Security) hâlâ KAPALI — public yayından önceki en büyük iş. Tablolar: profiles, teams, team_members, polls, poll_votes, guest_players, notifications, team_invites, match_lineups.

## Oturmuş Sistemler (çalışıyor)
- Supabase şeması: 8+ tablo temiz kurulu (+ match_lineups kalıcı kadro için)
- RPC'ler: transfer_captaincy, leave_team, get_poll_summary; handle_new_user trigger
- Rol sistemi: captain / deputy / player (+ oyuncu detayında "Kaptan / Yardımcı Kaptan / Takım Üyesi" etiketi)
- İki adımlı maç oluşturma sihirbazı; maç saati artık tam 24 saat (00:00–23:30)
- Maç yaşam döngüsü: iptal = sil (cascade), arşiv = sakla (is_active=false)
- Kadro kurma: manuel + otomatik boşluk doldurma (güce göre havuzdan tamamlama)
- Misafir oyuncular kadroya girebiliyor (üye+misafir havuzu birleşik)
- Mevki bazlı nitelik sistemi + mevkiye göre AĞIRLIKLI OVR (0-99). "vizyon" ve "hareketlilik" nitelikleri kaldırıldı.
- Maç sonu istatistik girişi çalışıyor (şema blokajı çözüldü). Toplam gol istatistiği gösteriliyor.
- Pull-to-refresh tüm ekranlarda

## Mevki / Nitelik Mimarisi (kalıcı notlar)
- 6 mevki: Kaleci, Defans, Ön Libero, Orta Saha, Forvet Arkası, Forvet
- Her oyuncu: primary + secondary mevki. Nitelik seti = ortak + primary + secondary (union).
- Nitelikler tek bir `POSITION_ATTRIBUTES` sabitinde; ağırlıklar `POSITION_WEIGHTS` sabitinde.
- OVR = primary mevki ağırlıklarına göre niteliklerin ağırlıklı ortalaması. Nitelik değişince otomatik yeniden hesaplanır.
- **Kaleci = HİBRİT**: hem sabit mevki olarak seçilebilir, hem maç bazında "played_as_goalkeeper" işaretiyle o maçta kale koyan saha oyuncusu yakalanır.

## Devam Eden / Yarım Kalan İş
- **Otomatik maç-sonu oylama sistemi** (şu an inşa halinde). Verilmiş kararlar:
  - OVR güncelleme: KADEMELİ/yumuşak. `yeni = eski + K × (maç_ortalaması − eski)`, K ≈ 0.15–0.2, sabit ayar olarak tutulacak.
  - Oy veren/oylanan: SADECE o maçta sahada (lineup='field') oynayanlar.
  - Misafirler: OYLANABİLİR, oy VEREMEZ (hesapları yok).
  - Herkes kendisi hariç, mevkiye göre ilgili nitelikler üzerinden 10 üzerinden puanlar. Kaleci yapan için kalecilik nitelikleri de.
  - İşleme yeri: CLIENT-SIDE LAZY (mevcut computeOverall tek kaynak, Deno'ya kopyalama yok). Oylama penceresi 24 saat sonra kapanınca oylar toplanıp kademeli OVR güncellemesi yapılır.
  - **Atomik guard şart**: aynı maçın oyları iki kez işlenip OVR'ı iki kat kaydırmamalı (ratings_processed_at gibi bir işaret + idempotent).
  - Öngörülen tablo: player_ratings (match_id, voter_id, rated_player_id, attribute, score) + unique constraint (aynı kişi aynı oyuncuyu iki kez oylamasın).

## Çalışma Tarzı / Tercihler
- Kullanıcı Türkçe konuşur.
- İş bitince ayrıca "tamamlandı" mesajı ATMA — kullanıcı kendi test eder, geri bildirir.
- Büyük/mimari işlerde ÖNCE planı (şema, mantık) açıkla, ONAY alınca kodla. Körlemesine patch atma; tekrarlayan bir bug varsa önce kök nedeni veriyle (log) göster.
- Supabase migration'ları `npx supabase db push` ile kullanıcı tarafından uygulanır (DB şifresi Claude Code'da yok).
