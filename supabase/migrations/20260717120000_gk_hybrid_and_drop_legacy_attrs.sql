-- Nitelik sistemi yeniden yapılandırması — 2. adım:
--   1) Kaleci HİBRİT modeli: halı sahada kaleci maç içinde döner. Sabit
--      kaleci "primary/secondary_position = KALECI" ile zaten destekleniyor.
--      Buna ek olarak, o maçta fiilen kale koyan SAHA oyuncusunu işaretlemek
--      için match_lineups'a played_as_goalkeeper kolonu eklenir. Bu işaret
--      maç sonu istatistik/oylama ekranında set edilecek (sonraki adım).
--      Böylece kalecilik istatistiği iki kaynaktan birikebilir:
--        - sabit KALECI mevkisi, ve
--        - o maçta kale koyan saha oyuncusu.
--   2) Eski jenerik nitelik seti (pace/shooting/passing/physical/overall)
--      koddan tamamen söküldü; OVR artık attributes(jsonb) + POSITION_WEIGHTS
--      ile MEVKİYE GÖRE AĞIRLIKLI hesaplanıp overall_rating'e yazılıyor.
--      Bu kolonlar artık okunmuyor — şemadan da kaldırılıyor.

-- 1) Kaleci hibrit işareti ------------------------------------------------
alter table public.match_lineups
  add column if not exists played_as_goalkeeper boolean not null default false;

comment on column public.match_lineups.played_as_goalkeeper is
  'Bu maçta bu oyuncu (saha oyuncusu olsa bile) fiilen kalecilik yaptı mı? Maç sonu ekranında set edilir; kalecilik istatistiği bu işaret + sabit KALECI mevkisinden birikir.';

-- 2) Eski jenerik nitelik kolonlarını kaldır ------------------------------
-- (position kolonu KL/DEF/ORT/FOR saha-kovası olarak hâlâ fallback amacıyla
--  kullanılıyor; ona dokunulmuyor. Sadece jenerik nitelik/OVR kolonları.)
alter table public.team_members
  drop column if exists pace,
  drop column if exists shooting,
  drop column if exists passing,
  drop column if exists physical,
  drop column if exists overall;

alter table public.guest_players
  drop column if exists pace,
  drop column if exists shooting,
  drop column if exists passing,
  drop column if exists physical,
  drop column if exists overall;
