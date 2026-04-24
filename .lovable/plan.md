
# Watch Party — 5 ta tuzatish va yaxshilash

## Bajariladigan vazifalar

### 1. Mahalliy kamerani oynaviy aks ettirish
`CameraGrid.tsx` ichidagi `VideoTile` da `isSelf={true}` bo'lsa `<video>` elementiga `-scale-x-100` qo'shiladi. Boshqa peer'larning videosi aks ettirilmaydi.

### 2. WebRTC audio/video va mahalliy mute
- `usePeerMesh.ts`: `getUserMedia` allaqachon `audio:true, video:true` chaqiradi — saqlanadi. Tekshiramiz: `pc.addTrack` har ikki track uchun ham qo'llaniladi (allaqachon to'g'ri).
- `CameraGrid.tsx` `VideoTile`: `<video>` da `muted={isSelf}` (o'z ovozini eshitmaslik), remote uchun `muted={false}` va `autoPlay`.
- **Mahalliy "Ovozni o'chirish" tugmasi**: Har bir remote tile'ga `Volume2/VolumeX` icon-tugma qo'shiladi. Bosilganda `videoElement.volume = 0` (yoki `muted=true`) qilinadi. Faqat shu foydalanuvchining brauzerida ta'sir qiladi, broadcast'ga ta'siri yo'q. Holat tile ichidagi `useState` da saqlanadi.

### 3. Google OAuth tuzatish
`auth.tsx` da `signInWithOAuth` chaqiruvi `redirectTo: ${window.location.origin}/dashboard` bilan saqlanadi. Tuzatishlar:
- `redirected` holatini xato deb hisoblamaslik (loading'ni redirect bo'lganda saqlash).
- `data.url` mavjud bo'lsa qo'lda `window.location.assign(data.url)` (ba'zi browser'lar avtomatik redirect qilmaydi).
- Xatolikda `toast.error("Kirishda xatolik yuz berdi")` ko'rsatiladi.
- `uz.ts` ga `googleSignInError: "Kirishda xatolik yuz berdi"` qo'shiladi.

### 4. Aniq rolga asoslangan pleer boshqaruvi
`room.$roomId.tsx`:
- Hozirgi `<video controls={isHost}>` mehmonlarda native control'larni yashiradi — bu yaxshi, lekin Fullscreen ham yo'qoladi.
- **Yechim**: Mehmon uchun `controls={false}` qoldiriladi va o'z ustki overlay'imiz qo'shiladi: faqat "To'liq ekran" tugmasi (`Maximize` icon) videoning yuqori-o'ng burchagida. Bosilganda `videoRef.current.requestFullscreen()` chaqiriladi.
- Mehmonlarda `video` elementga `onClick`/`onSeeked` ta'sir qilmaydi, chunki controls yo'q. Qo'shimcha xavfsizlik: `seeked`/`play`/`pause` event handler'lari ichida `if (!isHost) return` allaqachon mavjud — saqlanadi.
- "Faqat xona yaratuvchisi boshqaradi" rozetkasi qoldiriladi.

### 5. Host moderatsiya: Global Mute & Kick
**UI**: Har bir remote `VideoTile` uchun (faqat joriy foydalanuvchi host bo'lsa) 3-nuqta `DropdownMenu` qo'shiladi. Ichida:
- "Hammaga ovozini o'chirish" (`Hammaga ovozini o'chirish`)
- "Xonadan chetlatish" (`Xonadan chetlatish`)

**Signaling**: Yangi Supabase Broadcast kanal `room:{roomId}:moderation` (mavjud `webrtc` kanaliga qo'shimcha emas, alohida — toza ajratish uchun).

**Global Mute oqimi**:
1. Host `moderation` kanaliga `{event:"force-mute", payload:{targetUserId}}` yuboradi.
2. Mijoz qabul qiladi: agar `targetUserId === userId` bo'lsa, `usePeerMesh` ichidagi yangi `forceMuteMic()` chaqiriladi — `localStream.getAudioTracks().forEach(t => t.enabled = false)` va `setMicEnabled(false)`. Toast: "Yaratuvchi mikrofoningizni o'chirdi".

**Kick oqimi**:
1. Host `room_participants` jadvalidan o'sha `user_id` ni `delete` qiladi (RLS allaqachon hostga ruxsat beradi).
2. Host `moderation` kanaliga `{event:"kick", payload:{targetUserId}}` yuboradi.
3. Mijoz qabul qiladi: agar o'ziga tegishli bo'lsa — `toast.error("Siz xonadan chetlatildilar")` va `navigate({to:"/dashboard"})`.

**Qo'shilishni oldini olish**: Mavjud `useEffect` da xonaga kirgan zahoti `room_participants` ga `upsert` qiladi. Buni oldini olish uchun yangi `kicked_users` table emas — soddaroq: `localStorage.setItem(\`kicked:${roomId}\`, "1")` chetlatish paytida; `loadRoom` boshida tekshiriladi va darhol redirect qilinadi (mahalliy himoya, server-side emas, lekin vazifaning skopi uchun yetarli).

## Fayllarga o'zgartirishlar
- `src/components/CameraGrid.tsx` — mirror, mute tugmasi, host dropdown menyusi, callback prop'lar (`onForceMute`, `onKick`).
- `src/hooks/usePeerMesh.ts` — `forceMuteMic()` eksport qiladi.
- `src/routes/room.$roomId.tsx` — moderation kanali, kick qabuli, fullscreen overlay tugmasi, kick'dan keyingi qaytishni oldini olish.
- `src/routes/auth.tsx` — Google OAuth oqimini tuzatish, `redirected` ni e'tiborga olish.
- `src/lib/uz.ts` — yangi matnlar: `forceMute`, `kick`, `kickedMessage`, `mutedByHost`, `localMute`, `localUnmute`, `fullscreen`, `googleSignInError`.

## Test stsenariyalari
- Host video o'ynaydi → mehmonda controls yo'q, lekin Fullscreen tugmasi ishlaydi.
- Mehmon o'z videosini ko'zgu kabi ko'radi; boshqalarni normal ko'radi.
- Mehmon remote tile'da "🔇" bossa — faqat o'z ovozida o'chadi, boshqalarda emas.
- Host "Hammaga ovozini o'chirish" bossa — nishon mikrofoni o'chadi (boshqa qatnashchilar ham buni ko'radi, chunki audio track'da signal yo'qoladi).
- Host "Chetlatish" bossa — mehmon /dashboard'ga toast bilan otiladi va qaytib kira olmaydi.
- Google tugmasi bosilganda Google OAuth sahifasiga o'tadi; muvaffaqiyatda `/dashboard` ga qaytadi.
