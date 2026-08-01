-- Misafir (joker) oyuncu silme — YUMUŞAK silme desteği
--
-- NEDEN: match_lineups.guest_id → guest_players(id) FK'sı VAR. Geçmişte maça
-- çıkmış bir misafiri sert silmek ya o geçmiş kadro satırlarını uçurur ya da
-- hata verir. Geçmiş kadrolar iki yerde kritik:
--   1) Takım çeşitliliği algoritması son 3 maçın kadrolarını okuyor
--      (fetchPairWeights) — satırlar giderse "kim kiminle oynadı" bilgisi bozulur.
--   2) Maç geçmişi/istatistikleri.
--
-- Bu yüzden: geçmişi OLAN misafir yumuşak silinir (is_active=false, listeden
-- düşer ama satır durur); hiç oynamamış misafir uygulama tarafında sert silinir.

alter table public.guest_players
  add column if not exists is_active boolean not null default true;

comment on column public.guest_players.is_active is
  'false = takımdan çıkarılmış misafir. Listelerde gösterilmez ama geçmiş kadro/oylama satırları korunsun diye kaydı silinmez.';

create index if not exists guest_players_team_active_idx
  on public.guest_players (team_id, is_active);
