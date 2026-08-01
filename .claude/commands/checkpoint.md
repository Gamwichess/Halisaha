---
description: Geri dönüş noktası oluştur — çalışan kod durumunu kalıcı bir git tag'i olarak işaretle
allowed-tools: Bash(git *), Read
---

# Checkpoint Oluştur

Amaç: "buraya geri dönebilirim" diyebileceğin, **kalıcı ve uzak repo'ya push'lanmış**
bir geri dönüş noktası bırakmak. Yöntem: annotated git tag.

> NEDEN TAG: Claude Code'un yerleşik rewind özelliği (Esc Esc) yalnızca OTURUM İÇİdir —
> oturum kapanınca gider. Haftalar sonra dönebilmek için kalıcı bir işaret gerekiyor.

## 1. Ön kontrol
- `git status --short` — çalışma ağacı temiz mi?
  - Temiz DEĞİLSE kullanıcıya sor: "Önce commit edelim mi, yoksa son commit'e mi checkpoint atalım?"
    Checkpoint her zaman bir COMMIT'i işaretler; commit'lenmemiş değişiklikler checkpoint'e GİRMEZ.
- `git status -sb` ile local'in remote ile senkron olduğunu doğrula. Değilse önce push öner.

## 2. Tag adını belirle
- Biçim: `checkpoint-YYYY-MM-DD-NN` (NN = o günün sırası, 01'den başlar).
- Mevcut tag'lere bak: `git tag -l "checkpoint-*"` — aynı günde ikinci checkpoint ise NN'i artır.

## 3. Tag'i oluştur ve push et
Annotated tag kullan (mesajlı, tarihli — lightweight tag DEĞİL):

```
git tag -a checkpoint-YYYY-MM-DD-NN -m "<kısa açıklama: bu noktada ne çalışıyor>"
git push origin checkpoint-YYYY-MM-DD-NN
```

Tag mesajına şunları yaz (Türkçe, kısa):
- Bu noktada NE ÇALIŞIYOR (test edilmiş özellikler)
- NE TEST EDİLMEDİ (riskli olabilecekler)
- O ana kadar uygulanmış son migration'ın adı

## 4. Kullanıcıya nasıl geri dönüleceğini söyle
```
git tag -l "checkpoint-*"          # checkpoint'leri listele
git show <tag>                     # o noktada ne olduğunu oku
git checkout <tag>                 # SADECE BAKMAK için (detached HEAD)
git reset --hard <tag>             # GERÇEKTEN geri dön (sonrasındaki commit'ler gider!)
```

## 5. ⚠️ Her checkpoint'te MUTLAKA hatırlat
Tag yalnızca **KODU** geri alır, **Supabase şemasını ve verisini GERİ ALMAZ**.
Checkpoint'ten sonra migration uygulandıysa, koda geri dönmek şema uyuşmazlığı yaratır
(kod eski, DB yeni). Bu durumda ya migration'ı elle geri alman ya da ileri gitmen gerekir.

## 6. Bitince
2-3 cümle: hangi tag atıldı, ne kapsıyor, nasıl dönülür. Uzatma.
