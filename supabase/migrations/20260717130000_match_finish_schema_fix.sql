-- Maç sonu "Maçı Bitir & İstatistik Gir" akışı ŞEMAYA TAKILIYORDU.
--
-- KÖK NEDEN: components/MatchStatsScreen.tsx > handleSave() üç yazım yapıyor:
--   1) match_stats insert
--   2) match_goals insert (gol > 0 gerçek üyeler)
--   3) polls update -> { is_active:false, is_finished:true, finished_at:... }
-- Ancak orijinal 'polls' şemasında (Talimat.md) is_finished / finished_at
-- kolonları HİÇ YOK. 3. adım PostgreSQL 42703 / PostgREST PGRST204
-- ("column is_finished of relation polls does not exist") ile patlıyordu.
-- Ayrıca match_stats/match_goals daha önceki migration remote'a push
-- edilmemişse 1. adım PGRST205 (table not found) veriyordu.
--
-- Bu migration idempotent olarak: polls'a eksik kolonları ekler, istatistik
-- tablolarını garantiler ve kaleci hibrit maç işaretini (match_lineups.
-- played_as_goalkeeper) güvence altına alır. Tek push ile akış çalışır hale gelir.

-- 1) polls: maç bitişi kolonları -----------------------------------------
alter table public.polls
  add column if not exists is_finished boolean not null default false,
  add column if not exists finished_at timestamptz;

-- 2) İstatistik tabloları (daha önce eklenmişti; güvence için idempotent) --
create table if not exists public.match_stats (
  id          uuid primary key default gen_random_uuid(),
  poll_id     uuid not null references public.polls(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  score_a     integer not null default 0,
  score_b     integer not null default 0,
  mvp_id      uuid references public.profiles(id) on delete set null,
  entered_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.match_goals (
  id             uuid primary key default gen_random_uuid(),
  match_stat_id  uuid not null references public.match_stats(id) on delete cascade,
  player_id      uuid not null references public.profiles(id) on delete cascade,
  goals          integer not null default 1,
  created_at     timestamptz not null default now()
);

create index if not exists match_stats_team_id_idx      on public.match_stats(team_id);
create index if not exists match_stats_poll_id_idx      on public.match_stats(poll_id);
create index if not exists match_goals_match_stat_id_idx on public.match_goals(match_stat_id);
create index if not exists match_goals_player_id_idx    on public.match_goals(player_id);

-- 3) Kaleci HİBRİT — maç bazında fiili kaleci işareti (güvence) -----------
-- Sabit kaleci primary/secondary_position='KALECI' ile; o maçta kale koyan
-- saha oyuncusu ise match_lineups.played_as_goalkeeper ile işaretlenir.
-- (Maç sonu ekranı bu işareti sonraki adımda set edecek.)
alter table public.match_lineups
  add column if not exists played_as_goalkeeper boolean not null default false;

-- Proje genelinde RLS TestFlight öncesine kadar kapalı; diğer tablolarla
-- tutarlı olacak şekilde anon/authenticated'a doğrudan erişim veriliyor.
grant select, insert, update, delete on public.match_stats to anon, authenticated;
grant select, insert, update, delete on public.match_goals to anon, authenticated;
