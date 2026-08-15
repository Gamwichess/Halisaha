# DURUM — Halı Saha Uygulaması

> Bu dosya Claude Code'un kendi hafızasıdır. `/baslat` ile okunur, `/bitir` ile güncellenir.
> Her oturum sonunda güncel tutulur. Amaç: yeni oturumda projeye sıfırdan hakim olmak.

## Genel Durum
- **Proje**: Halı saha (amatör futbol) takım yönetim uygulaması
- **Stack**: Expo (React Native) + Supabase
- **Mimari**: Tek dosyada SPA-tarzı state navigasyonu — `app/(tabs)/index.tsx` (~5600 satır)
- **Dağıtım**: iOS TestFlight'ta yayında. Son build **1.0.6 / build #10** (build ID `58089836`), commit `68cd0c0`'dan 2026-08-01'de alındı, durum `FINISHED`. Bu build **eksik kadroyu yedeklerden otomatik tamamlama + oyuncu çıkarma/joker silme** özelliklerini İÇERİYOR. ⏳ Henüz test edilmedi. `eas.json`'da `ascAppId: 169829` ekli → `eas build -p ios --profile production --auto-submit --non-interactive` tek komutla build+submit yapıyor. `/guncelle` artık sürümü sormadan patch +1 yapıp commit/push ediyor.
- **KRİTİK / yayın öncesi**: RLS (Row Level Security) hâlâ KAPALI — public yayından önceki en büyük iş. Tablolar: profiles, teams, team_members, polls, poll_votes, guest_players, notifications, team_invites, match_lineups, player_ratings.

## Oturmuş Sistemler (çalışıyor)
- Supabase şeması: 9+ tablo temiz kurulu (+ player_ratings maç-sonu oylama için)
- RPC'ler: transfer_captaincy, leave_team, get_poll_summary; handle_new_user trigger
- Rol sistemi: captain / deputy / player (+ oyuncu detayında etiket)
- İki adımlı maç oluşturma sihirbazı; maç saati tam 24 saat
- Maç yaşam döngüsü: iptal = sil (cascade), arşiv = sakla (is_active=false); maç bitir = MatchStatsScreen `is_finished=true` + `finished_at` set eder
- Kadro kurma: manuel + otomatik boşluk doldurma; kadro açıklanınca `match_lineups`'a yazılır
- Misafir oyuncular kadroya girebiliyor (üye+misafir havuzu birleşik)
- **Maç-sonu performans oylaması ÇALIŞIYOR**. Saha oyuncuları birbirini niteliklerinden 10 üzerinden puanlar; pencere 24 saat açık; kapanınca OVR kademeli güncellenir (atomik guard'lı).
- **Sadeleştirilmiş nitelik sistemi + Kondisyon çarpanı** (aşağıda mimari not)
- Maç sonu istatistik girişi + toplam gol gösterimi; pull-to-refresh tüm ekranlarda
- Çok takımlı kullanım: takım scope'u düzgün izole; **ana takım seçimi** kalıcı (`@mainTeamId`)
- **Takım çeşitliliği + varyasyon sistemi ÇALIŞIYOR** (bu oturum — aşağıda mimari not)
- **Otomatik formasyon önerisi ÇALIŞIYOR** (aşağıda mimari not)
- **Takım kimliği ÇALIŞIYOR** (logo + isim + marka rengi; migration uygulandı, kullanıcı test etti — aşağıda mimari not)
- **Tasarım sistemi KURULDU** — "Saha Gecesi" kimliği + `constants/theme.ts` token'ları (henüz hiçbir ekrana uygulanmadı; aşağıda mimari not)

## Son Oturumda Yapılanlar (2026-08-16)
Bu oturumda **koda neredeyse hiç dokunulmadı** — strateji, planlama ve tasarım altyapısı oturumuydu. Tek kod değişikliği `constants/theme.ts`.

1. **Rakip analizi** — Kullanıcı `SS/referans/` altına **Altıpas v2.0.0**'ın 24 ekranını koydu; hepsi incelendi. Altıpas bir takım yönetim aracı DEĞİL, yerel futbol **pazaryeri/sosyal ağı** (Transfer Pazarı, Rakip Bul, Oyuncu Bul, Topluluklar, turnuvalar). Ölçek sinyali: Ankara'da 842 oyuncu, 101 rakip ilanı.
2. **Karşılaştırmalı değerlendirme** — Biz algoritma derinliğinde (çeşitlilik, formasyon, OVR) öndeyiz; onlar ürün olgunluğu ve dağıtımda 2-3 tur önde (onboarding, i18n, Hesabı Sil, granular bildirim, boş durumlar, gerçek ikon seti). Tutma olasılığı tahmini: onboard olan takımda %60-70, organik yayılma %10-15 (ağ etkisi yok, yalnız kullanıcı için 1. gün değeri sıfır). **Stratejik karar: pazaryerini taklit ETME**, "en adil kadroyu kuran uygulama" konumlandırmasında derinleş.
3. **`YOL_HARITASI.md` oluşturuldu** — Faz 0-7 uygulama sırası. Aşağıda "Yol Haritası" notu.
4. **Faz 0 kapatıldı** — Bekleyen sanılan iki iş aslında YAPILMIŞTI, dokümanlar bayattı: migration REST ile doğrulandı (kolon var), 1.0.6/#10 build'i EAS'te `FINISHED` bulundu. Kullanıcı iki özelliğin test edildiğini ve çalıştığını doğruladı.
5. **`checkpoint-2026-08-16-01`** — tasarım turundan önceki son temiz hal, push edildi.
6. **Faz 1.0 — "Saha Gecesi" kimliği seçildi.** Üç yön sunuldu (saha gecesi / stadyum / mahalle), koyu-sinematik seçildi. Aşağıda mimari not.
7. **Faz 1.1 — `constants/theme.ts` token sistemine dönüştürüldü.** `tsc` temiz.
8. **Görsel şartname yayımlandı** (palet + tipografi + bileşen dili + ana ekran/saha maketleri): https://claude.ai/code/artifact/5d60e8d8-7c61-43ed-870a-d7908f3d682c

## Geçmiş Oturumlar (özet)
- **2026-07-31 / 08-01**: Takım çeşitliliği sistemi (asıl büyük iş) + V1/V2/V3 varyasyon seçimi + otomatik formasyon önerisi + "Dengeli/Rastgele Kur" tek butona indirildi. Takım kimliği (logo/isim/renk, migration uygulandı). Nitelik formu scroll düzeltmesi (`KeyboardAwareScrollView` kaldırıldı). Profil mevki listeleri 6'lı `SKILL_POSITIONS`'a geçti + `positionLabel()`. Misafir eklerken mevki sorulmuyor. `fillFieldPool` (eksik kadroyu yedeklerden tamamlama). Oyuncu çıkarma / joker silme (iki modlu). `/checkpoint` komutu + `/guncelle` sürüm bump düzeltmesi. TestFlight 1.0.5/#9. Tümünün mimari notları aşağıda.
- **2026-07-30/31**: TestFlight rebuild 1.0.2→1.0.3, build #8 alındı ve `--auto-submit --non-interactive` ile ASC'ye submit edildi (`ascAppId: 169829` sayesinde sorunsuz).
- **2026-07-24**: Maç otomatik bitince oylama gelmeme bug'ının kök nedeni bulundu+düzeltildi (⏳ hâlâ doğrulanacak); pull-to-refresh'e `fetchOpenRatingMatch`; nitelik girişi scroll zıplaması (bu oturumda tamamen elden geçti); paylaşımda maç bilgisi saha görseline şerit olarak basıldı; maç oluşturunca home'a dönüş; ana takım / "takımda değilsiniz" bug'ı (`@mainTeamId` mimarisi).

## Yol Haritası Mimarisi (kalıcı notlar — YENİ)
Sıralamanın gerekçeleri; `YOL_HARITASI.md` fazların kendisini tutar, buradakiler NEDEN öyle sıralandığı.
- **Konumlandırma kararı**: Altıpas'ın pazaryeri modeli TAKLİT EDİLMEYECEK. Boş bir pazaryeri, pazaryeri olmamasından kötüdür ve onların 842 oyunculuk topluluğuyla aynı tahtada oynamak kaybedilen bir savaş. Bizim savunulabilir yerimiz **"en adil kadroyu kuran uygulama"** — çeşitlilik + formasyon + OVR algoritmaları. Altıpas bunu bir eğlence modülü ("Kadro Dene") olarak pazarlıyor, biz ürünün tamamı yapmışız.
- **i18n altyapısı BAŞTA, çevirisi SONDA.** İkisi de aynı 5.879 satıra dokunuyor. Altyapı tek dosyalık ucuz bir iş (Faz 1.4); Faz 2'den itibaren yenilenen her ekran doğrudan `t()` ile yazılıyor — o JSX zaten baştan yazıldığı için marjinal maliyet ~sıfır. Faz 4 yalnızca dokunulmamış artıkları süpürüp EN'i dolduruyor. İngilizceyi başa almak da sona bırakmak da aynı satırlara iki kez dokunmak demekti.
- **Tier 0 ayrı faz DEĞİL, Ayarlar ekranına gömülü** (Faz 2.1). Hesabı Sil / Gizlilik / Koşullar / Destek zaten orada yaşıyor. **RLS istisna** — Faz 6, ağ katmanından hemen önce: özellikler otururken policy yazmak her yeni tabloda borç üretir, ama ağ = başkalarının verisi, RLS'siz asla.
- **`index.tsx` ekran yenilendikçe bölünüyor** (big-bang refactor YOK). Her ekran yeniden yazılırken `screens/` altına taşınıyor; her adım bağımsız test edilebilir. Hedef: `screens/`, `components/ui/`, `i18n/`. **CLAUDE.md'deki "tek dosya SPA" notu her bölmede güncellenmeli.**
- **Faz 2 ekran sırası**: küçük/izole → çok görülen → en özenli. Ayarlar ilk, çünkü en ucuz yerde üç şeyi birden ispatlıyor (tasarım + i18n + Tier 0). Saha/kadro ekranı en son, çünkü "wow" ekranı ve paylaşım görseli oradan çıkıyor.
- **Bildirim motoru onboarding'den ÖNCE** (Faz 3.1 → 3.2): iOS izni bir kez sorar, priming ancak izin isteyecek bir şey varsa anlamlı.
- **Tutma olasılığı tahmini** (2026-08-16): onboard olan takımda %60-70, organik yayılma %10-15. Ağ etkisi yok, yalnız indiren kullanıcı için 1. gün değeri sıfır. Yayın hijyeni (Hesabı Sil, push, boş durumlar, RLS) düzelirse ikincisi %30-35.

## Tasarım Sistemi — "Saha Gecesi" (kalıcı notlar — YENİ)
- **Kimlik**: gece oynanan halı saha maçı. Koyu yeşil-siyah zemin, floodlight lime vurgu (`#C6FF3D`), yüksek kontrast, sinematik. 2026-08-16'da seçildi (Faz 1.0).
- **⚠️ KOYU TEMA AYRI BİR MOD DEĞİL — kimliğin kendisi.** "Açık tema + opsiyonel koyu" değil; uygulama koyu. İleride istenirse AÇIK tema opsiyonel eklenti olur. Renkler bu yüzden semantik isimlerle tanımlı (`bg`/`surface`/`text`/`accent`), ham hex değil — ikinci tema eklemek ekranları yeniden yazmayı gerektirmesin.
- **Tek kaynak `constants/theme.ts`**: `colors`, `team`, `spacing`, `radius`, `elevation`, `type`, `motion`, `alpha()`. **Ekranlarda inline hex/spacing YAZILMAZ.**
- **Nötrler gri DEĞİL** — hepsinde çim yeşili tonu var, böylece zemin "koyu arayüz" değil "gece sahası" okunuyor.
- **Koyu temada gölge çalışmaz** (siyah zeminde siyah gölge görünmez). Yükseklik iki şeyle verilir: yüzeyi bir kademe açmak + ince kenar çizgisi. `elevation.flat` / `.raised` bunu yapar. `elevation.glow` yalnızca birincil eylemde — iOS'ta `shadowColor`, Android renkli gölgeyi desteklemediği için orada kenarla telafi ediliyor.
- **Lime çok parlak**: üzerine yazılan metin KOYU olmalı (`colors.accentInk`), beyaz değil.
- **Tipografi** şu an sistem fontu (SF Pro / Roboto) ağır kesimlerle — sıfır bağımlılık. `type.display` slotu ileride kondense başlık fontu takmak için ayrıldı (`expo-font` zaten kurulu), tek yerden değişir.
- **Eski `Colors`/`Fonts` export'ları duruyor** — Expo şablonundan kalan `explore.tsx`, `modal.tsx`, `themed-text`, `themed-view` onları import ediyor. Uygulama kullanmıyor; o dosyalar temizlenince silinecek.
- 📐 Görsel şartname: https://claude.ai/code/artifact/5d60e8d8-7c61-43ed-870a-d7908f3d682c
- **⚠️ DOĞRULANACAK RİSKLER**:
  - **Gündüz okunabilirliği (YÜKSEK)** — uygulama sahada, açık havada, bazen güneş altında açılıyor. İlk gerçek test DIŞARIDA yapılmalı. Sorun çıkarsa zemini bir kademe açmak yeter; token'lar semantik olduğu için ekranlar yeniden yazılmaz.
  - **`team.B` (#10B981) yeşili**, `colors.success` (#22E07A) ve koyu yeşil saha zeminiyle aynı ailede. A/B ayrımı Faz 2.6'da doğrulanacak. Takım renkleri sabit → çözüm rengi değil MUAMELEYİ değiştirmek (dolu rozet + koyu metin).
  - **Paylaşım görseli** koyu zeminde WhatsApp'a düşüyor; çim dokusu ve ışıma sıkıştırmadan sonra nasıl duruyor, gerçek paylaşımla test edilmeli.

## Takım Çeşitliliği Mimarisi (kalıcı notlar — YENİ)
**Sorun**: Aynı çekirdek her hafta aynı tarafta oynuyordu. İki ayrı sebep vardı:
1. `buildBalancedTeams` **tamamen deterministikti** — rating'e göre sıralayıp hep `scoreA <= scoreB` kuralıyla dağıtıyordu. Aynı havuz = birebir aynı kadro. (Kullanıcı doğruladı: aynı oyuncularla kurunca 30 Temmuz'un kadrosunu aynen veriyordu.)
2. Güç dengesi tek başına da aynı ikilileri tekrar bir araya getirmeye eğilimli.

**Çözüm — üç parça:**
- **Birliktelik geçmişi** (`fetchPairWeights`): `match_lineups`'tan son **3** maç (`PAIR_HISTORY_MATCHES = 3`). Ağırlık `PAIR_DECAY = 0.65` üstel: son maç 1.0, önceki 0.65, ondan önceki ~0.42. **İki kritik filtre**: (a) `teams_revealed = true` VE **tarih başına yalnızca en son kadro** — aynı güne kurulan test poll'leri (24 Temmuz'da 8 tane var) geçmişi domine etmesin; (b) **şu anki poll hariç** (`activePollIdRef.current`), yoksa kadro açıklandıktan sonra yeniden kurmak kendini cezalandırır. Anahtar `user_id ?? guest_id` (misafirler dahil — bu takımda neredeyse herkes misafir).
- **Maliyet**: `|OVR_A − OVR_B| + λ × (aynı takımdaki ikililerin geçmiş ağırlığı)`. `DIVERSITY_LAMBDA = { off: 0, mid: 8, high: 20 }`. Kullanıcı ayarı `@diversity` (AsyncStorage, varsayılan `mid`).
- **Yerel arama** (`collectSplits`): `greedySplit` çıktısı başlangıç; yalnızca **aynı mevki kovasındaki** (`a.pos === b.pos`) A↔B oyuncuları takas edilir → mevki kotası ve formasyon yapısı bozulmaz. Kaleciler (`fieldPos === 'KL'`) sabit. `VARIANT_RESTARTS = 150` rastgele başlangıçlı tırmanış.

**Varyasyon üretimi** (`buildTeamVariants`):
- Arama sırasında **gezilen TÜM durumlar** aday havuzuna girer (`record()` her tırmanış adımında). Sadece yerel optimumları toplamak 4-6 varyasyon veriyordu; bu değişiklikle 20-30 çıkıyor.
- En iyiden en fazla `VARIANT_SPREAD = 15` (OVR puanı) sapan adaylar kabul edilir, maliyete göre sıralanır, `VARIANT_COUNT = 3` tanesi sunulur.
- `splitSignature()` **kanonik**: A/B etiketleri keyfi olduğu için tarafları yer değişmiş aynı bölünme AYNI varyasyon sayılır.
- `excludeSigs` = `variantSeen` → "🔄 Yeni" daha önce gösterilmemişleri getirir; tükenince açık uyarı verir.
- **`TeamVariant` HAM bölünme tutar** (`rawA`/`rawB`, `PlayerInfo[]`), hazır diziliş DEĞİL. Diziliş `applyVariant` anında **o anki `formationA`/`formationB`** ile kurulur — aksi halde V2'ye geçince sahada elle değiştirilen formasyon sıfırlanıyordu (bu bug düzeltildi).
- UI: **kadro (saha) ekranında**, A/B takım şeritlerinin altında (`screen === 'kadro'`). Kadro kurma barında (`screen === 'votes'`) sadece Çeşitlilik seçici + ⚡ Kadroları Kur var.

**Gerçek veriyle ölçüm (30 Temmuz havuzu, 14 kişi):** eski deterministik kadro → denge farkı 15, tekrar puanı 32.1, 6 kişilik blok aynı kalıyor. Yeni (Orta) → denge farkı 0-5, tekrar puanı ~20, en fazla 4 kişilik blok. Üretilebilen farklı varyasyon: Orta 29, Yüksek 22.

## Otomatik Formasyon Mimarisi (kalıcı notlar — YENİ)
**Sorun**: Maç kurulurken formasyon seçmek işe yaramıyordu — o an kimin geleceği belli değil. 3-2-1 seçilip sahaya takım başına 2 net defans çıkınca üçüncü DEF slotunu forvet dolduruyordu; kullanıcı her hafta elle 2-3-1'e çekiyordu.

**Çözüm**: Formasyon seçici maç oluşturma VE maç düzenleme modalından kaldırıldı. `Maç Formatı` (6v6/7v7/8v8) kaldı — kadro büyüklüğünü o belirler (`fieldCapacity = teamSizeOf(defaultFormationFor(match.teamSize)) * 2`). Formasyon `suggestFormation(main, match.teamSize)` ile **sahaya çıkacak gerçek havuzdan** seçilir. Kullanıcı isterse saha görünümü → takım şeridi → **Taktik** ekranından A ve B için ayrı ayrı değiştirir.

**Maliyet sabitleri** (`app/(tabs)/index.tsx` ~satır 348-405):
- `SHORTAGE_WEIGHT = { DEF: 1.5, ORT: 1, FOR: 1 }` — defans eksiği daha pahalı; forvetin defansta oynaması, defansın ileride oynamasından daha zararlı. **3-2-1 vs 2-3-1 kararını bu ağırlık veriyor.**
- `SECONDARY_COVER_COST = 1` (eksik, ikincil mevkiyle kapanıyor) / `NO_COVER_COST = 3` (kimse oynayamıyor) / `SURPLUS_COST = 0.5` (fazlalık) / `EXTRA_STRIKER_COST = 3` (1'den fazla forvet slotu başına).
- `canCover(p, 'ORT')`: **Forvet Arkası saha kovası olarak FOR'dur** (`SKILL_TO_FIELD_SLOT` değiştirilmedi) ama formasyon önerisinde ORT çizgisini doldurabildiği kabul edilir — 2-3-1'in "3"ü buradan çıkıyor. `_rawPrimary`/`_rawSecondary` alanlarını okur.

**Doğrulanmış senaryolar:** 30 Temmuz gerçek havuzu → 2-3-1 (kullanıcının elle yaptığı). 4 DEF + 4 ORT + 4 FOR (ikincili Forvet Arkası) → 2-3-1 (2-2-2'ye kaçmıyor). 8 FOR + 4 DEF, hiç orta saha/ikincil yok → 2-2-2 (gerçekten başka seçenek yokken doğru).

## Kadro Doldurma Mimarisi (kalıcı notlar — YENİ)
- **Sorun**: `yesSorted.slice(0, fieldCapacity)` — "Kesin Var" sayısı formasyon kapasitesinden azsa saha eksik kuruluyordu ve `subPool` (Yedek oyu verenler + kulübedekiler) hiç kullanılmıyordu.
- **Çözüm `fillFieldPool(base, reserves, capacity, formation)`**: kapasite dolu/aşkınsa mevkiye göre dengeli kesit sahada kalır, fazlası yedeğe; kapasite DOLMAZSA eksik slotlar yedek havuzundan doldurulur.
- **Seçim güce göre DEĞİL mevki ihtiyacına göre**: formasyonun iki takım için istediği slot sayısından (`{KL:2, DEF:def*2, ORT:ort*2, FOR:forv*2}`) eldekiler düşülür; en büyük açığı olan kovadan, o kovaya en uygun oyuncu alınır (`posScore` — ana mevki > ikincil > ham uyum). Tüm kovalar kapanıp hâlâ boşluk varsa en yüksek OVR.
- **Denge neden bozulmuyor**: (a) doldurma mevki açığını kapatıyor, havuz düzgün gidiyor; (b) güç dengesi zaten sonraki aşamada `buildTeamVariants` iki takıma dağıtırken kuruluyor; (c) kapasite çift sayı olduğu için takımlar eşit çıkıyor.
- Mevki ihtiyacı hesabında `defaultFormationFor(match.teamSize)` kullanılır — nihai formasyon zaten sonra, DOLMUŞ havuza bakılarak `suggestFormation` ile seçilir.
- Yedekten sahaya alınanlar kaptana isim isim Alert ile bildirilir (sessizce olmaz).

## Oyuncu Çıkarma / Joker Silme (kalıcı notlar — YENİ)
- **Üyeler**: `⋯` menüsü artık `amIManager` (kaptan + yardımcı). Ama **yetki devri işlemleri SADECE kaptanda** — "yardımcı kaptan yap", "yetkisini al", "kaptanlığı devret" `isCaptain` koşullu; aksi halde yardımcı kendini kaptan yapabilirdi. Yardımcı kaptanı takımdan çıkaramaz.
- **Jokerler İKİ MODLU silinir** — çünkü `match_lineups.guest_id → guest_players(id)` FK'sı **VAR** (PostgREST embed ile doğrulandı):
  - Hiç `match_lineups`/`player_ratings` kaydı yoksa → **sert silme** (yanlış eklenen joker için doğru davranış).
  - Geçmişi varsa → **yumuşak silme** (`is_active = false`). Sert silmek geçmiş kadro satırlarını uçururdu; o satırlar hem maç geçmişi hem de **takım çeşitliliği algoritmasının "kim kiminle oynadı" verisi** (`fetchPairWeights` son 3 maçı okuyor).
  - Onay ekranı hangi modun çalışacağını kullanıcıya yazar.
- **`is_active` filtresi SORGUDA DEĞİL İSTEMCİDE** (`fetchGuestPlayers` içinde `.filter(g => g.is_active !== false)`). Sebep: takım kimliğinde `logo_url`'ü select'e koyunca migration'sız DB'de sorgu komple patlamış ve liste boşalmıştı. Aynı hataya düşmemek için kolon bağımlılığı sorgudan çıkarıldı.
- Silinen joker `savedTeamA/B/Substitutes`'tan da düşürülür — bayat kadro kalmasın.

## Takım Kimliği Mimarisi (kalıcı notlar — YENİ)
- **Şema**: `teams.logo_url` (text) + `teams.color` (text, hex). Migration `20260801120000_team_identity.sql` — kolonlar + `team_logos` public bucket + `storage.objects` policy'leri. **Uygulandı.**
- ⚠️ `storage.objects`'te RLS uygulama tablolarından farklı olarak **varsayılan AÇIK**, o yüzden policy şart oldu. Şu anki policy'ler "giriş yapmış herkes yazabilir" seviyesinde — RLS turunda "sadece o takımın kaptanı/yardımcısı `teamId/` klasörüne yazar" diye daraltılacak.
- **Renk = MARKA rengi, saha tarafı rengi DEĞİL.** Takım her maç kendi içinde A/B'ye bölünüyor ve A/B'nin kendi sabit renkleri var (mavi `#3B82F6` / yeşil `#10B981`); `teams.color` onları ezmez. Modalda kullanıcıya da yazıyor.
- **Yükleme**: `expo-image-picker` → `base64: true` → `base64-arraybuffer` `decode()` → `supabase.storage.from('team_logos').upload()`. Yol `${teamId}/logo_${Date.now()}.jpg`. **`expo-file-system` KULLANILMIYOR** — SDK 54'te API'si değişti (`File`/`Directory`), gereksiz risk. Yeni logo yüklenince eski dosya `removeTeamLogoFile()` ile siliniyor.
- **`TeamLogo` bileşeni** tek kaynak; logo yoksa takım renginde baş harf placeholder'ı. 4 yerde: Takımım kimlik şeridi (72px), ana ekran başlığı (38px), iki takım seçim listesi (32px), paylaşım görseli üst şeridi (44px).
- **Yetki**: `amIManager` (kaptan + yardımcı) düzenleyebilir.
- **Sabitler**: `TEAM_LOGO_BUCKET`, `DEFAULT_TEAM_COLOR = '#22C55E'`, `TEAM_COLORS` (10'luk palet — tam renk seçici yerine, ek bağımlılık olmasın diye).
- **DİKKAT — öğrenilen ders**: `fetchUserTeams`'in select'ine yeni kolonları eklerken migration uygulanmamış DB'de sorgu **komple** hata verdi ve Takımım menüsü boşaldı (hata da yutuluyordu). Artık hata loglanıyor ve kimliksiz select'e geri düşülüyor. **Yeni kolon eklerken hep bu geri düşüşü düşün** — `fetchMyTeam` `select('*')` kullandığı için etkilenmemişti, tutarsız davranış teşhisi zorlaştırdı.

## Mevki / Nitelik Mimarisi (kalıcı notlar)
- 6 mevki: Kaleci, Defans, Ön Libero, Orta Saha, Forvet Arkası, Forvet (`SKILL_POSITIONS`).
- **Nitelik seti SABİT**: saha oyuncuları `OUTFIELD_ATTRIBUTES = ['Şut','Pas','Top Kontrolü','Markaj','Hız','Fiziksel Güç']`; kaleci `GOALKEEPER_ATTRIBUTES = ['Uzanış','Tutuş','Dağıtım','Refleks','Hız','Pozisyon']`. İkincil mevki nitelik SETİ eklemez, yalnızca OVR ağırlığına harmanlanır.
- **Kondisyon = ÖZEL**: `CONDITION_ATTR='Kondisyon'`, 6'nın DIŞINDA, formda "GENEL" başlığıyla ayrı. OVR'a ağırlık değil **çarpan**: `conditionFactor()` 1–99'u ~0.90–1.05'e eşler (nötr 60).
- **OVR**: beceri OVR = 6 niteliğin ağırlıklı ortalaması, ağırlık `POSITION_WEIGHTS[primary] + 0.5 × POSITION_WEIGHTS[secondary]`. Nihai OVR = beceri OVR × conditionFactor, 1–99 clamp. Girilmemiş nitelik = 60.
- **Eski veri eşleme**: `migrateAttributeNames()` okuma anında `Şut Gücü→Şut`, `Kurtarış→Tutuş`, `Pozisyon Alma→Pozisyon`. Mevcut satırların stored `overall_rating`'i ancak yeniden kaydedilince/oylama işlenince güncellenir.
- `positionLabel(v)` — mevki gösterimi: SkillPosition kodunu etikete çevirir, tanımadığını olduğu gibi basar, boşta `'—'`.

## Maç-Sonu Oylama Mimarisi (kalıcı notlar)
- Tablo `player_ratings` (poll_id="maç", voter_id hep üye, rated_user_id/rated_guest_id'den biri, attribute, score 1–10). Unique: (poll_id, voter_id, coalesce(rated_user,rated_guest), attribute). Guard: `polls.ratings_processed_at`.
- Sabitler: `OVR_K = 0.18` (kademeli yumuşatma), `RATING_WINDOW_HOURS = 24`.
- Akış: `fetchOpenRatingMatch` → biten (is_finished, finished_at<24h) ve voter'ın `lineup='field'` olduğu maçı bulur → 🗳️ "Performans Oyla". `submitMatchRatings` delete+insert. `processExpiredRatingMatches` pencere kapanınca atomik guard'lı OVR günceller. Misafir oylanır, oy veremez.
- **Otomatik bitiş düzeltmesi**: `fetchActivePoll` zaman aşımı dalı artık `is_active:false + is_finished:true + finished_at` yazıyor (`.is('finished_at', null)` guard'lı) ve `fetchOpenRatingMatch` tetikliyor; `onRefresh` home dalına da eklendi. ⏳ **İleri saatli GERÇEK maçla doğrulanacak.**

## Ana Takım Mimarisi (kalıcı notlar)
- Kalıcı anahtar `@mainTeamId` (AsyncStorage). `fetchMyTeam` `.single()` KULLANMIYOR (çok takımda hata verip "takımda değilsiniz" yapıyordu); tüm üyelikleri çeker, `@mainTeamId` üyeliklerden biriyse onu seçer, değilse ilkini sabitler.
- `switchTeam` / `handleCreateTeam` / `handleAcceptInvite` seçilen takımı `@mainTeamId`'ye yazar. Ayrılınan takım ana takımsa anahtar silinir, `fetchMyTeam` tekrar çağrılır.

## Devam Eden / Yarım Kalan İş

**📋 SIRA `YOL_HARITASI.md`'DE.** 2026-08-16'da Altıpas (rakip, v2.0.0) analizinden Faz 0-7 planı çıkarıldı. Aşağıdaki durum oraya göre okunmalı.

- **✅ FAZ 0 TAMAM** (2026-08-16): migration uygulanmış, 1.0.6/#10 build'i alınmış, iki özellik test edildi ve çalışıyor.
- **✅ FAZ 1.0 + 1.1 TAMAM** (2026-08-16): "Saha Gecesi" kimliği seçildi, `constants/theme.ts` token sistemi yazıldı (tsc temiz). Aşağıda "Tasarım Sistemi" mimari notu.
- **▶️ SIRADAKİ İŞ — Faz 1.2–1.3**: ortak bileşenler (`Card`, `Button`, `Chip`, `SectionHeader`, `EmptyState`, `ListRow`, `Badge`, `Sheet`, `Segmented`, `Avatar`, `IconTile`) + emoji yerine `@expo/vector-icons` (zaten kurulu, YENİ BAĞIMLILIK YOK). Görsel şartname hazır (artifact linki yukarıda) — bileşen dili bölümü doğrudan şartname.
  Sonra: **1.4** i18n iskeleti (`t()`, `tr.ts`, `@lang`) → **1.5** `screens/` deseni → **Faz 2.1** ilk gerçek ekran olarak Ayarlar.

### Hâlâ test EDİLMEMİŞ olanlar (1.0.5/#9 ve 1.0.6/#10 ile sahaya çıktı)
Bunlar tasarım turundan bağımsız; gerçek kullanımda doğrulanacak. Sorun çıkarsa Faz 1'i kesip düzeltilir.
- (a) Nitelik formu scroll'u — Kondisyon klavye altında kalıyor mu, boşluğa tıklayınca zıplıyor mu
- (b) V1/V2/V3 varyasyon geçişi — sahada anlık değişiyor mu, formasyonu bozmuyor mu
- (c) Otomatik formasyon önerisi — gerçek yoklamada makul mü (maç kurarken artık formasyon SORULMUYOR)
- (d) Paylaşım görselinde takım logosu — `captureRef` uzak görsel yüklenmeden yakalarsa boş çıkabilir, **tek şüpheli nokta**
- (e) Yedek yerleştirme mevkiye göre mi
- (f) Maç kendi kendine bitince oylamanın otomatik açılması — ileri saatli GERÇEK maç gerekiyor
- Takım kimliği (logo/isim/renk) kullanıcı tarafından test edildi ✅ — başka bir kaptanın kendi takımında denemesi iyi olur.

Feedback gelirse: düzeltmeler → `/checkpoint` → `/guncelle` (sürümü kendisi 1.0.7 yapar).

## Checkpoint / Geri Dönüş Noktaları
- Kalıcı geri dönüş için **git tag** kullanılıyor (`checkpoint-YYYY-MM-DD-NN` biçimi), `/checkpoint` komutuyla alınır — bkz. `.claude/commands/checkpoint.md`.
- Claude Code'un yerleşik rewind özelliği (Esc Esc) OTURUM İÇİdir ve kalıcı değildir; "haftalar sonra buraya dön" ihtiyacını karşılamaz. Bu yüzden tag yöntemi kuruldu.
- Geri dönmek için: `git checkout <tag>` (bakmak için) veya `git reset --hard <tag>` (geri almak için — dikkat, sonrası silinir).
- ⚠️ Tag yalnızca KODU geri alır, **Supabase şemasını/verisini geri almaz**. Migration uygulandıktan sonra koda geri dönmek şema uyuşmazlığı yaratabilir.

## Çalışma Tarzı / Tercihler
- Kullanıcı Türkçe konuşur.
- İş bitince ayrıca "tamamlandı" mesajı ATMA — kullanıcı kendi test eder, geri bildirir.
- Büyük/mimari işlerde ÖNCE planı (şema, mantık) açıkla, ONAY alınca kodla. Körlemesine patch atma; tekrarlayan bir bug varsa önce kök nedeni veriyle (log) göster.
- **Algoritma değişikliklerini gerçek Supabase verisiyle simüle et ve önce/sonra tablosu göster** — bu oturumda çok işe yaradı. Anon key ile REST üzerinden okunabiliyor (RLS kapalı); scratchpad'e Node script yazıp `match_lineups` / `polls` çekilebiliyor.
- Sadeleştirme sırasını doğru kur: önce veri/nitelik modeli, sonra ona bağlı UI/oylama.
- Supabase migration'ları `npx supabase db push` ile kullanıcı tarafından uygulanır (DB şifresi Claude Code'da yok).
- EAS: giriş `gamwi` (tugrulkeser@msn.com). Build numarası remote + autoIncrement (elle bump yok). Marketing version app.json'da.
