-- Takım kimliği: logo + marka rengi
--
-- NOT: Takım rengi MARKA rengidir, saha tarafı rengi DEĞİL. Takım her maç kendi
-- içinde A/B diye ikiye bölünüyor ve A/B'nin kendi sabit renkleri var
-- (mavi #3B82F6 / yeşil #10B981) — bu kolon onları ezmez.

alter table public.teams add column if not exists logo_url text;
alter table public.teams add column if not exists color    text;

-- ── Logo dosyaları için public bucket ────────────────────────────────────
-- Okuma herkese açık (logo uygulamanın her yerinde gösteriliyor),
-- yazma yalnızca giriş yapmış kullanıcıya.
insert into storage.buckets (id, name, public)
values ('team_logos', 'team_logos', true)
on conflict (id) do nothing;

-- storage.objects'te RLS varsayılan olarak AÇIK (uygulama tablolarından farklı
-- olarak), bu yüzden policy şart. Yayın öncesi RLS turunda bunlar
-- "yalnızca o takımın kaptanı/yardımcısı kendi teamId/ klasörüne yazabilir"
-- şeklinde daraltılacak (bkz. YAPILACAKLAR → RLS'i aç).
drop policy if exists "team_logos_read"   on storage.objects;
drop policy if exists "team_logos_insert" on storage.objects;
drop policy if exists "team_logos_update" on storage.objects;
drop policy if exists "team_logos_delete" on storage.objects;

create policy "team_logos_read" on storage.objects
  for select using (bucket_id = 'team_logos');

create policy "team_logos_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'team_logos');

create policy "team_logos_update" on storage.objects
  for update to authenticated using (bucket_id = 'team_logos');

create policy "team_logos_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'team_logos');
