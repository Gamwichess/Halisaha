# YOL HARİTASI — Tasarım Yenileme, i18n, Tier 0/1/2/3

> Altıpas (referans, v2.0.0) analizinden çıkan uygulama sırası. 2026-08-16'da kuruldu.
> `DURUM.md` = nerede olduğumuz, `YAPILACAKLAR.md` = açık işler, bu dosya = **hangi sırayla**.

## Sıralamanın iki temel kararı

1. **i18n altyapısı en başta, çevirisi en sonda.** Altyapı (t() + tr.ts) tek dosyalık ucuz bir iş; Faz 1'de kurulur. Faz 2'den itibaren yenilenen her ekran doğrudan `t()` ile yazılır — o JSX zaten baştan yazıldığı için marjinal maliyet ~sıfır. Faz 4 yalnızca dokunulmamış artıkları süpürür ve EN'i doldurur. İngilizceyi başa almak da sona bırakmak da aynı satırlara iki kez dokunmak demek.
2. **Tier 0 ayrı faz değil, Ayarlar ekranına gömülü.** Hesabı Sil / Gizlilik / Koşullar / Destek zaten Ayarlar'da yaşıyor; ekran yenilenirken bedava gelir. **RLS istisna** — Faz 6'da, ağ katmanından hemen önce.

## Çapraz kurallar (her fazda geçerli)

- Her faz sonunda `/checkpoint` (git tag).
- Her 2-3 fazda bir `/guncelle` → testçiler aylarca eski build'de kalmasın.
- Bir ekran yenilenirken `index.tsx`'ten `screens/` altına çıkarılır (aşağıda gerekçe).
- Token dışı hex/spacing **yasak** — inline stil sabiti yazılmaz.
- Yeni Supabase kolonu eklerken select'e geri-düşüş konur (DURUM.md'deki öğrenilmiş ders).
- Ekran çıkarıldıkça `CLAUDE.md`'deki "tek dosya SPA" mimari notu güncellenir.

---

## FAZ 0 — Mevcut borcu kapat ✅ TAMAMLANDI (2026-08-16)

Uzun bir refactor'a yarım kalmış işle girilmez; refactor bir şeyi bozarsa neyin bozulduğu ayırt edilemez.

- [x] Migration `20260801160000_guest_soft_delete.sql` — zaten uygulanmış (REST ile doğrulandı: `guest_players.is_active` var)
- [x] Build — zaten alınmış: **1.0.6 / #10**, build ID `58089836`, commit `68cd0c0`, `FINISHED`
- [x] İki özellik test edildi, **çalışıyor** (kullanıcı doğruladı): yedeklerden kadro tamamlama, oyuncu çıkarma/joker silme
- [x] `/checkpoint` — tasarım turundan önceki son temiz hal

**Not:** DURUM.md ve YAPILACAKLAR.md "migration bekliyor / yeni build gerekiyor" diyordu; ikisi de bayatmış, düzeltildi.

---

## FAZ 1 — Kimlik + tasarım ve i18n altyapısı (kullanıcı hiçbir şey görmez)

Bu faz olmadan her ekran ayrı ayrı güzelleşir ve yamalı bohça çıkar.
**Karar: sıfırdan yeni görsel kimlik** → önüne ayrı bir kimlik turu eklendi (1.0), faz uzadı.

- [x] **1.0 Kimlik turu** ✅ **"SAHA GECESİ" SEÇİLDİ** (2026-08-16)
      Gece oynanan maç: koyu yeşil-siyah zemin, floodlight lime vurgu, yüksek kontrast, sinematik.
      **Koyu tema ayrı bir mod DEĞİL — kimliğin kendisi.** İleride istenirse AÇIK tema opsiyonel eklenti olur.
      📐 Görsel şartname (palet + tipografi + bileşen dili + 2 ekran maketi):
      https://claude.ai/code/artifact/5d60e8d8-7c61-43ed-870a-d7908f3d682c
- [x] **1.1 Tasarım token'ları** ✅ `constants/theme.ts` yazıldı — semantik renkler, spacing, radius, elevation, tipografi ölçeği, `alpha()`. `npx tsc --noEmit` temiz.
      Eski `Colors`/`Fonts` export'ları bırakıldı: Expo şablonundan kalan dosyalar (`explore.tsx`, `modal.tsx`, `themed-text`, `themed-view`) onları import ediyor. Uygulamanın kendisi kullanmıyor.
      ⚠️ A/B takım renkleri (`#3B82F6` / `#10B981`) semantiktir, kimlik değişse de dokunulmaz — bkz. DURUM.md "Takım Kimliği".
- [ ] **1.2 Ortak bileşenler** — `Card`, `Button` (primary/secondary/ghost/danger), `Chip`, `SectionHeader`, `EmptyState`, `ListRow`, `Badge`, `Sheet`, `Segmented` (pill tab), `Avatar`, `IconTile` (pastel ikon kutusu)
- [ ] **1.3 İkon katmanı** — `@expo/vector-icons` zaten kurulu, **yeni bağımlılık yok**. `Icon` sarmalayıcı + emoji→ikon eşleme tablosu. (Emoji ikonlar şu an en büyük "amatör" sinyali.)
- [ ] **1.4 i18n iskeleti** — `i18n/tr.ts`, `i18n/en.ts` (boş başlar), `useT()`, `@lang` AsyncStorage + cihaz dili varsayılanı
- [ ] **1.5 `screens/` klasörü** — ilk ekran çıkarılarak desen ispatlanır
      **Karar: ekran yenilendikçe böl.** Her ekran yeniden yazılırken `index.tsx`'ten `screens/` altına taşınır; big-bang refactor yok, her adım bağımsız test edilebilir. Hedef yapı:
      ```
      app/(tabs)/index.tsx   ← her fazda küçülür
      screens/               ← SettingsScreen, ProfileScreen, HomeScreen, ...
      components/ui/         ← Card, Button, Chip, EmptyState, ...
      i18n/                  ← tr.ts, en.ts
      ```

**Çıkış ölçütü:** Ayarlar ekranı yeni sistemle yeniden yazılmış, görsel fark net.
**Risk:** kullanıcıya dönük risk yok.

---

## FAZ 2 — Ekran ekran UI/UX yenileme (Tier 0 + Tier 1 gömülü)

Sıra: **küçük ve izole olandan → en çok görülene → en özenli olana.** Her ekran ayrı checkpoint.

- [ ] **2.1 Ayarlar** ← başlangıç noktası: en küçük, en izole, aynı anda tasarım + i18n + Tier 0'ı ispatlıyor
      - Tier 0: **Hesabı Sil** (Apple 5.1.1(v) — yoksa ret; UI + `delete_own_account` RPC birlikte), Gizlilik Politikası, Kullanım Koşulları, Destek
      - Dil seçici (i18n'in ilk gerçek tüketicisi)
      - Bildirim tercihleri iskeleti (toggle'lar; motoru Faz 3'te bağlanır)
- [ ] **2.2 Profil + Profil düzenleme**
      - Tier 1: fotoğraf + emoji avatar, @kullanıcı adı, isim gösterimi (Ad S. / Ad Soyad), doğum yılı, şehir/ilçe
      - Tier 1: **profil tamamlanma halkası** — alanlar eklendikten *sonra*, yoksa ölçecek bir şey yok
- [ ] **2.3 Ana ekran** — en çok görülen ekran
      - Profil şeridi + hızlı aksiyon grid'i + yaklaşan maç kartı + bildirim özeti
      - Tier 1: **boş durum kartları** ("Örnek maça bak") — şu an yeni kaptan ölü ekranla karşılaşıyor
      - Tier 1: **davet kodu kartı** (`team_invites` var ama görünür girişi yok)
- [ ] **2.4 Görsel bottom tab bar** — SPA korunur (`setScreen` kalır), 4 sekme: Ana Sayfa / Kadro / Takımım / Profil.
      Ana ekrandan *sonra*, çünkü sekme yapısı ana ekranın son haline bağlı. **"Gerçek uygulama" hissini veren tek en büyük değişiklik.**
      → burada `/guncelle` (ara build)
- [ ] **2.5 Yoklama / kadro kurma barı**
- [ ] **2.6 Saha / kadro ekranı** — "wow" ekranımız, en son ve en özenli. Paylaşım görseli de burada.
- [ ] **2.7 Takımım / oyuncu listesi + oyuncu detay menüsü**
      → YAPILACAKLAR'daki "oyuncu detay menüsü UI kötü" maddesi burada kapanır (referans görsel bekleniyordu, artık Altıpas ekranları elimizde)
- [ ] **2.8 Maçlar ekranı** — Tier 1: Aktif / Geçmiş ayrımı, skor kartı, katlanır "İptal edilen maçlar". Bizde zayıf, neredeyse yeni ekran.
- [ ] **2.9 Bildirim merkezi** — Tier 1: zengin akış (tablo ve badge zaten var)
      → burada `/guncelle`

---

## FAZ 3 — Bildirim + Onboarding (Tier 1)

Sıra kritik: **priming ancak izin isteyecek bir şey varsa anlamlı** → önce motor, sonra onboarding.

- [ ] **3.1 Yerel maç hatırlatıcı** (`expo-notifications` schedule) + granular toggle'ların bağlanması: Maç Daveti / Kadro Güncellemesi / Maç Hatırlatma / Maç Sonucu. Kaç saat önce → kullanıcı ayarı.
      (Uzak push = Expo push token + edge function; Faz 7'de ağ katmanıyla gerekli hale gelir.)
- [ ] **3.2 Onboarding carousel + bildirim izni priming** — iOS izni **bir kez** sorar; önce değeri anlatmak dönüşümü katlar. En sona bırakıldı çünkü onboarding yeni UI'ı anlatır — erken yapılsa iki kez yazılır.

---

## FAZ 4 — i18n tamamlama

- [ ] 4.1 Dokunulmamış ekranlarda sert-kodlu Türkçe string taraması (Türkçe karakter grep'i ile mekanik)
- [ ] 4.2 EN çevirisi
- [ ] 4.3 Tarih/saat/sayı biçimlendirmesi (`Intl`) + çoğul formlar

**Not:** Faz 2-3'te yenilenen ekranlar zaten `t()` kullanıyor; bu faz sadece artıkları toplar.

---

## FAZ 5 — Tier 2 (ağa girmeden değer üretenler)

- [ ] **5.1 Hızlı Maç Kur** 🔥 — kadro listesini yapıştır → takımlar hazır. **En değerli çalma adayı**: bizim en güçlü yanımızın (çeşitlilik algoritması) vitrini, kayıt gerektirmeden denenebilir, paylaşıma uygun. Faz 2.6'daki güzel paylaşım görseliyle birlikte anlamlı.
- [ ] **5.2 MVP oylaması** — nitelik oylaması var, MVP kavramı yok. Tek dokunuş, katılımı artırır.
- [ ] **5.3 Mini lig / sezon tablosu** — haftalık maçlardan takım içi puan durumu; modelimize birebir oturur.
- [ ] **5.4 Kadro Dene** — kayıtsız oynanabilir diziliş alanı, edinim kancası.
- [ ] **5.5 "Boş gün" modülü** (penaltı düellosu / tahmin yarışması tarzı) — opsiyonel; maç olmayan günlerde uygulamayı açtıran şey.

---

## FAZ 6 — RLS + yayın hazırlığı

⚠️ **RLS bu fazdan ÇIKARILDI ve 2026-08-16'da yapıldı.** Sebep: Play Console dahili testine gerçek kullanıcı alınacaktı ve veritabanı tamamen açıktı (anon key ile profiller, push token'lar, yoklamalar okunabiliyordu). Plan yazılırken elimizde Play'e çıkma kararı yoktu.

- [x] **12 tabloda RLS + storage policy'leri** — `20260816120000_rls_helpers_and_rpcs.sql` + `20260816130000_enable_rls.sql`, ikisi de uygulandı. Anon artık her tabloda HTTP 401. Mimari not DURUM.md "RLS Mimarisi".
- [x] `team_logos` storage policy daraltma — sadece o takımın yöneticisi kendi `teamId/` klasörüne yazar.
- [ ] ⏳ Giriş yapmış kullanıcı tarafının uygulamada doğrulanması (test listesi YAPILACAKLAR.md'de)
- [ ] Hesabı Sil sunucu tarafının RLS altında gözden geçirilmesi
- [ ] App Store: gizlilik beyanı (privacy nutrition labels), destek sayfası, metadata

---

## FAZ 7 — Tier 3 ağ katmanı (RLS olmadan başlanmaz)

Sıra dar ihtiyaçtan geniş olana — **boş bir pazaryeri, pazaryeri olmamasından kötüdür.**

- [ ] **7.1 Eksik Var** (tek maçlık eksik oyuncu ilanı, il/ilçe) ← ağa buradan girilir, Transfer Pazarı'ndan değil
- [ ] **7.2 Rakip Bul**
- [ ] **7.3 Topluluklar / Keşfet**
- [ ] **7.4 Sohbet** (emoji + GIF; messages tablosu + realtime)
- [ ] **7.5 Transfer Pazarı** (videolu) — en pahalısı, en son
- [ ] **7.6 Uzak push altyapısı** (Expo push token + edge function) — burada zorunlu hale gelir
- [ ] Saha rezervasyon iş birliği (VAR Sahaları benzeri) — kod değil, iş geliştirme

---

## Kararlar

- [x] **Görsel kimlik yönü** → **sıfırdan yeni kimlik**. Faz 1.0 olarak ayrı kimlik turu eklendi; token'lar onun çıktısı. Faz 1 uzuyor.
- [x] **`index.tsx` bölünmesi** → **ekran yenilendikçe böl** (Faz 1.5 + Faz 2 boyunca). `CLAUDE.md`'deki "tek dosya SPA" notu adım adım güncellenir.
- [ ] **EN çeviri kalitesi**: makine çevirisi + gözden geçirme mi, elle mi? (Faz 4'te karara bağlanır, şu an bloklamıyor.)
