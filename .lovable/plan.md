## Bug Fix Plan — WebRTC Media + Presence

### Task 1 — WebRTC media tracks (peers connect, no audio/video)

**Root causes in `src/hooks/usePeerMesh.ts`:**

1. `ensurePC` adds tracks **only if** `localStreamRef.current` exists. When `acquireMedia()` succeeds, the new tracks are added to existing PCs but **no explicit renegotiation is triggered** — `onnegotiationneeded` is unreliable (doesn't always fire when adding tracks to a not-yet-connected PC, and never fires at all on the impolite side after answer).
2. `ensurePC` doesn't pre-add transceivers, so a PC created reactively from an incoming offer may answer with `recvonly` direction → remote sees nothing from us.
3. `pc.ontrack` reads `ev.streams[0]` and assumes it exists. Some browsers / track-only events have empty `streams`. We should construct/cache a per-peer remote `MediaStream` and `addTrack` to it on every `ontrack` event so both audio and video accumulate into one stream.
4. `ev.streams[0]` may differ between audio and video → we currently overwrite the previous stream and lose one track.

**Fixes:**

- Pre-create audio + video transceivers (`pc.addTransceiver("audio", { direction: "sendrecv" })`, same for video) inside `ensurePC` so SDP always offers/answers sendrecv even before media is ready. Replace tracks via `sender.replaceTrack(localTrack)` once media is acquired (and on toggle).
- In `ontrack`, maintain a `remoteStreamsRef: Map<peerId, MediaStream>`. On each event, get/create the peer's `MediaStream`, `addTrack(ev.track)` to it, and use that single stream for the React state. Add `ev.track.onunmute` log.
- After `acquireMedia()` resolves, iterate `pcsRef` and call `sender.replaceTrack(track)` on each transceiver instead of `addTrack` (avoids duplicate m-lines and forced renegotiation).
- Add detailed `console.log("[WebRTC]", ...)` for: transceiver creation, replaceTrack, ontrack with kind, remote stream track count.

### Task 2 — ICE candidate buffering

Current logic queues ICE only when `pc.remoteDescription` is missing, and flushes after `setRemoteDescription` of offer/answer. This is correct in shape, but:

- The flush loop runs `try { await pc.addIceCandidate(c) } catch {}` — silent. Add `console.warn("[WebRTC Error] ice add failed", e)` so we can detect lost candidates.
- After `setRemoteDescription(answer)` we currently flush only when `signalingState === "have-local-offer"`. Move the flush to **always** run after any successful `setRemoteDescription`, regardless of branch.

### Task 3 — Presence (friends always show offline)

**Root cause in `src/hooks/useFriendsBroadcast.ts`:**

The presence sync handler reads `presenceState()` correctly, but `displayName` comes from `meta.displayName`. The Supabase realtime presence payload nests metas under `arr[0]`, which we already handle. The likely real bug is one of:

1. `broadcast: { self: false }` is set for a channel that we also use for presence — fine in practice, but confirm presence still tracks self when `key === userId`.
2. **Presence key conflict**: multiple browser tabs of same user use same key → Supabase merges them, fine.
3. **Most likely**: when the user's `displayName` is `undefined` at first render (auth still loading), `track()` runs with stale value, and subsequent re-renders don't re-track. The `useEffect` deps are `[enabled, userId, displayName]`, so it should re-subscribe — which actually recreates the channel each time `displayName` changes, briefly dropping presence.

**Fixes:**

- Keep `useEffect` deps to `[enabled, userId]` only. Store `displayName` in a ref and read from it inside `track()`.
- Re-track when `displayName` changes (call `ch.track({ userId, displayName })` again) without recreating the channel.
- Add `console.log("[Presence Sync]", Object.keys(state))` inside the sync handler to confirm presence updates arrive.
- Add explicit `console.log("[Presence Sync] tracked", userId)` after `await ch.track(...)`.
- Verify FriendsModal already maps `onlineUsers[fid]` correctly — it does. The green dot logic is correct, so the fix above should make friends light up.

### Files to edit

- `src/hooks/usePeerMesh.ts` — transceivers, remote stream accumulation, ICE flush, logging.
- `src/hooks/useFriendsBroadcast.ts` — stable channel + ref-based displayName + sync logs.

No DB changes, no UI text changes, Uzbek strings untouched.
