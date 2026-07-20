-- Pozisyon bazlı nitelik sistemi (6 mevki): her oyuncu bir ana + bir ikincil
-- mevki seçer; nitelik formu bu mevkilere göre dinamik üretilir.
-- Eski position/pace/shooting/passing/physical/overall kolonları (FIFA-kart
-- görünümü ve mevcut buildBalancedTeams skorlaması) BİLEREK dokunulmadan
-- bırakıldı — bu yeni kolonlar ayrı, ek bir katman. overall_rating sadece
-- otomatik kadro tamamlamada (task 5) kullanılacak.

do $$ begin
  create type skill_position as enum (
    'KALECI', 'DEFANS', 'ON_LIBERO', 'ORTA_SAHA', 'FORVET_ARKASI', 'FORVET'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.team_members
  add column if not exists primary_position   skill_position,
  add column if not exists secondary_position  skill_position,
  add column if not exists attributes          jsonb not null default '{}'::jsonb,
  add column if not exists overall_rating      numeric;

alter table public.guest_players
  add column if not exists primary_position   skill_position,
  add column if not exists secondary_position  skill_position,
  add column if not exists attributes          jsonb not null default '{}'::jsonb,
  add column if not exists overall_rating      numeric;
