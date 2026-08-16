-- ACİL DURUM — RLS'i geri kapat
--
-- ⚠️ BU DOSYA `supabase/migrations/` İÇİNDE DEĞİL, BİLEREK.
--    Orada olsaydı `npx supabase db push` onu da uygulayıp RLS'i anında geri
--    kapatırdı. Bu dosya YALNIZCA elle çalıştırılır.
--
-- NE ZAMAN KULLANILIR: RLS açıldıktan sonra kullanıcılar uygulamaya giremiyorsa,
-- takım listesi boşalıyorsa veya kadro kurulamıyorsa — yani bir policy yanlışsa.
--
-- NASIL: Supabase Dashboard → SQL Editor → bu dosyanın içeriğini yapıştır → Run.
--
-- ⚠️ Bu, veritabanını yeniden HERKESE AÇIK hale getirir. Yalnızca sorunu teşhis
--    edip düzeltilmiş bir migration hazırlayana kadar geçici olarak kullan.

alter table public.profiles       disable row level security;
alter table public.teams          disable row level security;
alter table public.team_members   disable row level security;
alter table public.polls          disable row level security;
alter table public.poll_votes     disable row level security;
alter table public.guest_players  disable row level security;
alter table public.notifications  disable row level security;
alter table public.team_invites   disable row level security;
alter table public.match_lineups  disable row level security;
alter table public.player_ratings disable row level security;
alter table public.match_stats    disable row level security;
alter table public.match_goals    disable row level security;

-- Kolon bazlı yetkiler de geri verilir (profiles'ta select revoke edilmişti).
grant all on public.profiles       to authenticated, anon;
grant all on public.teams          to authenticated, anon;
grant all on public.team_members   to authenticated, anon;
grant all on public.polls          to authenticated, anon;
grant all on public.poll_votes     to authenticated, anon;
grant all on public.guest_players  to authenticated, anon;
grant all on public.notifications  to authenticated, anon;
grant all on public.team_invites   to authenticated, anon;
grant all on public.match_lineups  to authenticated, anon;
grant all on public.player_ratings to authenticated, anon;
grant all on public.match_stats    to authenticated, anon;
grant all on public.match_goals    to authenticated, anon;

-- Storage'ı eski (gevşek) haline döndür
drop policy if exists "team_logos_insert" on storage.objects;
drop policy if exists "team_logos_update" on storage.objects;
drop policy if exists "team_logos_delete" on storage.objects;

create policy "team_logos_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'team_logos');
create policy "team_logos_update" on storage.objects
  for update to authenticated using (bucket_id = 'team_logos');
create policy "team_logos_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'team_logos');
