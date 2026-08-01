# DURUM — Halı Saha Uygulaması

> Bu dosya Claude Code'un kendi hafızasıdır. `/baslat` ile okunur, `/bitir` ile güncellenir.
> Her oturum sonunda güncel tutulur. Amaç: yeni oturumda projeye sıfırdan hakim olmak.

## Genel Durum
- **Proje**: Halı saha (amatör futbol) takım yönetim uygulaması
- **Stack**: Expo (React Native) + Supabase
- **Mimari**: Tek dosyada SPA-tarzı state navigasyonu — `app/(tabs)/index.tsx` (~5600 satır)
- **Dağıtım**: iOS TestFlight'ta yayında. Son derlenen: **1.0.3 / build #8** (App Store Connect'e submit edildi). `eas.json`'da `ascAppId: 169829` ekli → `eas build -p ios --profile production --auto-submit --non-interactive` tek komutla build+submit yapıyor. **Bu oturumdaki değişiklikler henüz build'e girmedi** — yeni TestFlight build gerekiyor.
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
- **Otomatik formasyon önerisi ÇALIŞIYOR** (bu oturum — aşağıda mimari not)

## Son Oturumda Yapılanlar (2026-07-31 / 08-01)
Tamamı `app/(tabs)/index.tsx` içinde; migration YOK, DB şeması değişmedi.

1. **Nitelik formu scroll düzeltmesi** — `KeyboardAwareScrollView` kaldırıldı (paket artık hiçbir yerde kullanılmıyor, `package.json`'da duruyor). İki bug birden çözüldü: (a) boşluğa tıklayınca listenin en üste zıplaması → KAS'ın klavye kapanınca `resetScrollToCoords` ile başa sarmasıydı; (b) Kondisyon'un klavye altında kalması → sabit `maxHeight: 440` yüzündendi. Yerine: sheet `KeyboardAvoidingView` ile klavyenin üstüne kalkıyor + liste `flexShrink: 1`.
2. **Mevki listeleri düzeltildi** — profil ve profil-tamamlama ekranları artık `SKILL_POSITIONS` (6 mevki, Ön Libero + Forvet Arkası dahil) kullanıyor. `main_position` artık KOD saklıyor (`ON_LIBERO`); gösterim için `positionLabel()` helper'ı eklendi (eski `KL/DEF/ORT/FOR` kayıtları olduğu gibi görünür). Oyuncu listelerinde `primary_position` önceliklendiriliyor.
3. **Misafir eklerken mevki sorulmuyor** — nitelik formunda zaten seçiliyor. `newGuestPos` state'i silindi; DB'ye legacy `position: 'ORT'` varsayılanı yazılıyor.
4. **Takım çeşitliliği sistemi** (asıl büyük iş) — aşağıda mimari not.
5. **Varyasyon seçimi (V1/V2/V3 + 🔄 Yeni)** — saha görünümünde.
6. **Otomatik formasyon önerisi** — maç oluşturma/düzenlemedeki formasyon seçici KALDIRILDI.
7. **Buton birleştirme** — "Dengeli Kur" + "Rastgele Kur" → tek **⚡ Kadroları Kur**. `buildRandomTeams` ve `handleBuildRandom` silindi.

## Geçmiş Oturumlar (özet)
- **2026-07-30/31**: TestFlight rebuild 1.0.2→1.0.3, build #8 alındı ve `--auto-submit --non-interactive` ile ASC'ye submit edildi (`ascAppId: 169829` sayesinde sorunsuz).
- **2026-07-24**: Maç otomatik bitince oylama gelmeme bug'ının kök nedeni bulundu+düzeltildi (⏳ hâlâ doğrulanacak); pull-to-refresh'e `fetchOpenRatingMatch`; nitelik girişi scroll zıplaması (bu oturumda tamamen elden geçti); paylaşımda maç bilgisi saha görseline şerit olarak basıldı; maç oluşturunca home'a dönüş; ana takım / "takımda değilsiniz" bug'ı (`@mainTeamId` mimarisi).

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
- **⏳ İLK İŞ — bu oturumun değişikliklerini gerçek cihazda test et.** Özellikle: (a) nitelik formunda Kondisyon klavye altında kalmıyor mu + boşluğa tıklayınca zıplama gitti mi, (b) V1/V2/V3 geçişi sahada anlık çalışıyor mu ve formasyonu bozmuyor mu, (c) otomatik formasyon önerisi gerçek yoklamada makul mü.
- **⏳ Yeni TestFlight build**: bu oturumdaki hiçbir değişiklik build'e girmedi. Test bitince `/guncelle`.
- **⏳ Otomatik maç-sonu oylama doğrulaması**: ileri saatli gerçek maçla test edilecek (önceki oturumdan devam).

## Çalışma Tarzı / Tercihler
- Kullanıcı Türkçe konuşur.
- İş bitince ayrıca "tamamlandı" mesajı ATMA — kullanıcı kendi test eder, geri bildirir.
- Büyük/mimari işlerde ÖNCE planı (şema, mantık) açıkla, ONAY alınca kodla. Körlemesine patch atma; tekrarlayan bir bug varsa önce kök nedeni veriyle (log) göster.
- **Algoritma değişikliklerini gerçek Supabase verisiyle simüle et ve önce/sonra tablosu göster** — bu oturumda çok işe yaradı. Anon key ile REST üzerinden okunabiliyor (RLS kapalı); scratchpad'e Node script yazıp `match_lineups` / `polls` çekilebiliyor.
- Sadeleştirme sırasını doğru kur: önce veri/nitelik modeli, sonra ona bağlı UI/oylama.
- Supabase migration'ları `npx supabase db push` ile kullanıcı tarafından uygulanır (DB şifresi Claude Code'da yok).
- EAS: giriş `gamwi` (tugrulkeser@msn.com). Build numarası remote + autoIncrement (elle bump yok). Marketing version app.json'da.
