# Kurulum — /bitir ve /baslat Sistemi (tek seferlik)

Bu klasördeki dosyaları projene yerleştirip bir kez GitHub private repo bağlayınca sistem hazır.

## 1. Dosyaları projene kopyala
Bu klasörün içindekileri projenin **kök dizinine** (app/(tabs)/index.tsx'in olduğu proje kökü) şu yapıda koy:

```
projen/
├── .claude/
│   └── commands/
│       ├── bitir.md
│       └── baslat.md
├── DURUM.md
├── YAPILACAKLAR.md
└── ... (mevcut proje dosyaların)
```

`.claude/commands/` klasörü projenin kökünde olmalı. `bitir.md` → `/bitir`, `baslat.md` → `/baslat` komutu olur (dosya adı = komut adı).

## 2. GitHub private repo oluştur (tek sefer)
Terminalde proje kökünde:

```bash
# git yoksa başlat
git init

# ÖNEMLİ: sırları koru — .env ve secret dosyaları repo'ya gitmesin
# .gitignore dosyanda şunların olduğundan emin ol:
#   .env
#   .env.local
#   node_modules/
# (Supabase anahtarların .env'deyse bunlar ŞART — private repo bile olsa sırları commit'leme)

gh auth login          # GitHub CLI'ya bir kez giriş (yoksa: brew install gh / winget install GitHub.cli)
gh repo create halisaha --private --source=. --remote=origin
git add -A
git commit -m "İlk commit: /bitir /baslat sistemi + mevcut durum"
git push -u origin main
```

`gh` kullanmak istemezsen: GitHub'da elle private repo aç, sonra:
```bash
git remote add origin https://github.com/KULLANICI_ADIN/halisaha.git
git branch -M main
git push -u origin main
```

## 3. Kullanım
Bundan sonra her oturum:

- **Başlarken**: Claude Code'da `/baslat` yaz. Kodu çeker, DURUM.md + YAPILACAKLAR.md okur, nerede kaldığını özetler, "neyle başlayalım?" diye sorar.
- **Çalışırken**: normal konuşarak iş yaptır.
- **Bitirirken**: `/bitir` yaz. Yapılanları DURUM.md ve YAPILACAKLAR.md'ye işler, commit atar, private repo'ya push eder.

## Notlar
- "Bunu unutturma" ya da "şimdilik erken" dediğin her şeyi `/bitir` YAPILACAKLAR.md'nin **Sonraya / Erken (Unutturma)** bölümüne yazar; `/baslat` bunları sana hatırlatır ama kendiliğinden yapmaz.
- DURUM.md ve YAPILACAKLAR.md'yi istediğin an elle de düzenleyebilirsin — sonuçta düz metin.
- `/bitir` push başarısız olursa (remote yok) sana söyler; o zaman 2. adımı bir kez yapman gerekir.
- Bu iki komut proje repo'sunda durduğu için, başka bir bilgisayarda `git clone` + Claude Code açıp `/baslat` dersen aynı yerden devam edersin.
