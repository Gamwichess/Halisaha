# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npx expo start       # Start dev server (scan QR with Expo Go)
npx expo start --tunnel  # Start with tunnel (use when on different networks)
npx expo start --android
npx expo start --ios
```

There are no test or lint scripts configured. TypeScript errors can be checked via the IDE or `npx tsc --noEmit`.

## Architecture

This is a **Turkish-language halı saha (artificial turf football) match management app** built with Expo (React Native) + Supabase.

### Navigation model

The app uses **SPA-style state navigation**, not Expo Router's file-based navigation. The `app/(tabs)/index.tsx` file contains nearly all application logic. Screen transitions happen via `setScreen('create' | 'home' | 'votes' | 'votes_player' | 'kadro' | 'players' | 'taktik' | 'settings' | 'profile_setup' | 'my_team')` state changes — there are no `router.push()` calls for these screens.

The `app/(tabs)/_layout.tsx` provides the tab shell, but the single tab renders the entire SPA.

### Role system

- User role (`captain` | `player`) is stored in Supabase `team_members.role`
- On login, `fetchMyTeam()` reads this and sets `isCaptain` state
- Throughout the UI, `isCaptain` gates captain-only features (editing match info, managing polls, building teams)

### Supabase integration (`supabase.ts`)

- Single client exported from `supabase.ts` at the project root
- Auth uses `AsyncStorage` for session persistence
- Key tables: `profiles`, `teams`, `team_members`, `polls`, `poll_votes`, `notifications`
- `polls` table has a unique partial index: only one active poll per team at a time
- `PlayerVoteScreen` uses Supabase Realtime (`postgres_changes`) to update vote counts live
- `get_poll_summary` is a Supabase RPC function called to fetch aggregated vote counts

### Row Level Security — READ THIS BEFORE TOUCHING THE DATABASE

RLS is **ON** for all 12 app tables and storage (enabled 2026-08-16). This changes how features get added. Full architecture notes live in `DURUM.md` → "RLS Mimarisi".

**Adding a new table** — a fresh table has RLS *off*, which means it is silently world-readable through the anon key embedded in the app binary. No error, no warning. Every new table needs, in the same migration:
```sql
alter table public.<name> enable row level security;
revoke all on public.<name> from anon;
-- + select/insert/update/delete policies
```

**Writing policies** — never `select` from `team_members` inside a policy. A policy on `team_members` that queries `team_members` causes **infinite recursion** and makes the table completely unreachable. Always use the `SECURITY DEFINER` helpers: `is_team_member(team_id)`, `is_team_manager(team_id)`. For poll-scoped tables use `poll_team_id(poll_id)`.

**Adding a column to `profiles`** — `profiles` uses column-level grants (`push_token` and `pending_invite_code` are deliberately unreadable). A new column is **not** selectable until added to the `grant select (...)` list. Also: `select('*')` on `profiles` fails by design — always list columns explicitly.

**Adding a column elsewhere** — table-level grants still apply, so no grant needed. But remember the fallback lesson: a query naming a column that doesn't exist in the DB yet fails *entirely* and silently empties a list (see `fetchUserTeams` in `DURUM.md`).

**When a query needs data the user cannot yet see** (e.g. looking up a team before joining it), the answer is a `SECURITY DEFINER` RPC, not a looser policy — a loose policy lets anyone enumerate the table. Every such RPC needs `set search_path = public, pg_temp`, an internal membership check, `revoke ... from public, anon`, and `grant execute ... to authenticated`.

**Applying migrations** — Claude cannot run `npx supabase db push` (no DB password). The user always applies them. Afterwards, verify anon is still locked out by hitting the REST API with the anon key: every table should return HTTP 401.

**Emergency rollback** — `supabase/rollback/rls_rollback.sql`, deliberately kept *outside* `supabase/migrations/` so `db push` cannot apply it. Run it from the Supabase dashboard SQL editor. It disables RLS but leaves the RPCs in place, so the app keeps working.

### Poll/attendance system

- Captain opens a poll via `handleOpenPoll()` → inserts into `polls` with `is_active: true`
- Players vote in `PlayerVoteScreen` → upserts into `poll_votes` (values: `yes` | `sub` | `no`)
- Captain sees all individual votes; players see only aggregate counts (privacy by design)
- Unread notification badge on home screen reads from `notifications` table

### Team building logic (all client-side)

In `app/(tabs)/index.tsx`:
- `buildBalancedTeams()` — distributes players by position rating scores
- `buildRandomTeams()` — shuffles outfield players randomly
- `applyFormation()` — assigns players to field positions per formation string (`'3-2-1'` etc.)
- Formations are 6-a-side: 1 GK + `def-mid-fwd` outfield players
- Teams persist to `AsyncStorage` (`@teamA`, `@teamB`, `@formationA`, etc.)

### Local persistence

`AsyncStorage` keys used: `@players`, `@votes`, `@match`, `@teamA`, `@teamB`, `@formationA`, `@formationB`, `@pollSettings`

### Key components

| File | Purpose |
|------|---------|
| `app/(tabs)/index.tsx` | Entire app UI — all screens rendered via `setScreen()` state |
| `components/Auth.tsx` | Email/password auth screen (shown when no session) |
| `components/PlayerVoteScreen.tsx` | Player-facing attendance vote screen with Realtime |
| `components/TeamSelection.tsx` | Team selection UI (separate component) |
| `supabase.ts` | Supabase client initialization |
| `constants/theme.ts` | Shared theme tokens |

### Development notes

- The `Talimat.md` file in the repo root is a Turkish-language task specification document used to track feature requests and the DB schema. It is not part of the app.
- The `SS/` directory contains screenshots.
- `supabase/` directory contains edge function or migration files for the project's Supabase backend.
- The app is configured for EAS builds (project ID: `bfa8d530-4b08-450d-be80-97fe073cae94`). **iOS bundle ID and Android package differ**: iOS is `com.gamwi.halisaha`, Android is `com.htapp.halisaha` (the iOS identifier was already taken on Google Play). Neither can be changed after store submission.
