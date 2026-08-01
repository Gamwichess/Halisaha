---
description: Uygulamayı TestFlight'a güncelle — sürümü yükselt, EAS iOS build al ve TestFlight'a submit et
allowed-tools: Bash(git *), Read, Edit
---

# Uygulamayı TestFlight'a Güncelle

Amaç: mevcut kodu yeni bir iOS build olarak TestFlight'a göndermek.

> ÖNEMLİ: `eas build` ve `eas submit` **interaktif kimlik doğrulama** (Apple/EAS) isteyebilir
> ve uzun süren uzak (remote) işlemlerdir. Claude bu promptları yanıtlayamaz — bu yüzden
> asıl build/submit komutlarını **kullanıcı `! <komut>` ile kendisi çalıştırır**. Claude yalnızca
> hazırlık kontrollerini yapar ve doğru komutu verir.

## 1. Kod hazır mı kontrol et
- `git status --short` — çalışma ağacı temiz mi? Değilse: değişiklikleri commit/push etmeyi öner
  (build her zaman commit'li koddan alınsın; yarım değişiklikle build alma).
- `git log --oneline -3` ve `git status -sb` ile local'in remote ile senkron (push'lu) olduğunu doğrula.
- Temiz değilse KULLANICIYA sor: "Önce commit/push edelim mi?" — onaysız build'e geçme.

## 2. Sürümü HER SEFERİNDE yükselt (sorma, yap)
Kullanıcının kalıcı tercihi: **her `/guncelle`'de pazarlama sürümü artar.** Sorma, doğrudan uygula.

- `app.json` → `expo.version` yama (patch) hanesini bir artır: `1.0.3` → `1.0.4`.
  Minor/major atlanacaksa kullanıcı bunu kendisi söyler; varsayılan her zaman patch +1.
- Değişikliği commit + push et: `git commit -m "Sürüm X.Y.Z'ye yükseltildi (TestFlight build)"` → `git push`.
  Build daima commit'li koddan alınır.
- Build numarasına DOKUNMA — `eas.json`'da `appVersionSource: remote` + `production.autoIncrement`
  ile otomatik artıyor.

## 3. Build + Submit komutunu VER (kullanıcı çalıştırır)
`eas.json > submit.production.ios.ascAppId` = **169829** ekli olduğu için non-interactive submit çalışır.
Kullanıcıya şu komutu `!` ile çalıştırmasını söyle:

```
! eas build -p ios --profile production --auto-submit --non-interactive
```

- `--auto-submit` build biter bitmez TestFlight'a gönderir.
- Takılırsa alternatif: önce sadece build (`! eas build -p ios --profile production`),
  bitince `! eas submit -p ios --latest`.
- Log'da Apple 401 uyarısı çıkabilir; EAS kayıtlı ASC API Key ile devam ettiği için sorun değil.

## 5. Bitince
- Build/submit başlatıldığında kullanıcıya kısa bilgi ver: EAS build kuyruğa girdi, TestFlight'ta
  "Processing" sonrası test edilebilir olacak (~10-20 dk + Apple işleme süresi).
- Uzun anlatma; sadece hangi komutun çalıştığını ve sıradaki adımı söyle.
