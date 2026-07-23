---
description: Uygulamayı TestFlight'a güncelle — kodu kontrol et, EAS iOS build al ve TestFlight'a submit et
allowed-tools: Bash(git *), Read
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

## 2. Sürüm bilgisini hatırlat (elle bump YOK)
- `app.json` → `expo.version` = pazarlama sürümü (örn. 1.0.1). Bunu **yalnızca kullanıcı isterse** artır.
- Build numarası `eas.json`'da `appVersionSource: remote` + `production.autoIncrement` ile
  **otomatik artar** — elle bump YAPMA.
- Kullanıcıya sor: "Pazarlama sürümü (`version`) aynı kalsın mı, yoksa artıralım mı?"
  (TestFlight test build'leri için genelde aynı sürüm + artan build numarası yeterli.)

## 3. Build + Submit komutunu VER (kullanıcı çalıştırır)
Kullanıcıya şu komutu `!` ile çalıştırmasını söyle (interaktif — Apple/EAS soruları çıkabilir):

```
! eas build -p ios --profile production --auto-submit
```

- `--auto-submit` build biter bitmez TestFlight'a gönderir.
- `eas.json > submit.production` boşsa (`ascAppId` yoksa) interaktif modda EAS gerekli bilgiyi
  sorar/bundle'dan bulur. Eğer `--auto-submit` takılırsa alternatif: önce sadece build
  (`! eas build -p ios --profile production`), bitince `! eas submit -p ios --latest`.

## 4. Kalıcı otomatik submit (opsiyonel öneri)
Her seferinde interaktif submit'ten kurtulmak için `eas.json > submit.production`'a
`ascAppId` eklenebilir (App Store Connect → uygulama → App Information → "Apple ID" numarası).
Bir kez eklenince `--auto-submit --non-interactive` sorunsuz çalışır. Kullanıcı Apple ID'yi
verirse `eas.json`'a ekle; vermezse sadece hatırlat.

## 5. Bitince
- Build/submit başlatıldığında kullanıcıya kısa bilgi ver: EAS build kuyruğa girdi, TestFlight'ta
  "Processing" sonrası test edilebilir olacak (~10-20 dk + Apple işleme süresi).
- Uzun anlatma; sadece hangi komutun çalıştığını ve sıradaki adımı söyle.
