# Fixes & New Features for Watch Party

All UI strings stay in **Uzbek (Latin)**. LiveKit connection logic and `.env` are not touched.

## Task 1 — Camera mirroring (local-only)

`src/components/CameraGrid.tsx` (`VideoTile`)
- The `style={isSelf ? { transform: "rotateY(180deg)" } : undefined}` wrapper is correct in spirit but kept on the outer div. Verify and explicitly only mirror the local self-view; remove any inherited transforms on the `<video>` element. Remote tiles render unmirrored.

## Task 2 — Restore local file upload

`src/routes/room.$roomId.tsx` URL toolbar
- Add a "Fayl yuklash" button next to the URL input, wrapping a hidden `<input type="file" accept="video/mp4,video/webm" />`.
- On change: `URL.createObjectURL(file)`, then call `synced.broadcastState({ videoUrl: localUrl, videoKind: "file", playbackTime: 0, isPlaying: false })` so the host's DB row updates and remote peers also receive the broadcast (they will see "Fayl mavjud emas" if they cannot reach the blob URL — acceptable per spec, since each user can play their own local copy and only timestamps sync). Add Uzbek string `uz.uploadLocalFile = "Fayl yuklash"` and `uz.localFileHint`.
- Revoke the object URL on unmount / when replaced.

## Task 3 — Universal playback control

Remove host/controller restriction from playback UI.

`src/components/SyncedPlayer.tsx`
- Drop all `canControl` gating: Play/Pause button always enabled, Slider always enabled, no "Faqat xona yaratuvchisi" pill.
- Always call `onPlay/onPause/onSeek` from any user.

`src/hooks/useSyncedPlayer.ts`
- `broadcastState`: remove the `if (!canControl) return;` guard so any participant can broadcast over `room:{id}:player`.
- Keep DB persistence guarded by `isHost` only (RLS still requires it). Non-hosts' actions propagate via Realtime broadcast immediately; the host echoes to DB on its next state update or via a small handler that mirrors the latest broadcast to DB.

`src/routes/room.$roomId.tsx`
- `onPlayerEvent`: drop the `canControl` check so every user broadcasts their input.
- Pass `canControl={true}` to `SyncedPlayer` (or remove the prop entirely).

## Task 4 — Fix Join Request notifications

Issue: `JoinRequestListener` only subscribes to lobby channels for rooms the user already hosts in DB at mount time. If the user opens the app then creates a room, or the host is currently inside the room route, the lobby channel may not be subscribed in time and broadcast `self: false` filters out anything sent before subscribe.

Fixes:
- `src/components/JoinRequestListener.tsx`
  - Re-subscribe whenever the user's `rooms` list changes: add a `postgres_changes` listener on `rooms` filtered by `host_id=eq.{user.id}` to re-run the loader.
  - Use `toast()` with explicit `action`/`cancel` (already done) but increase visibility: `important: true`-style — add `style: { background: 'hsl(var(--primary))' }` and `duration: Infinity` until acted on.
- Also mount a per-room lobby subscription **inside** `room.$roomId.tsx` for the host as a redundancy: when `isHost`, subscribe to `room:{roomId}:lobby` directly and respond to `join-request` with the same accept/decline toast.
- `LobbyList.requestJoin`: subscribe first, then send the broadcast only after `SUBSCRIBED` (already done) — add a 500ms delay before sending to give host's channel time to be active, or switch to `presence` so host always sees the request.

## Task 5 — Force Mute moderation (actually mutes target)

`src/routes/room.$roomId.tsx`
- Already broadcasts `force-mute` on `moderationChannelRef`. Add a listener on the same channel:
  ```ts
  ch.on("broadcast", { event: "force-mute" }, ({ payload }) => {
    if (payload.targetUserId !== user.id) return;
    // Get LiveKit local participant via a ref / context and disable mic
    lkRoomRef.current?.localParticipant.setMicrophoneEnabled(false);
    toast.warning(uz.mutedByHost);
  });
  ```
- Expose the LiveKit Room instance through a small wrapper (`useRoomContext` from `@livekit/components-react`) inside `RoomBody` so the moderation effect can call `localParticipant.setMicrophoneEnabled(false)`.
- Implementation: create a tiny `<ForceMuteHandler userId selfId />` component rendered inside `<LiveKitRoom>` that uses `useLocalParticipant()` and subscribes to the moderation broadcast — keeps logic close to LiveKit context.

`src/components/CameraGrid.tsx`
- Dropdown already has `uz.forceMute` ("Hammaga ovozini o'chirish"). Rename string to "Ovozini o'chirish" per spec, keep behavior.

## Task 6 — Movie / Anime search (Consumet)

New file `src/components/MediaSearchDialog.tsx`:
- Trigger button "Kino/Anime Qidirish" placed next to the URL input (visible to all participants since playback is universal).
- Dialog with:
  - Search input (Uzbek placeholder "Kino yoki anime nomi...").
  - Tabs: "Anime" (Consumet anilist) | "Kino" (Consumet flixhq/movies).
  - On submit, fetch e.g. `https://api.consumet.org/meta/anilist/{query}` or `/movies/flixhq/{query}`. If request fails or non-200, show toast `uz.searchUnavailable` ("Qidiruv xizmati hozir ishlamayapti").
  - Render result grid (poster + title). On click, fetch streaming link: `/{provider}/watch/{episodeId}` (anime) or `/movies/flixhq/watch?...`. Pick the first `.m3u8` source.
  - Call a callback `onPick(url)` → in room route, broadcast `videoUrl=url, videoKind="file", playbackTime=0, isPlaying=false` (m3u8 plays through ReactPlayer's HLS support — already importable via hls.js if present; otherwise add `hls.js` dep).
- If no .m3u8 returned: toast error.

Add Uzbek strings: `searchMedia`, `searchPlaceholder`, `searchAnime`, `searchMovies`, `searchUnavailable`, `streamUnavailable`, `noSearchResults`.

Update `FILE_RE` to include `.m3u8` (already does) — keep.

Optional dep: `bun add hls.js` if `react-player` does not bundle HLS for the YouTube-only build. Verify by checking `react-player` version. (Not touching `.env`.)

## Files touched
- src/components/CameraGrid.tsx (mirror confirm, label tweak)
- src/components/SyncedPlayer.tsx (remove canControl gating)
- src/hooks/useSyncedPlayer.ts (remove canControl guard on broadcast)
- src/routes/room.$roomId.tsx (file upload, search button, force-mute handler component, host lobby fallback, universal playback events)
- src/components/JoinRequestListener.tsx (subscribe on rooms changes, persistent toast)
- src/components/LobbyList.tsx (slight delay / safer subscribe)
- src/components/MediaSearchDialog.tsx (NEW)
- src/lib/uz.ts (new strings)
- package.json (maybe `hls.js`)

## Out of scope
- `.env`, LiveKit token edge function, DB schema, auth flow.