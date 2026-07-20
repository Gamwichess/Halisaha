---
description: Oturumu bitir — DURUM.md ve YAPILACAKLAR.md güncelle, commit et, private GitHub'a push et
allowed-tools: Bash(git *), Bash(gh *), Read, Edit, Write
disable-model-invocation: true
---

# Oturumu Bitir ve Paketle

Bu oturumda yapılan işleri kalıcı hale getir. Sırayla şunları yap:

## 1. Bu oturumda ne yaptığımızı çıkar
Bu konuşmada gerçekleştirilen tüm işleri gözden geçir: hangi dosyalar değişti, hangi migration'lar atıldı, hangi buglar çözüldü, hangi kararlar verildi. Aşağıdaki git bilgisi sana yardımcı olur:

- Değişen dosyalar: !`git status --short`
- Bu oturumdaki commit'ler: !`git log --oneline -10`
- Son değişikliklerin özeti: !`git diff --stat HEAD`

## 2. DURUM.md dosyasını güncelle
Proje kök dizinindeki `DURUM.md` dosyasını oku ve şu bölümleri güncelle:
- **Genel durum**: değişen büyük tablo (örn. yeni özellik tamamlandıysa, bir sistem oturdu ise)
- **Son oturumda yapılanlar**: bu oturumun işlerini kısa maddeler halinde YAZ (önceki "son oturum" bölümünü "Geçmiş oturumlar"a taşı ya da özetle, dosyayı şişirme)
- **Devam eden / yarım kalan iş**: bir sonraki oturumun ilk işi ne olacaksa net yaz
- **Mimari notlar**: kalıcı teknik kararlar (şema yapısı, hesaplama mantığı, önemli sabitler) — bunlar gelecekteki sen için, unutma
Dosyayı Türkçe yaz. Amaç: `/baslat` dediğimde bu dosyayı okuyunca projeye tam hakim olabilmen.

## 3. YAPILACAKLAR.md dosyasını güncelle
Proje kök dizinindeki `YAPILACAKLAR.md` dosyasını oku ve güncelle:
- Bu oturumda tamamlanan maddeleri **Tamamlananlar**'a taşı (ya da sil, uzarsa)
- Yeni ortaya çıkan işleri uygun bölüme ekle
- Kullanıcının "bunu unutturma" dediği ya da "şimdilik erken" dediği her şeyi **Sonraya / Erken (Unutturma)** bölümüne net şekilde yaz — sebebiyle birlikte (neden erken/ertelendi)
- Bekleyen buglar varsa **Bilinen Buglar** bölümünde tut

## 4. Commit et ve push et
- Değişiklikleri stage et: `git add -A`
- Anlamlı bir commit mesajı yaz (bu oturumun özeti, Türkçe, örn. "Maç sonu oylama sistemi + DURUM güncellemesi")
- Commit at: `git commit -m "..."`
- Push et: `git push`

Eğer `git push` "no upstream" ya da remote yok hatası verirse, kullanıcıya söyle: private GitHub repo'sunun bir kez kurulması gerekiyor (README/kurulum notuna bak). Repo'yu KENDİN oluşturma — sadece uyar.

## 5. Kısa özet ver
İşlem bitince kullanıcıya 2-3 cümlelik özet ver: ne push edildi, bir sonraki oturumda ilk iş ne. Uzun anlatma.
