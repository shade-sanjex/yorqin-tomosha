## Goals

1. Restore WebRTC video/audio between peers (currently broken after polite/impolite refactor).
2. Show real display names in the Friends list and invite dialog (no raw UUIDs).
3. Remove all Onlayn/Oflayn presence UI; invites work unconditionally.

## Task 1 — Fix WebRTC media (`src/hooks/usePeerMesh.ts`)

The current refactor relies on pre-created sendrecv transceivers + `replaceTrack`, but `onnegotiationneeded` can fire before tracks are attached, producing offers without media. We will simplify to the proven pattern requested by the user.

- In `ensurePC`, **remove** the pre-added `addTransceiver("audio"/"video")` calls and the `transceiversRef` map.
- After `acquireMedia` resolves, call `localStream.getTracks().forEach(t => pc.addTrack(t, localStream))` for every existing PC. Also do the same inside `ensurePC` if `localStreamRef.current` already exists at PC creation time.
- Gate offer initiation on having local media: only call `ensurePC(rid)` from the presence-sync block **after** `localStreamRef.current` is set; if media isn't ready yet, defer until `acquireMedia` completes (run a one-shot scan after media is acquired that calls `ensurePC` for all known remote presence keys where `userId < rid`).
- Keep `ontrack` accumulation into a per-peer `MediaStream`, but also prefer `ev.streams[0]` when present:
  ```ts
  const incoming = ev.streams[0] ?? accumulatedStream;
  setPeers(prev => ({ ...prev, [remoteId]: { ...prev[remoteId], userId: remoteId, stream: incoming, ... } }));
  console.log("[WebRTC] Stream attached", remoteId, incoming.getTracks().map(t => t.kind));
  ```
- Remove the `transceiversRef`-based `replaceTrack` logic in `acquireMedia`; replace with `pcsRef.current.forEach((pc) => localStream.getTracks().forEach(t => pc.addTrack(t, localStream)))`.
- `toggleMic`/`toggleCam` keep working via `track.enabled` toggles (no renegotiation needed).

## Task 1b — Verify VideoTile srcObject (`src/components/CameraGrid.tsx`)

Already has `useEffect` setting `ref.current.srcObject = stream` and `autoPlay playsInline`. Add a `console.log("[WebRTC] Stream attached to <video>", name, stream.id)` inside that effect for confirmation. No structural changes needed.

## Task 2 — Resolve friend display names from `profiles`

New small hook `src/hooks/useFriendProfiles.ts`:
- Input: `friendIds: string[]`.
- Fetches `id, display_name, avatar_url` from `profiles` where `id in (...)`, caches in a `Map`.
- Returns `Record<string, { display_name: string; avatar_url: string | null }>`.

Update `src/components/FriendsModal.tsx`:
- Call `useFriendProfiles(friends)`.
- Replace `name = onlineUsers[fid]?.displayName ?? fid.slice(0, 8)` with `profiles[fid]?.display_name ?? "Foydalanuvchi"`.

Update `src/components/InviteFriendsDialog.tsx`:
- Use `useFriendProfiles(friends)` to render every friend (not only online ones).

## Task 3 — Remove Online/Offline presence UI

- `FriendsModal.tsx`: remove the green/gray dot, remove the "Onlayn"/"Oflayn" label span. Keep the avatar + name + remove button.
- `InviteFriendsDialog.tsx`: 
  - Render **all** friends, not `onlineFriends`. 
  - Remove the green presence dot. 
  - Empty state shows only `uz.noFriends` (drop the `noOnlineFriends` branch).
  - Remove the `userNotOnline` warning toast in `FriendsModal.send` so invites/requests are sent unconditionally.
- Keep the underlying presence channel in `useFriendsBroadcast` (used by the broadcast transport itself) but stop surfacing `onlineUsers` in any UI. We will keep the export for compatibility, just not use it in components.

## UI language

All new strings (e.g. fallback "Foydalanuvchi", any tweaked empty states) remain Uzbek (Latin). No new English strings introduced.

## Files touched

- edit `src/hooks/usePeerMesh.ts`
- edit `src/components/CameraGrid.tsx` (add log only)
- create `src/hooks/useFriendProfiles.ts`
- edit `src/components/FriendsModal.tsx`
- edit `src/components/InviteFriendsDialog.tsx`

## Verification

- Run `bunx tsc --noEmit`.
- Console should show `[WebRTC] Stream attached` for each remote peer once tracks arrive, followed by `[WebRTC] Stream attached to <video>` from the tile effect.
- Friends list renders names like "Ali" instead of `7f228820-…`.
- No "Onlayn"/"Oflayn" labels or status dots anywhere; "Taklif qilish" buttons are always enabled.
