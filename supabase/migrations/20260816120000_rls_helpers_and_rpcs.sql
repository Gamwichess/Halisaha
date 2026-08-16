-- RLS HAZIRLIK — yardımcı fonksiyonlar ve RPC'ler
--
-- Bu migration RLS'i AÇMAZ. Yalnızca RLS açılınca gerekecek olan altyapıyı kurar.
-- Uygulanınca uygulama aynen çalışmaya devam eder.
-- RLS'i açan migration: 20260816130000_enable_rls.sql (SONRA uygulanacak).
--
-- NEDEN SECURITY DEFINER:
--   Her tablo "takım üyesi miyim" kuralıyla korunacak. Ama team_members üstündeki
--   bir policy team_members'a sorgu atarsa Postgres SONSUZ DÖNGÜye girer ve tablo
--   tamamen erişilemez hale gelir. SECURITY DEFINER fonksiyonlar RLS'i baypas
--   ettiği için bu döngü kırılır. (Supabase RLS'inde en sık düşülen tuzak.)
--
-- Tüm fonksiyonlarda `set search_path` var: SECURITY DEFINER + değişken search_path
-- birlikte ayrıcalık yükseltme açığı oluşturur.

-- ─────────────────────────────────────────────────────────────
-- 1. ÜYELİK YARDIMCILARI
-- ─────────────────────────────────────────────────────────────

create or replace function public.is_team_member(p_team uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team
      and tm.user_id = auth.uid()
  );
$$;

comment on function public.is_team_member(uuid) is
  'RLS policy yardımcısı. SECURITY DEFINER — team_members policy''sinin kendi tablosuna sorgu atıp sonsuz döngüye girmesini engeller.';

create or replace function public.is_team_manager(p_team uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team
      and tm.user_id = auth.uid()
      and tm.role in ('captain', 'deputy')
  );
$$;

comment on function public.is_team_manager(uuid) is
  'Kaptan veya yardımcı mı. Yönetim işlemleri (maç kurma, kadro, joker, davet) bununla korunur.';

-- polls üzerinden takıma ulaşan tablolar için (poll_votes'ta team_id yok)
create or replace function public.poll_team_id(p_poll uuid)
returns uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select p.team_id from public.polls p where p.id = p_poll;
$$;

-- match_goals'ta team_id yok; match_stats üzerinden ulaşılır
create or replace function public.match_stat_team_id(p_stat uuid)
returns uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select ms.team_id from public.match_stats ms where ms.id = p_stat;
$$;

-- Profil okuma: kendim, ya da benimle aynı takımda olan biri.
-- SECURITY DEFINER — policy içinden team_members'a sorgu atmak, o tablonun kendi
-- policy'siyle iç içe geçip beklenmedik davranışa yol açmasın.
create or replace function public.shares_team_with(p_user uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.team_members me
    join public.team_members other on other.team_id = me.team_id
    where me.user_id = auth.uid()
      and other.user_id = p_user
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. TAKIM OLUŞTURMA — atomik
--
-- Eskiden istemci önce teams'e, sonra team_members'a insert atıyordu. İkinci adım
-- patlarsa kaptansız öksüz takım kalıyordu. Ayrıca RLS altında "kendi üyeliğini
-- ekleyebilirsin" kuralı, herkesin her takıma katılabilmesi demek olurdu.
-- ─────────────────────────────────────────────────────────────

create or replace function public.create_team(p_name text, p_join_code text)
returns public.teams
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team public.teams;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Takım adı boş olamaz';
  end if;

  insert into public.teams (name, captain_id, created_by, join_code)
  values (trim(p_name), auth.uid(), auth.uid(), p_join_code)
  returning * into v_team;

  insert into public.team_members (team_id, user_id, role)
  values (v_team.id, auth.uid(), 'captain');

  return v_team;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. DAVET KODU — arama ve kabul
--
-- Koda göre takım bulmak için henüz üye DEĞİLSİNİZ, yani "üyesi olduğum takımlar"
-- policy'si bunu keser. Policy'yi gevşetmek ise kod deneyerek tüm takım/davet
-- listesinin çekilmesine izin verirdi. Bu yüzden iki RPC.
-- ─────────────────────────────────────────────────────────────

create or replace function public.lookup_team_invite(p_code text)
returns table (team_id uuid, team_name text, expires_at timestamptz, is_valid boolean)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli';
  end if;

  return query
    select ti.team_id,
           t.name,
           ti.expires_at,
           (ti.expires_at is null or ti.expires_at > now())
    from public.team_invites ti
    join public.teams t on t.id = ti.team_id
    where ti.code = p_code
    limit 1;
end;
$$;

create or replace function public.accept_team_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
  v_expires timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli';
  end if;

  select ti.team_id, ti.expires_at
    into v_team, v_expires
  from public.team_invites ti
  where ti.code = p_code
  limit 1;

  if v_team is null then
    raise exception 'Davet kodu bulunamadı';
  end if;

  if v_expires is not null and v_expires <= now() then
    raise exception 'Davet kodunun süresi dolmuş';
  end if;

  -- Zaten üyeyse sessizce geç (çift katılma denemesi hata vermesin).
  if not exists (
    select 1 from public.team_members tm
    where tm.team_id = v_team and tm.user_id = auth.uid()
  ) then
    insert into public.team_members (team_id, user_id, role)
    values (v_team, auth.uid(), 'player');
  end if;

  return v_team;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. MAÇ SONU OYLAMA — ortalamalar
--
-- İstemci OVR'ı hesaplarken bir maçın TÜM player_ratings satırlarını okuyordu.
-- Oylar "sadece kendi verdiklerin" olarak kısıtlanınca bu kırılır.
-- Çözüm: voter_id'yi HİÇ döndürmeyen, sadece ortalama veren fonksiyon.
-- İstemcinin OVR mantığı (OVR_K yumuşatma, kondisyon çarpanı, mevki ağırlıkları)
-- olduğu yerde kalır — SQL'e kopyalanmaz, iki yerde ayrışma riski doğmaz.
-- ─────────────────────────────────────────────────────────────

create or replace function public.get_match_rating_averages(p_poll uuid)
returns table (rated_user_id uuid, rated_guest_id uuid, attribute text, avg_score numeric)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_team uuid;
begin
  select p.team_id into v_team from public.polls p where p.id = p_poll;
  if v_team is null then
    return;
  end if;
  if not public.is_team_member(v_team) then
    raise exception 'Bu maçın oylarına erişim yetkiniz yok';
  end if;

  return query
    select pr.rated_user_id,
           pr.rated_guest_id,
           pr.attribute,
           avg(pr.score)::numeric
    from public.player_ratings pr
    where pr.poll_id = p_poll
    group by pr.rated_user_id, pr.rated_guest_id, pr.attribute;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. JOKER GEÇMİŞİ
--
-- Joker silinirken "geçmişi var mı" kontrolü match_lineups + player_ratings
-- sayıyordu. Oylar kısıtlanınca sayım yanlış çıkar ve geçmişi olan bir joker
-- SERT silinir → geçmiş kadrolar ve çeşitlilik algoritmasının verisi uçar.
-- ─────────────────────────────────────────────────────────────

create or replace function public.guest_has_history(p_guest uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_team uuid;
begin
  select g.team_id into v_team from public.guest_players g where g.id = p_guest;
  if v_team is null then
    raise exception 'Misafir oyuncu bulunamadı';
  end if;
  if not public.is_team_manager(v_team) then
    raise exception 'Yetkiniz yok';
  end if;

  return exists (select 1 from public.match_lineups ml where ml.guest_id = p_guest)
      or exists (select 1 from public.player_ratings pr where pr.rated_guest_id = p_guest);
end;
$$;

-- Storage policy'si için: logo yolu "<teamId>/logo_*.jpg" biçiminde.
-- Klasör adı geçerli bir uuid değilse ::uuid cast'i HATA verir ve policy patlar;
-- bu yüzden doğrulama fonksiyonun içinde yapılır.
create or replace function public.can_manage_team_folder(p_folder text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_team uuid;
begin
  begin
    v_team := p_folder::uuid;
  exception when others then
    return false;
  end;
  return public.is_team_manager(v_team);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. KENDİ BEKLEYEN DAVET KODUM
--
-- profiles.push_token ve profiles.pending_invite_code kolon bazında okumaya
-- KAPATILIYOR (bkz. RLS migration'ı). Sebep:
--   • push_token: Expo push API kimlik doğrulaması istemiyor — token'ı bilen
--     HERKES o kişiye bildirim gönderebilir. Takım arkadaşına bile açılmamalı.
--   • pending_invite_code: takım arkadaşının görmesi, onun HENÜZ ÜYE OLMADIĞI
--     bir takımın davet kodunu öğrenmesi demek olurdu.
-- Kolon yetkileri satır bazlı olamadığı için "kendi kodumu oku" ayrı fonksiyon.
-- ─────────────────────────────────────────────────────────────

create or replace function public.my_pending_invite()
returns text
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select p.pending_invite_code from public.profiles p where p.id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────
-- 7. YETKİLER
-- ─────────────────────────────────────────────────────────────

revoke all on function public.is_team_member(uuid)             from public, anon;
revoke all on function public.is_team_manager(uuid)            from public, anon;
revoke all on function public.poll_team_id(uuid)               from public, anon;
revoke all on function public.match_stat_team_id(uuid)         from public, anon;
revoke all on function public.shares_team_with(uuid)           from public, anon;
revoke all on function public.create_team(text, text)          from public, anon;
revoke all on function public.lookup_team_invite(text)         from public, anon;
revoke all on function public.accept_team_invite(text)         from public, anon;
revoke all on function public.get_match_rating_averages(uuid)  from public, anon;
revoke all on function public.guest_has_history(uuid)          from public, anon;
revoke all on function public.my_pending_invite()              from public, anon;
revoke all on function public.can_manage_team_folder(text)     from public, anon;

grant execute on function public.is_team_member(uuid)            to authenticated;
grant execute on function public.is_team_manager(uuid)           to authenticated;
grant execute on function public.poll_team_id(uuid)              to authenticated;
grant execute on function public.match_stat_team_id(uuid)        to authenticated;
grant execute on function public.shares_team_with(uuid)          to authenticated;
grant execute on function public.create_team(text, text)         to authenticated;
grant execute on function public.lookup_team_invite(text)        to authenticated;
grant execute on function public.accept_team_invite(text)        to authenticated;
grant execute on function public.get_match_rating_averages(uuid) to authenticated;
grant execute on function public.guest_has_history(uuid)         to authenticated;
grant execute on function public.my_pending_invite()             to authenticated;
grant execute on function public.can_manage_team_folder(text)    to authenticated;
