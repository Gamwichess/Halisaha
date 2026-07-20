---
description: Ham bir fikri feature-ideation, ui-ux-designer, frontend-developer ve qa-tester agent'ları arasında sırayla dolaştırır, aralarındaki görüş ayrılıklarını çözer, nihai kararı otomatik olarak kodlar ve denetletir.
argument-hint: [fikrin ham hali]
---

Kullanıcının ham fikri: $ARGUMENTS

Bu fikri aşağıdaki adımları TEK TEK ve SIRAYLA izleyerek uçtan uca hayata geçir. Adım atlama, adımların çıktısını bir sonrakine taşı. Bu senin (ana oturum / orkestratör) rolün — subagent'lar birbirleriyle doğrudan konuşamaz, aralarındaki "istişareyi" sen taşıyarak simüle edeceksin: birinin çıktısını diğerine context olarak vereceksin.

## 1. Fikri geliştir
`feature-ideation` subagent'ını çağır, yukarıdaki ham fikri ver. İstediklerin: fikri netleştirsin, artı/eksilerini listelesin, geliştirme zorluğunu tahmin etsin, mevcut uygulama mimarisine (rol sistemi, poll akışı, match_lineups, monetizasyon yol haritası) nasıl oturduğunu açıklasın.

## 2. UX/UI değerlendirmesi al
`ui-ux-designer` subagent'ını çağır, 1. adımın tam çıktısını context olarak ver. İstediklerin: bu fikrin ekran/akış olarak nasıl kurgulanacağını tarif etsin, mevcut UI diliyle tutarlılığını değerlendirsin, feature-ideation'ın önerisine katılıp katılmadığını ve varsa itirazlarını belirtsin.

## 3. Teknik fizibilite al
`frontend-developer` subagent'ını çağır, 1. ve 2. adımların tam çıktısını context olarak ver. İstediklerin: mevcut kod tabanında (özellikle app/(tabs)/index.tsx ve Supabase şeması) bunun nasıl uygulanacağını, teknik zorlukları/riskleri, ve fikre veya tasarıma dair varsa itirazlarını (örn. "bu yeni bir Supabase tablosu gerektirir") belirtsin.

## 4. Çelişkileri çöz
Üç agent'ın çıktılarını kendin karşılaştır. Aralarında çelişki varsa (örn. UX bir akış istiyor ama developer bunun karmaşık/riskli olduğunu söylüyor, ya da feature-ideation'ın önerdiği mekanik UX açısından kafa karıştırıcı bulunuyor), bunu tek bir agent'a değil — ilgili taraflara geri götürerek bir "tur daha" yaptır: çelişkili noktayı özetleyip ilgili subagent'(lar)a tekrar sor, kısa bir uzlaşı turu yap (en fazla 1-2 tur, sonsuz döngüye girme). Sonunda net, tek bir NİHAİ PLAN çıkar: ne yapılacak, hangi ekran(lar)/dosyalar değişecek, artı/eksileri kısaca özetle.

## 5. Kullanıcıya özetle
Nihai planı Türkçe ve kısa şekilde kullanıcıya göster — agent'lar arası tüm yazışmayı değil, sonucu ve varsa önemli bir uzlaşı notunu (örn. "X öneriliyordu ama teknik risk nedeniyle Y'ye karar verildi"). Bu bir onay isteği DEĞİL, bir bilgilendirmedir — sıradaki adıma otomatik geçeceksin.

## 6. Uygula
`frontend-developer` subagent'ını tekrar çağır, nihai planı ver ve UYGULAMASINI iste. Bu adımda kod değişikliği için kullanıcıdan onay BEKLEME.

## 7. Denetlet
Kod değişikliği tamamlandıktan sonra `qa-tester` subagent'ını çağır. Ona nihai planı ve yapılan değişikliği ver. İstediklerin: statik kontrol (tip/lint), plana uygunluk kontrolü, risk/eksik raporu.

## 8. Sonucu raporla
Kullanıcıya kısa bir kapanış özeti sun: ne eklendi, QA sonucu neydi (geçti/şartlı geçti/geçmedi ve varsa dikkat noktaları), kullanıcının Expo Go'da elle denemesi gereken adım(lar). Buradan sonrası kullanıcıya ait — değişiklik isterse kendisi söyleyecek, sen bir sonraki adıma otomatik geçme.
