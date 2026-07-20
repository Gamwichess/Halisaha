-- match_stats / match_goals tabloları eksikti; MatchStatsScreen.tsx ve
-- app/(tabs)/index.tsx (fetchLastMatchStat, fetchGoalMap) bu tabloları
-- kullanıyor ama hiç oluşturulmamışlardı. "Maçı Bitir & İstatistik Gir"
-- akışı bu yüzden çalışmıyordu (PGRST205: table not found).

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

create index if not exists match_stats_team_id_idx    on public.match_stats(team_id);
create index if not exists match_stats_poll_id_idx    on public.match_stats(poll_id);
create index if not exists match_goals_match_stat_id_idx on public.match_goals(match_stat_id);
create index if not exists match_goals_player_id_idx  on public.match_goals(player_id);

-- Proje genelinde RLS TestFlight öncesine kadar kapalı; diğer tablolarla
-- tutarlı olacak şekilde anon/authenticated'a doğrudan erişim veriliyor.
grant select, insert, update, delete on public.match_stats to anon, authenticated;
grant select, insert, update, delete on public.match_goals to anon, authenticated;
