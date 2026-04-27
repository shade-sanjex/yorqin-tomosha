## Overview

Six modular tasks, executed in this order: (1) DB schema + secrets, (2) LiveKit token edge function + LiveKit room UI, (3) react-player based player with YouTube + MP4 + sync, (4) Dynamic playback permissions, (5) Public/private lobby + join requests, (6) Profile system, (7) Telegram-style global presence. All UI in O'zbek (Latin).

## ⚠️ User-required step BEFORE I can finish Task 1

LiveKit secrets must be stored as **Lovable Cloud (runtime) secrets**, not in `.env` (the project's `.env` is auto-managed by Lovable Cloud and only contains Supabase keys; user-added lines there are wiped). After plan approval I will call `add_secret` for these three names — please paste the values when prompted:

- `LIVEKIT_URL` → `wss://kinoteatr-olfy4t22.livekit.cloud`
- `LIVEKIT_API_KEY` → `APIYzAEN2XK9Hzu`
- `LIVEKIT_API_SECRET` → `whAums3gvqodWtyQmUMf8OIX7IJVC2D0OH9ed6TMxLm`

These are read inside the edge function only; they never reach the browser bundle. I will also expose `LIVEKIT_URL` to the client via a small server-fn endpoint (not as `VITE_*`) so the websocket URL stays config-driven without leaking the API key/secret.

---

## Task 0 — Database migration

Single migration adding what the new features need. Existing rows stay intact.

```sql
-- rooms: lobby + permissions + youtube
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_active  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS controllers uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS video_kind text NOT NULL DEFAULT 'file'
    CHECK (video_kind IN ('file','youtube'));

-- public list policy already exists (rooms_select_auth = true), so no policy change needed.

-- avatars storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars','avatars', true)
ON CONFLICT (id) DO NOTHING;

-- avatars bucket policies: anyone can view, owner can write to own folder
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars_owner_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_owner_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_owner_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
```

`is_active` is set by the host's client: `true` on room mount + presence track, `false` on unmount/visibility-hidden via a Realtime presence-driven update.

---

## Task 1 — LiveKit (replaces `usePeerMesh`)

**Backend** — new edge function `supabase/functions/livekit-token/index.ts`:
- Validates the caller's JWT (Supabase user must be authenticated).
- Body: `{ roomId: string, displayName: string }`.
- Uses `livekit-server-sdk` (Deno-compatible) to mint a `videoGrant` token with identity = `auth.uid()`, name = `displayName`, room = `roomId`, `canPublish: true`, `canSubscribe: true`.
- Returns `{ token, url }` where `url` comes from `LIVEKIT_URL` env.
- Configured with `verify_jwt = false` in `supabase/config.toml` (function does its own JWT check via the Authorization header) — but we'll keep default JWT verification on by default; simpler path is `verify_jwt = true` in config.toml so Supabase enforces auth automatically.

**Client deps**: `bun add @livekit/components-react livekit-client`.

**New hook** `src/hooks/useLiveKitToken.ts`: calls the edge function, returns `{ token, url, loading }`.

**Refactor `room.$roomId.tsx`**:
- Remove `usePeerMesh` import + state. Delete `src/hooks/usePeerMesh.ts`.
- Wrap the room body in `<LiveKitRoom serverUrl={url} token={token} connect audio video data-lk-theme="default">`.
- Inside, replace current `<CameraGrid …peerMesh props…/>` with new `<LiveKitCameraGrid hostId={room.host_id} />`.
- Use `<RoomAudioRenderer />` so all remote audio plays.

**Rewrite `src/components/CameraGrid.tsx`**:
- Use `useTracks([Track.Source.Camera, Track.Source.Microphone])` and `useLocalParticipant()`.
- Render each participant tile with the existing dark cinematic styling (avatar fallback, name overlay, host crown, mic-off badge, mirror local video via `transform: rotateY(180deg)`).
- Keep mic/cam toggle buttons — implement via `localParticipant.setMicrophoneEnabled` / `setCameraEnabled`.
- Keep host moderation menu: "Hammaga ovozini o'chirish" (server side via mute API requires server token; for now we send a **broadcast** through the existing Supabase moderation channel — same UX as today). "Xonadan chetlatish" likewise stays on the existing moderation broadcast channel (simpler than adding RoomService).

**Removed/changed**:
- Delete `src/hooks/usePeerMesh.ts`.
- The `permError` UX moves to a thin wrapper around LiveKit `useRoomContext()`/`MediaDeviceFailure` listener; same Uzbek strings.

---

## Task 2 — YouTube + custom synced player (`react-player`)

**Deps**: `bun add react-player`.

**New component** `src/components/SyncedPlayer.tsx`:
- Props: `room`, `isHost`, `canControl`, `videoRef`-like API.
- If `room.video_kind === 'youtube'` → renders `<ReactPlayer url={room.video_url} controls={false} playing={state.isPlaying} onProgress={…} onDuration={…} muted={false} width="100%" height="100%" config={{ youtube: { playerVars: { modestbranding: 1, rel: 0, iv_load_policy: 3, disablekb: 1 } } }} />`. We expose seek via the player's `seekTo()` API through a ref.
- If `room.video_kind === 'file'` → uses `<ReactPlayer url={room.video_url} />` too — same code path, gets us a unified API and keeps mp4/webm working.
- Custom overlay (Play/Pause, Seek slider, Volume, Fullscreen) reuses the existing JSX from `room.$roomId.tsx` lines 610-668 with minor changes to call `playerRef.current.seekTo(sec)` instead of `videoRef.current.currentTime = sec`.

**URL input bar** (above the video): a shared `<Input placeholder="YouTube ssilkasini kiriting yoki fayl yuklang…">` + a `Yuklash` button. On submit we detect:
- YouTube regex (`youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `youtube.com/embed/`) → set `video_kind='youtube'`, `video_url=<original>`, `video_storage_path=null`.
- mp4/webm URL → existing flow.
- Otherwise show toast `uz.invalidUrl` (reword to "YouTube ssilkasi yoki .mp4/.webm kerak").

Visible to anyone who `canControl` (host or controller, see Task 3).

**Sync** stays on the existing `useSyncedPlayer` channel `room:{id}:player`. Updates needed:
- Player payload now also includes `videoUrl` + `videoKind` (it already includes `videoUrl`; add `videoKind`).
- Apply-remote logic uses `playerRef.seekTo(p.playbackTime)` for `react-player`.
- Switching the URL: when `videoUrl` changes (db row update), all clients automatically reload because `<ReactPlayer url=…>` reacts to the prop.

**Custom controls hide YouTube chrome**: `controls={false}` plus the playerVars above; we cover the iframe with our own gradient overlay (already in JSX). YouTube branding still appears briefly on first load — that's a YouTube ToS requirement and unavoidable.

---

## Task 3 — Dynamic playback permissions

**State** is the `controllers uuid[]` column on `rooms`. We compute:

```ts
const canControl = isHost || (room.controllers ?? []).includes(user.id);
```

`useSyncedPlayer` currently keys on `isHost`. We change it to accept `canControl` (rename internally) so any controller can broadcast play/pause/seek and the DB write is gated by RLS. The existing RLS `rooms_update_host` only allows the host to UPDATE the row, so non-host controllers must broadcast over the player channel **without** writing to the DB. The host will mirror controller actions into the DB (controllers → host realtime echo → host writes to db). Practically:

- Controllers send `{event: 'player'}` broadcasts directly (write path stays via the channel).
- The host (or whoever has DB write permission) listens to the player channel and persists state to the DB on a debounced 1.5s interval (we already have `HOST_BROADCAST_INTERVAL`). If the host isn't present, controllers' state is still synced to all clients live; persistence simply pauses until host reconnects. This keeps RLS strict and avoids a server function.

**UI** in CameraGrid host dropdown menu (already exists per-tile):
- New `DropdownMenuItem` with a Switch icon: `uz.grantControl` / `uz.revokeControl` ("Boshqarish huquqini berish" / "Boshqarish huquqini olish").
- Action: `supabase.from('rooms').update({ controllers: [...] }).eq('id', roomId)`.
- Visible only to host. Toast: `"Boshqarish huquqi {name}ga berildi"`.

The Play/Pause button and seek slider in the player overlay become enabled when `canControl` is true.

---

## Task 4 — Public/private lobby + join requests

**Dashboard "Faol Xonalar" section** (added to `src/routes/dashboard.tsx`):
- New query: `from('rooms').select('id, name, host_id, is_active, is_private').eq('is_private', false).eq('is_active', true)` — filters to public + active. Subscribe to `postgres_changes` on `rooms` for live updates.
- Render the host's display name via the existing `useProfiles` hook.
- Each card has a "Qo'shilish" button.

**Join request flow** (no new tables — uses Realtime broadcast + a per-host channel):
- When a guest clicks "Qo'shilish" on a public room: send broadcast on `room:{id}:lobby` channel `{event: 'join-request', payload: {fromId, fromName}}`. Show local toast: `"So'rov yuborildi, kuting…"`.
- The host has subscribed to that channel while sitting on `/dashboard` AND while inside `/room/$roomId`. On `join-request`, host gets a Sonner toast with Accept/Decline buttons.
- Accept → host replies on the same channel `{event: 'join-response', payload: {toId, accepted: true}}`. Guest navigates to `/room/$roomId`.
- Decline → guest gets toast `uz.requestDeclined`.
- Friend invites + private rooms keep the existing direct broadcast/link mechanism (no lobby gate).

**Room create dialog gets a privacy switch**: `is_private` toggle (default true to preserve current behavior). Stored on insert.

**`is_active` lifecycle**:
- On host enters their own room: `update({ is_active: true })`.
- On host leaves / window unload: `update({ is_active: false })` via `navigator.sendBeacon` fallback + `beforeunload` + the existing cleanup useEffect.

---

## Task 5 — User profile system

**Route** `src/routes/profile.tsx`:
- Auth-gated.
- Loads current `profiles` row.
- Form fields: `display_name` (Input) + avatar uploader (file input with preview).
- Avatar upload: `supabase.storage.from('avatars').upload(\`${user.id}/avatar.${ext}\`, file, { upsert: true })` → `getPublicUrl` → save to `profiles.avatar_url`.
- Save button: `supabase.from('profiles').update({ display_name, avatar_url }).eq('id', user.id)`.
- After save, toast `"Profil yangilandi"` and navigate back.

**Header link**: small avatar button in dashboard header → navigates to `/profile`.

**Propagation**:
- LiveKit identity uses the latest `display_name` from `profiles` when minting the token (edge function passes `name` field; UI passes the current value at connect time).
- `useFriendsBroadcast` already re-tracks presence when `displayName` changes, so friends list sees the new name instantly.
- Friends list `useFriendProfiles` cache: bust the entry for the current user on profile save (we expose a `refresh(userId)` from the hook or simply clear the cache for that id).

---

## Task 6 — Telegram-style ultra-fast presence

Refactor `useFriendsBroadcast` presence side into a dedicated hook `usePresence` (still uses the same `global:friends` channel so we don't double-subscribe):

- Channel config tightens heartbeats: `presence: { key: userId }` already there. Add `realtime: { params: { eventsPerSecond: 20 } }` at the supabase client level if not already; LiveKit + presence both benefit. We will set this in `client.ts` carefully (preserving auto-generated comment header; only adding to the options object).
- On `window` events `pagehide`, `beforeunload`, and `visibilitychange→hidden` → call `ch.untrack()` so peers see us drop within ~1s.
- On `visibilitychange→visible` → call `ch.track({ userId, displayName })` again.

**UI presence dot component** `src/components/PresenceDot.tsx`:
- Pure, takes `online: boolean`.
- Online: `bg-success` with subtle glow `shadow-[0_0_6px_rgba(34,197,94,0.7)] animate-pulse-soft`.
- Offline: `bg-muted-foreground/50`, no glow.
- No text label anywhere.

**Restore presence dots** (per user instruction this task RE-ENABLES them, replacing the previous "remove all presence UI" sprint):
- `FriendsModal.tsx` "My friends" list: dot in the bottom-right corner of the avatar.
- `InviteFriendsDialog.tsx`: dot on each friend, no online filter (everyone listed, button always enabled).
- New on the room participant list / camera tile name overlay.

I will update `src/lib/uz.ts` to **remove** `online`/`offline` text constants since the user wants no labels (keep them defined for safety but stop using).

---

## Files

**Create:**
- `supabase/functions/livekit-token/index.ts` (+ `_shared/cors.ts` if missing)
- `src/hooks/useLiveKitToken.ts`
- `src/hooks/usePresence.ts` (or refactor inside existing hook — final decision during impl)
- `src/components/SyncedPlayer.tsx`
- `src/components/PresenceDot.tsx`
- `src/components/LobbyList.tsx` (Faol Xonalar)
- `src/components/JoinRequestListener.tsx` (mounted globally for hosts)
- `src/routes/profile.tsx`

**Edit:**
- `supabase/config.toml` (function block for `livekit-token`)
- `src/integrations/supabase/client.ts` (only the createClient options to add `realtime.params.eventsPerSecond`)
- `src/components/CameraGrid.tsx` (rewrite around LiveKit hooks)
- `src/components/FriendsModal.tsx` (re-add presence dot, no text)
- `src/components/InviteFriendsDialog.tsx` (re-add presence dot, no text)
- `src/components/GlobalFriendsProvider.tsx` (mount JoinRequestListener)
- `src/hooks/useFriendsBroadcast.ts` (faster presence drop on tab close)
- `src/hooks/useSyncedPlayer.ts` (replace `isHost` gating with `canControl`, include `videoKind` in payload)
- `src/routes/dashboard.tsx` (Faol Xonalar section, privacy switch on create, profile link)
- `src/routes/room.$roomId.tsx` (LiveKit wrapper, SyncedPlayer, controllers menu, is_active toggle, YouTube URL input)
- `src/lib/uz.ts` (new strings)

**Delete:**
- `src/hooks/usePeerMesh.ts`

## Acceptance checks

- `bunx tsc --noEmit` passes.
- LiveKit room: 3 tabs see and hear each other; mirror works locally only.
- YouTube: paste a YouTube URL, all clients load the same video; play/pause/seek by host or controller stays in sync within ~0.6s.
- Host dropdown can grant control; controller buttons enable instantly via DB realtime.
- Public room appears in another user's "Faol Xonalar"; clicking "Qo'shilish" sends host an Accept/Decline toast; on accept the guest navigates in. Private room is invisible in lobby.
- Profile page updates name + avatar; new name appears in LiveKit name tag and in friends list.
- Closing a tab: friend list dot turns gray within ~1s with no text.
