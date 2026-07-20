-- Maç sonu performans oylaması.
--
-- Her saha oyuncusu (lineup='field'), KENDİSİ HARİÇ diğer saha oyuncularını
-- (üye + misafir) mevkiye göre nitelik nitelik 10 üzerinden puanlar. Oy veren
-- HEP kayıtlı üyedir (misafirlerin hesabı yok); misafirler OYLANABİLİR ama oy
-- VEREMEZ. Oylama penceresi maç bitince (polls.finished_at) açılır, 24 saat
-- sonra kapanır; kapanınca oylar toplanıp nitelikler KADEMELİ güncellenir
-- (client-side lazy, computeOverall tek kaynak). İşleme tek sefer olsun diye
-- polls.ratings_processed_at atomik guard olarak kullanılır.

create table if not exists public.player_ratings (
  id             uuid primary key default gen_random_uuid(),
  poll_id        uuid not null references public.polls(id)          on delete cascade,  -- "maç" = poll
  team_id        uuid not null references public.teams(id)          on delete cascade,
  voter_id       uuid not null references public.profiles(id)       on delete cascade,  -- oy veren: hep üye
  rated_user_id  uuid references public.profiles(id)                on delete cascade,  -- oylanan üye  (ya bu…
  rated_guest_id uuid references public.guest_players(id)           on delete cascade,  -- …ya da bu → misafir oylanabilir)
  attribute      text     not null,                                                    -- POSITION_ATTRIBUTES nitelik adı
  score          smallint not null check (score between 1 and 10),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- rated_user_id / rated_guest_id'den TAM biri dolu olmalı
  constraint rated_one_target check ((rated_user_id is not null) <> (rated_guest_id is not null)),
  -- kimse kendine oy veremez
  constraint no_self_vote check (rated_user_id is null or rated_user_id <> voter_id)
);

-- Aynı maçta, aynı oy veren, aynı oyuncu (üye ya da misafir), aynı nitelik için
-- İKİNCİ oy engellenir. coalesce ile üye/misafir tek anahtara indirgenir.
create unique index if not exists player_ratings_unique
  on public.player_ratings (poll_id, voter_id, coalesce(rated_user_id, rated_guest_id), attribute);

create index if not exists player_ratings_poll_idx       on public.player_ratings(poll_id);
create index if not exists player_ratings_rated_user_idx on public.player_ratings(rated_user_id);

-- OVR işlemenin TEK SEFER çalışmasını sağlayan atomik guard.
-- İşleme: update polls set ratings_processed_at=now() where id=? and
-- ratings_processed_at is null ...  → yalnızca "kazanan" client devam eder.
alter table public.polls
  add column if not exists ratings_processed_at timestamptz;

-- RLS TestFlight öncesine kadar kapalı; diğer tablolarla tutarlı erişim.
grant select, insert, update, delete on public.player_ratings to anon, authenticated;
