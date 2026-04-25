
# Watch Party — Sprint: 6 ta vazifa

Hammasi o'zbekcha (lotin). DB jadvallari qo'shilmaydi — Do'stlar/Taklif tizimi to'liq Supabase **Realtime Broadcast** orqali ishlaydi.

---

## 1) Parolni tiklash (PASSWORD_RECOVERY)

**Muammo:** Email havolasi avtomatik kirgizib `/dashboard`'ga olib boradi.

**Yechim:**
- `useAuth.ts` — `onAuthStateChange` ichida `event === "PASSWORD_RECOVERY"` bo'lsa, `recoveryMode: true` flag qo'shiladi va session bo'lsa ham `/dashboard`'ga yo'naltirilmaydi.
- `auth.tsx`:
  - `useEffect`: `if (user && !recoveryMode) navigate(...)`. Agar `recoveryMode` bo'lsa, mode'ni `"reset-new"` ga o'rnatish.
  - Yangi mode `"reset-new"` — faqat **Yangi parol** maydoni (OTP shart emas), `supabase.auth.updateUser({ password })` chaqiriladi, so'ng `signOut` va `tabs`'ga qaytish.
  - Mavjud OTP oqimi (`forgot-email` → `forgot-otp`) saqlanadi (qo'shimcha alternativ).

---

## 2) Sidebar — Tabs va Ishtirokchilar olib tashlanadi

`src/routes/room.$roomId.tsx` `<aside>` ichida:
- `Tabs/TabsList/TabsTrigger/TabsContent` butunlay olib tashlanadi.
- "ISHTIROKCHILAR" bloki (statusMap'li `<ul>`) o'chiriladi.
- Yangi tuzilma:
  ```
  <aside class="flex flex-col h-full">
    <div class="p-3 border-b shrink-0 max-h-[45%] overflow-y-auto">
      <CameraGrid ... />
    </div>
    <div class="flex-1 min-h-0">
      <ChatPanel ... />
    </div>
  </aside>
  ```
- Import'dan `Tabs*` olib tashlanadi.

---

## 3) WebRTC Mesh — N-peer barqarorligi

`src/hooks/usePeerMesh.ts`:
- **Presence-based discovery** (random race'larni yo'q qilish):
  - `ch.track({ userId })` orqali Supabase Presence ishlatiladi.
  - `presence sync` — barcha hozirgi userlar ro'yxati olinadi. Har bir mavjud peer uchun `userId < remoteId` bo'lsa offer yuboriladi (deterministik tashabbus).
  - `presence join`/`leave` — yangilarga avtomatik ulanish, ketganlarga `closePC`.
- `pcsRef` allaqachon `Record<string, RTCPeerConnection>` (Map'ga teng) — saqlanadi.
- **Polite/impolite peer pattern** (glare oldini olish):
  - `polite = userId > remoteId`. Offer collision bo'lsa polite tomon `setRemoteDescription` qiladi, impolite e'tibor bermaydi.
- **ICE candidate buffering**: `setRemoteDescription` chaqirilmagan bo'lsa kelgan candidate'larni queue'ga yig'ish, keyin `addIceCandidate` qilish.
- **Console log** har bir hodisada: `console.log("[WebRTC]", "join", remoteId)`, `"offer-sent"`, `"answer-received"`, `"ice"`, `"connected"`, `"closed"`.
- **Mirror**: `CameraGrid.tsx` allaqachon faqat `isSelf` uchun `rotateY(180deg)` qo'llaydi — saqlanadi (vazifa shartiga mos).
- **Kamera o'chirilgan holat**: `CameraGrid.tsx` `VideoTile` — `hasVideo` false bo'lsa avatar (initial harfi) + `"Kamera o'chirilgan"` matni ko'rsatiladi (kartochka **yashirilmaydi**).

---

## 4) Maxsus Guest Player Overlay + Native Controls bloklash

`src/routes/room.$roomId.tsx`:
- `<video controls={false}>` (har doim, host uchun ham native pleer o'chiriladi — host o'zining custom tugmalarini ishlatadi).
- `controlsList="nodownload nofullscreen noremoteplayback"` + `disablePictureInPicture` + `onContextMenu={e => e.preventDefault()}`.
- **Mehmon uchun overlay** (pastki chap/ong):
  - "To'liq ekran" tugmasi (allaqachon bor) — saqlanadi.
  - **Ovoz balandligi slider'i** (`@/components/ui/slider`) — `videoRef.current.volume`'ni boshqaradi (faqat lokal).
  - Native play/seek **yo'q**.
- **Host uchun overlay**:
  - Play/Pause (mavjud), Seek bar — yangi: video ustida pastki overlay sifatida `<input type="range">` (yoki Slider) `currentTime`'ni boshqaradi (`onSeeked` allaqachon broadcast qiladi).
  - Host'ning ovoz slider'i ham qo'shiladi.

---

## 5) Toast'lar + Console Log'lar

- **Console**: `usePeerMesh` (yuqorida), `useSyncedPlayer` — `console.log("[Sync]", "play"|"pause"|"seek"|"applyRemote", ...)`, room route — `console.log("[Room]", ...)`.
- **Toast**: `room.$roomId.tsx`:
  - Yangi ishtirokchi qo'shilganda (presence `join` event listener orqali, profile name bilan): `toast(`${name} xonaga qo'shildi`)`.
  - Chiqib ketganda: `toast(`${name} chiqib ketdi`)`.
  - Host play/pause: `useSyncedPlayer` qabul qilingan `player` event'ida — `toast(`${hostName} videoni ${isPlaying ? "ishga tushirdi" : "pauza qildi"}`)`.
  - Kamera/mic on/off: peer-mesh broadcast'iga yangi `media-state` event qo'shiladi (`{userId, mic, cam}`); qabul qilganda toast.
- Yangi `uz.ts` qatorlari: `joinedRoom`, `leftRoom`, `playedVideo`, `pausedVideo`, `cameraOff`, `cameraOn`, `cameraOffLabel` ("Kamera o'chirilgan"), `inviteFriend`, `friends`, `addFriend`, `friendRequestSent`, `friendRequestReceived`, `accept`, `decline`, `searchUser`, `noFriends`, `inviteSent`, `inviteReceived(name, room)`, `invitedToRoom`, `volume`.

---

## 6) Do'stlar va To'g'ridan-to'g'ri taklif (Broadcast-only, DB jadval YO'Q)

Ma'lumot saqlash: **`localStorage`** (`friends:{userId}` => `string[]` of friend userIds) + **mavjud `profiles` jadvali** (qidirish uchun).

### Yangi fayllar

**`src/hooks/useFriendsBroadcast.ts`** — global "presence + signaling" hook (faqat `/dashboard` va `__root`'da emas, `/dashboard` va `/room/*` sahifalarida ishlatiladi):
- `supabase.channel("global:friends", { config: { presence: { key: userId } }})`
- Presence track — `{ userId, displayName }`. Bu orqali "kim onlayn".
- Broadcast event'lari:
  - `friend-request` `{ from, fromName, to }`
  - `friend-accept` `{ from, fromName, to }`
  - `friend-decline` `{ from, to }`
  - `room-invite` `{ from, fromName, to, roomId, roomName }`
  - `invite-accept` / `invite-decline` (ixtiyoriy javob).
- Hook qaytaradi: `onlineUsers`, `friends`, `incomingRequests`, `incomingInvites`, `sendFriendRequest(toId)`, `acceptFriend(fromId)`, `declineFriend(fromId)`, `sendInvite(toId, roomId, roomName)`, `acceptInvite(roomId)`, `declineInvite(...)`.
- `friends` ro'yxati `localStorage`'da saqlanadi.

**`src/components/FriendsModal.tsx`** — `/dashboard`'da "Do'stlar" tugmasi ochadi:
- Tab/section: **Mening do'stlarim** (online indikator), **Yangi qo'shish** (email/ism bo'yicha `profiles` jadvalidan `ilike` search → "Do'stlik so'rovi yuborish"), **Kelgan so'rovlar** (Qabul/Rad).

**`src/components/InviteFriendsDialog.tsx`** — `room.$roomId.tsx`'da "Copy Link" yonida "Taklif qilish" tugmasi:
- Faqat **online** do'stlar ro'yxati. Har biriga "Taklif" tugmasi → `sendInvite(friendId, roomId, room.name)`.

**`src/components/IncomingInviteToast.tsx`** (yoki `__root.tsx` ichida render):
- Global persistent popup (sonner `toast.custom` yoki absolute positioned card): `"${fromName} sizni '${roomName}' xonasiga chaqiryapti!"` + "Qabul qilish" / "Rad etish".
- Qabul: `navigate({ to: "/room/$roomId", params: { roomId } })`.

### Integratsiya

- `__root.tsx` `RootShell` ichida `<GlobalFriendsProvider />` (auth bor bo'lsa) — kanalni hayotda saqlaydi, kelayotgan invite'larni eshitadi va popup ko'rsatadi.
- `dashboard.tsx`: header'ga "Do'stlar" tugmasi qo'shiladi → `FriendsModal`.
- `room.$roomId.tsx`: top bar'da "Taklif qilish" tugmasi → `InviteFriendsDialog`.

### Cheklovlar (ochiq tushuntiriladi)

- DB siyosatlari emas, balki `localStorage` ishlatilganligi sababli do'stlar ro'yxati har bir qurilma uchun lokal. Bu vazifa shartiga mos (DB'ga teginmaslik).
- "Online do'st" — global presence kanalida hozir ulangan foydalanuvchilar.
- Taklif faqat qabul qiluvchi onlayn (kanalga ulangan) bo'lsa yetkaziladi.

---

## Yetkazib beriladigan fayllar

**Yangi:**
- `src/hooks/useFriendsBroadcast.ts`
- `src/components/FriendsModal.tsx`
- `src/components/InviteFriendsDialog.tsx`
- `src/components/GlobalFriendsProvider.tsx` (root'ga ulanadi, popup'larni boshqaradi)

**Tahrirlanadi:**
- `src/hooks/useAuth.ts` — `recoveryMode` qo'shish
- `src/routes/auth.tsx` — recovery mode'ni qabul qilish, yangi `"reset-new"` form
- `src/hooks/usePeerMesh.ts` — presence-based mesh, polite/impolite, ICE buffer, media-state broadcast, log'lar
- `src/hooks/useSyncedPlayer.ts` — log'lar + remote play/pause toast hook'lari uchun callback
- `src/components/CameraGrid.tsx` — kamera o'chirilgan holat ("Kamera o'chirilgan" matni)
- `src/routes/room.$roomId.tsx` — sidebar redizayn, custom player overlay (slider, fullscreen), toast'lar, "Taklif qilish" tugmasi
- `src/routes/dashboard.tsx` — "Do'stlar" tugmasi
- `src/routes/__root.tsx` — `GlobalFriendsProvider` ulanishi
- `src/lib/uz.ts` — yangi matnlar

## QA tekshiruvi

- 3 ta brauzer oynasi bilan WebRTC stabil (`pcs` Map: 2 ta peer har bir tomonda).
- Email parol tiklash → faqat yangi parol formasi ko'rinadi, dashboard'ga avtomatik o'tilmaydi.
- Sidebar: kameralar tepada, chat pastda, tab yo'q, "Ishtirokchilar" yo'q.
- Mehmon: native pleer ko'rinmaydi, faqat fullscreen + volume; host: play/pause + seek + volume.
- Do'stga taklif yuborilsa, qabul qiluvchining ekranida persistent popup chiqadi va "Qabul qilish" bosilsa xonaga o'tadi.
- Har bir kalit hodisada `console` log va toast.
