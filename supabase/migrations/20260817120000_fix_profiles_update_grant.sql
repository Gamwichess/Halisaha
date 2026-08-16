-- DÜZELTME — profil kaydetme "permission denied for table profiles" veriyordu
--
-- SEMPTOM: Profil ekranında değişiklik yapıp Kaydet'e basınca hata. Ekranda değer
-- güncel kalıyordu ama bu yalnızca React state'iydi — veritabanına YAZILMIYORDU.
--
-- KÖK NEDEN: İstemci `.upsert({ id, display_name, main_position, avatar_url,
-- preferred_foot })` kullanıyor. PostgREST bunu şuna çeviriyor:
--     insert into profiles (...) values (...)
--     on conflict (id) do update set id = excluded.id, display_name = ..., ...
-- Yani `id` DE update listesine giriyor. 20260816130000_enable_rls.sql'de `id`ye
-- yalnızca INSERT yetkisi verilmişti, UPDATE verilmemişti → permission denied.
--
-- NOT: Bu bir POLICY hatası değil, KOLON YETKİSİ hatasıydı. Ayırt edici işaret:
-- Postgres policy ihlalinde "new row violates row-level security policy" der;
-- "permission denied for table X" ise grant eksikliğidir. Teşhiste bu ayrım kullanıldı.
--
-- GÜVENLİ Mİ: Evet. profiles_update policy'sinde `with check (id = auth.uid())`
-- var; kullanıcı id'yi başkasınınkine çeviremez, satır kendi satırı kalmak zorunda.

grant update (id) on public.profiles to authenticated;

comment on table public.profiles is
  'RLS + kolon bazlı yetki. push_token ve pending_invite_code OKUNAMAZ (yalnızca yazılır). id hem insert hem update yetkisine sahip olmalı — istemci upsert kullanıyor ve ON CONFLICT DO UPDATE, id kolonunu da SET listesine koyuyor.';
