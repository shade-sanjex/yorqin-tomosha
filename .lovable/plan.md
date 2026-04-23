
# Watch Party — Sinxron kino tomosha ilovasi

Do'stlar bilan birga video ko'rish uchun real-time sinxron pleer, kamera/ovoz aloqasi, chat va reaktsiyalar. Butun interfeys o'zbek tilida (lotin yozuvi).

## Texnologiyalar
- **Frontend**: React + TanStack Router + Tailwind, deep dark tema (`#0A0A0F` fon, `#8B5CF6` aksent)
- **Backend**: Lovable Cloud (Supabase) — Auth, Realtime, Storage, RLS
- **Auth**: Email + parol va Google
- **WebRTC signaling**: Supabase Broadcast kanallari (mesh P2P, 2–6 kishi)

## Ma'lumotlar bazasi sxemasi
- `profiles` — `id`, `display_name`, `avatar_url` (auth.users bilan trigger orqali bog'lanadi)
- `rooms` — `id`, `host_id`, `video_url`, `video_storage_path`, `current_time`, `is_playing`, `created_at`
- `room_participants` — `room_id`, `user_id`, `status` ('kirdi' | 'yuklanmoqda' | 'tayyor'), `joined_at`
- `chat_messages` — `id`, `room_id`, `user_id`, `content`, `created_at`
- **Storage bucket**: `watch_party_media` (autentifikatsiyalangan foydalanuvchilar uchun)
- **RLS**: faqat `host_id` xona holatini o'zgartira oladi; ishtirokchilar faqat o'zlari kirgan xonalarni ko'radi va o'z statusini yangilaydi

## Sahifalar (TanStack route fayllari)
1. `/` — Landing: brend, "Xona yaratish" va "Kirish" tugmalari
2. `/auth` — Email/parol + Google sign-in (o'zbekcha)
3. `/_authenticated/dashboard` — Mening xonalarim, "Yangi xona yaratish"
4. `/_authenticated/room/$roomId` — Asosiy Watch Party interfeysi

## Watch Party xona interfeysi
**Yuqori panel**: Xona nomi, ishtirokchilar soni, "Havolani nusxalash", "Kino rejimi" toggle, "Chiqish"

**Markaz — Video pleer**:
- Custom `<video>` element, host'gagina control'lar ko'rinadi (mehmonlarga vizual o'chirilgan, tooltip: "Faqat xona yaratuvchisi boshqaradi")
- "Video yuklash" (mp4/webm, progress bar %li) yoki "Tashqi URL qo'shish" modal
- **Sync engine**: host `current_time`/`is_playing` ni Realtime broadcast qiladi; mehmonlar majburan sinxronlanadi (>0.5s drift bo'lsa seek)
- **Buffering Failsafe**: har qanday ishtirokchi `onWaiting` da o'z statusini `yuklanmoqda` ga o'zgartiradi → barchaning videosi avto-pauza + overlay: *"Kuting, [Ism] tarmog'i qotib qoldi..."*. Hammada `tayyor` bo'lsa davom etadi
- Reaktsiya tugmalari (😂 🔥 😲 ❤️ 👏) — bosilganda emoji video ustida 3 sekund yuqoriga "suzib" ketadi (CSS keyframes)

**O'ng sidebar** (kino rejimida slayd bilan yashiriladi):
- **Kameralar grid**: har bir ishtirokchi uchun video kvadrat, mikrofon/kamera toggle, gaplashayotganda yashil porlash (Web Audio API analyser)
- **Chat tab**: real-time xabarlar, Enter bilan yuborish
- WebRTC permission xatoligi: "Kamera va mikrofonga ruxsat bering" tushunarli xabar + qayta urinish tugmasi

**Host uchun "Nuke" tugmasi** (qizil, pastki o'ng burchakda):
- "Serverdan tozalash" → confirm modal: *"Diqqat! Bu video serverdan butunlay o'chiriladi. Rozimisiz?"*
- Tasdiqlangach: `storage.remove()` + `video_url`/`video_storage_path` = null

## WebRTC arxitekturasi
- Mesh P2P: har bir juftlik orasida `RTCPeerConnection`
- Signaling: `room:{id}:webrtc` Supabase Broadcast kanali — `offer`, `answer`, `ice-candidate` xabarlari user_id bilan yo'naltiriladi
- Yangi qo'shilgan kishi mavjudlarga offer yuboradi
- Active speaker: `AudioContext` + `AnalyserNode`, RMS > threshold bo'lsa border yashil

## Edge case'lar (to'liq qoplanadi)
- Host xonadan chiqsa: xona "to'xtatilgan" holatga o'tadi, mehmonlarga xabar
- Internet uzilsa: avtomatik qayta ulanish + "Qayta ulanmoqda..." indikator
- Storage bo'sh bo'lsa pleer "Video yuklang" placeholder ko'rsatadi
- Kamera ruxsati rad etilsa — qayta urinish va "faqat tomosha" rejimi mavjud
- Tashqi URL noto'g'ri formatda bo'lsa — validation xatoligi o'zbekcha

## Yetkazib beriladigan natija
To'liq ishlaydigan tipli (TypeScript strict) tizim: SQL migratsiya, RLS siyosatlari, storage bucket, Auth, sinxron pleer hook'i (`useSyncedPlayer`), WebRTC hook'i (`usePeerMesh`), reaktsiya animatsiyalari, chat, Nuke flow, kino rejimi — barchasi o'zbek tilida, placeholder yo'q.
