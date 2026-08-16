-- RLS'İ AÇ — tüm uygulama tabloları + storage
--
-- ÖNKOŞUL: 20260816120000_rls_helpers_and_rpcs.sql uygulanmış olmalı.
-- ÖNKOŞUL: İstemci kodu RPC'lere geçmiş olmalı (create_team, accept_team_invite,
--          lookup_team_invite, get_match_rating_averages, guest_has_history,
--          my_pending_invite) ve profiles select'leri açık kolon listesi kullanmalı.
--          Aksi halde takım oluşturma / katılma / OVR işleme KIRILIR.
--
-- GERİ ALMA: 20260816140000_rollback_rls.sql (uygulanmadı, acil durum için hazır).
--
-- TASARIM
--   • Her şey takım üyeliğine dayanır: is_team_member / is_team_manager.
--   • Bu fonksiyonlar SECURITY DEFINER — team_members policy'sinin kendi tablosuna
--     sorgu atıp sonsuz döngüye girmesi böyle engellenir.
--   • FORCE ROW LEVEL SECURITY KULLANILMIYOR: force, tablo sahibine de RLS uygular
--     ve postgres'e ait SECURITY DEFINER fonksiyonlarımızı kırardı.
--   • anon rolünden tüm tablo yetkileri alınır. Uygulamanın anon key'i APK/IPA
--     içinde gömülü ve çıkarılabilir; anon hiçbir uygulama verisine erişmemeli.

-- ─────────────────────────────────────────────────────────────
-- 0. ANON'U TAMAMEN KAPAT
-- ─────────────────────────────────────────────────────────────

revoke all on public.profiles       from anon;
revoke all on public.teams          from anon;
revoke all on public.team_members   from anon;
revoke all on public.polls          from anon;
revoke all on public.poll_votes     from anon;
revoke all on public.guest_players  from anon;
revoke all on public.notifications  from anon;
revoke all on public.team_invites   from anon;
revoke all on public.match_lineups  from anon;
revoke all on public.player_ratings from anon;
revoke all on public.match_stats    from anon;
revoke all on public.match_goals    from anon;

-- ─────────────────────────────────────────────────────────────
-- 1. PROFILES
--
-- Kolon bazlı yetki: push_token ve pending_invite_code OKUNAMAZ.
--   • push_token — Expo push API kimlik doğrulaması istemiyor; token'ı bilen
--     herkes o kişiye bildirim gönderebilir.
--   • pending_invite_code — takım arkadaşının görmesi, onun henüz üye OLMADIĞI
--     bir takımın davet kodunu öğrenmesi demek.
-- İkisi de yazılabilir (kendi satırında), sadece okunamaz.
-- Kendi bekleyen davet kodunu okumak için: my_pending_invite() RPC.
-- ─────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;

revoke all on public.profiles from authenticated;
grant select (id, display_name, main_position, avatar_url, preferred_foot, created_at)
  on public.profiles to authenticated;
grant insert (id, display_name, main_position, avatar_url, preferred_foot, push_token, pending_invite_code)
  on public.profiles to authenticated;
grant update (display_name, main_position, avatar_url, preferred_foot, push_token, pending_invite_code)
  on public.profiles to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_team_with(id));

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 2. TEAMS
-- Oluşturma create_team() RPC'sinden geçer — doğrudan INSERT policy'si YOK.
-- Sebep: takım + kaptan üyeliği atomik olmalı, yoksa kaptansız öksüz takım kalır.
-- ─────────────────────────────────────────────────────────────

alter table public.teams enable row level security;

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select to authenticated
  using (public.is_team_member(id));

drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams
  for update to authenticated
  using (public.is_team_manager(id))
  with check (public.is_team_manager(id));

drop policy if exists teams_delete on public.teams;
create policy teams_delete on public.teams
  for delete to authenticated
  using (captain_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 3. TEAM_MEMBERS
-- Kendi kendine INSERT YOK — olsaydı herkes her takıma katılabilirdi.
-- Katılma accept_team_invite() RPC'sinden geçer (davet kodu doğrulanır).
-- DELETE'te kendi satırı var: kullanıcı takımdan ayrılabilmeli.
-- ─────────────────────────────────────────────────────────────

alter table public.team_members enable row level security;

drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members
  for select to authenticated
  using (public.is_team_member(team_id));

drop policy if exists team_members_insert on public.team_members;
create policy team_members_insert on public.team_members
  for insert to authenticated
  with check (public.is_team_manager(team_id));

drop policy if exists team_members_update on public.team_members;
create policy team_members_update on public.team_members
  for update to authenticated
  using (public.is_team_manager(team_id))
  with check (public.is_team_manager(team_id));

drop policy if exists team_members_delete on public.team_members;
create policy team_members_delete on public.team_members
  for delete to authenticated
  using (public.is_team_manager(team_id) or user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 4. POLLS (maçlar)
-- ─────────────────────────────────────────────────────────────

alter table public.polls enable row level security;

drop policy if exists polls_select on public.polls;
create policy polls_select on public.polls
  for select to authenticated
  using (public.is_team_member(team_id));

drop policy if exists polls_insert on public.polls;
create policy polls_insert on public.polls
  for insert to authenticated
  with check (public.is_team_manager(team_id));

drop policy if exists polls_update on public.polls;
create policy polls_update on public.polls
  for update to authenticated
  using (public.is_team_manager(team_id))
  with check (public.is_team_manager(team_id));

drop policy if exists polls_delete on public.polls;
create policy polls_delete on public.polls
  for delete to authenticated
  using (public.is_team_manager(team_id));

-- ─────────────────────────────────────────────────────────────
-- 5. POLL_VOTES (yoklama oyları)
--
-- KARAR D1: takım üyeleri BİRBİRİNİN oy satırlarını okuyabilir.
-- Gizlilik ("oyuncular sadece toplamı görür") bir ARAYÜZ kararı, güvenlik sınırı
-- değil. Katı yapılsaydı Realtime bozulurdu: PlayerVoteScreen postgres_changes
-- dinliyor ve Realtime de RLS'e uyuyor — başkasının satırını göremeyen kullanıcı
-- o değişikliğin olayını da almaz, canlı sayaç güncellenmezdi.
-- ─────────────────────────────────────────────────────────────

alter table public.poll_votes enable row level security;

drop policy if exists poll_votes_select on public.poll_votes;
create policy poll_votes_select on public.poll_votes
  for select to authenticated
  using (public.is_team_member(public.poll_team_id(poll_id)));

drop policy if exists poll_votes_insert on public.poll_votes;
create policy poll_votes_insert on public.poll_votes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_team_member(public.poll_team_id(poll_id))
  );

drop policy if exists poll_votes_update on public.poll_votes;
create policy poll_votes_update on public.poll_votes
  for update to authenticated
  using (user_id = auth.uid() or public.is_team_manager(public.poll_team_id(poll_id)))
  with check (public.is_team_member(public.poll_team_id(poll_id)));

drop policy if exists poll_votes_delete on public.poll_votes;
create policy poll_votes_delete on public.poll_votes
  for delete to authenticated
  using (user_id = auth.uid() or public.is_team_manager(public.poll_team_id(poll_id)));

-- ─────────────────────────────────────────────────────────────
-- 6. GUEST_PLAYERS (jokerler)
-- ─────────────────────────────────────────────────────────────

alter table public.guest_players enable row level security;

drop policy if exists guest_players_select on public.guest_players;
create policy guest_players_select on public.guest_players
  for select to authenticated
  using (public.is_team_member(team_id));

drop policy if exists guest_players_insert on public.guest_players;
create policy guest_players_insert on public.guest_players
  for insert to authenticated
  with check (public.is_team_manager(team_id));

drop policy if exists guest_players_update on public.guest_players;
create policy guest_players_update on public.guest_players
  for update to authenticated
  using (public.is_team_manager(team_id))
  with check (public.is_team_manager(team_id));

drop policy if exists guest_players_delete on public.guest_players;
create policy guest_players_delete on public.guest_players
  for delete to authenticated
  using (public.is_team_manager(team_id));

-- ─────────────────────────────────────────────────────────────
-- 7. NOTIFICATIONS
-- İstemci yazmıyor; edge function service_role ile yazıyor (RLS'i baypas eder).
-- ─────────────────────────────────────────────────────────────

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 8. TEAM_INVITES
-- Kodla arama lookup_team_invite() RPC'sinden geçer — policy'yi gevşetmek,
-- kod deneyerek tüm davet listesinin çekilmesine izin verirdi.
-- ─────────────────────────────────────────────────────────────

alter table public.team_invites enable row level security;

drop policy if exists team_invites_select on public.team_invites;
create policy team_invites_select on public.team_invites
  for select to authenticated
  using (public.is_team_manager(team_id));

drop policy if exists team_invites_insert on public.team_invites;
create policy team_invites_insert on public.team_invites
  for insert to authenticated
  with check (public.is_team_manager(team_id));

drop policy if exists team_invites_delete on public.team_invites;
create policy team_invites_delete on public.team_invites
  for delete to authenticated
  using (public.is_team_manager(team_id));

-- ─────────────────────────────────────────────────────────────
-- 9. MATCH_LINEUPS (açıklanmış kadrolar)
-- ─────────────────────────────────────────────────────────────

alter table public.match_lineups enable row level security;

drop policy if exists match_lineups_select on public.match_lineups;
create policy match_lineups_select on public.match_lineups
  for select to authenticated
  using (public.is_team_member(team_id));

drop policy if exists match_lineups_insert on public.match_lineups;
create policy match_lineups_insert on public.match_lineups
  for insert to authenticated
  with check (public.is_team_manager(team_id));

drop policy if exists match_lineups_update on public.match_lineups;
create policy match_lineups_update on public.match_lineups
  for update to authenticated
  using (public.is_team_manager(team_id))
  with check (public.is_team_manager(team_id));

drop policy if exists match_lineups_delete on public.match_lineups;
create policy match_lineups_delete on public.match_lineups
  for delete to authenticated
  using (public.is_team_manager(team_id));

-- ─────────────────────────────────────────────────────────────
-- 10. PLAYER_RATINGS (maç sonu performans oyları)
--
-- KARAR D2: KATI. Kimin kime kaç verdiği gerçekten hassas ve gizlilik
-- politikasında "diğer oyunculara gösterilmez" diye taahhüt edildi.
-- Kullanıcı YALNIZCA kendi verdiği oyları görür.
-- OVR hesabı için gereken ortalamalar get_match_rating_averages() RPC'sinden
-- gelir — o fonksiyon voter_id'yi HİÇ döndürmez.
-- ─────────────────────────────────────────────────────────────

alter table public.player_ratings enable row level security;

drop policy if exists player_ratings_select on public.player_ratings;
create policy player_ratings_select on public.player_ratings
  for select to authenticated
  using (voter_id = auth.uid());

drop policy if exists player_ratings_insert on public.player_ratings;
create policy player_ratings_insert on public.player_ratings
  for insert to authenticated
  with check (voter_id = auth.uid() and public.is_team_member(team_id));

drop policy if exists player_ratings_update on public.player_ratings;
create policy player_ratings_update on public.player_ratings
  for update to authenticated
  using (voter_id = auth.uid())
  with check (voter_id = auth.uid());

drop policy if exists player_ratings_delete on public.player_ratings;
create policy player_ratings_delete on public.player_ratings
  for delete to authenticated
  using (voter_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 11. MATCH_STATS / MATCH_GOALS (maç sonu skor ve goller)
-- match_goals'ta team_id yok; match_stat_team_id() ile ulaşılır.
-- ─────────────────────────────────────────────────────────────

alter table public.match_stats enable row level security;

drop policy if exists match_stats_select on public.match_stats;
create policy match_stats_select on public.match_stats
  for select to authenticated
  using (public.is_team_member(team_id));

drop policy if exists match_stats_insert on public.match_stats;
create policy match_stats_insert on public.match_stats
  for insert to authenticated
  with check (public.is_team_manager(team_id));

drop policy if exists match_stats_update on public.match_stats;
create policy match_stats_update on public.match_stats
  for update to authenticated
  using (public.is_team_manager(team_id))
  with check (public.is_team_manager(team_id));

drop policy if exists match_stats_delete on public.match_stats;
create policy match_stats_delete on public.match_stats
  for delete to authenticated
  using (public.is_team_manager(team_id));

alter table public.match_goals enable row level security;

drop policy if exists match_goals_select on public.match_goals;
create policy match_goals_select on public.match_goals
  for select to authenticated
  using (public.is_team_member(public.match_stat_team_id(match_stat_id)));

drop policy if exists match_goals_insert on public.match_goals;
create policy match_goals_insert on public.match_goals
  for insert to authenticated
  with check (public.is_team_manager(public.match_stat_team_id(match_stat_id)));

drop policy if exists match_goals_update on public.match_goals;
create policy match_goals_update on public.match_goals
  for update to authenticated
  using (public.is_team_manager(public.match_stat_team_id(match_stat_id)))
  with check (public.is_team_manager(public.match_stat_team_id(match_stat_id)));

drop policy if exists match_goals_delete on public.match_goals;
create policy match_goals_delete on public.match_goals
  for delete to authenticated
  using (public.is_team_manager(public.match_stat_team_id(match_stat_id)));

-- ─────────────────────────────────────────────────────────────
-- 12. STORAGE — team_logos
--
-- Eski policy'ler "giriş yapmış HERKES yazabilir" seviyesindeydi
-- (20260801120000_team_identity.sql, oradaki nota göre bu turda daraltılacaktı).
-- Yol biçimi: "<teamId>/logo_<zaman>.jpg" → klasör adı takım kimliği.
-- Okuma açık kalır: bucket public ve logolar paylaşım görselinde kullanılıyor.
-- ─────────────────────────────────────────────────────────────

drop policy if exists "team_logos_read"   on storage.objects;
drop policy if exists "team_logos_insert" on storage.objects;
drop policy if exists "team_logos_update" on storage.objects;
drop policy if exists "team_logos_delete" on storage.objects;

create policy "team_logos_read" on storage.objects
  for select
  using (bucket_id = 'team_logos');

create policy "team_logos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'team_logos'
    and public.can_manage_team_folder((storage.foldername(name))[1])
  );

create policy "team_logos_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'team_logos'
    and public.can_manage_team_folder((storage.foldername(name))[1])
  );

create policy "team_logos_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'team_logos'
    and public.can_manage_team_folder((storage.foldername(name))[1])
  );
