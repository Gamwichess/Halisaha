---
description: Oturuma başla — en güncel kodu çek, DURUM.md ve YAPILACAKLAR.md oku, nerede kaldığımızı özetle
allowed-tools: Bash(git *), Read
---

# Oturuma Başla

Yeni bir çalışma oturumuna başlıyoruz. Projeye tam hakim olmak için sırayla şunları yap:

## 1. En güncel kodu çek
- `git pull` çalıştır (uzak repo'daki son hali al)
- Son commit'leri gör: !`git log --oneline -10`

## 2. Durum dosyalarını oku
Proje kök dizinindeki şu dosyaları OKU (tamamını):
- `DURUM.md` — projenin genel durumu, son yapılanlar, yarım kalan iş, mimari notlar
- `YAPILACAKLAR.md` — açık işler, bilinen buglar, sonraya bırakılan/erken işler

## 3. Projeye bak
- Ana kod dosyasına göz at (app/(tabs)/index.tsx) ki DURUM.md'de yazanla kod uyuşuyor mu bil
- Bekleyen migration var mı kontrol et (supabase/migrations klasörü)

## 4. Bana özetle
Kısa ve net bir özet ver:
- **Nerede kaldık**: DURUM.md'deki "devam eden iş" ne
- **İlk iş**: bu oturumda ilk yapılması gereken (varsa yarım kalan)
- **Hazır bekleyenler**: YAPILACAKLAR'da artık yapılabilir durumda olan işler
- **Henüz erken olanlar**: "Sonraya/Erken" bölümündekiler — bunları HATIRLAT ama "şimdi yapalım" deme, sadece hatırlat ki unutmayayım

Sonra bana "Neyle başlayalım?" diye sor ve bekle. Kendi kafana göre koda başlama.
