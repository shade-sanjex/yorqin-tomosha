## Maqsad
Consumet API o'rnini TMDB qidiruvi + VidSrc iframe ijro etish bilan almashtirish. Iframe ishlatilganda play/pause sinxronizatsiyasini butunlay o'chirib qo'yish — foydalanuvchilar mustaqil tomosha qiladi, lekin LiveKit chat/audio/video davom etadi.

## 1-qadam — TMDB API kalitini qo'shish
TMDB kaliti hozircha sozlanmagan. Men sizdan **`TMDB_API_KEY`** secret'ini qo'shishni so'rayman (Lovable Cloud secret sifatida). Kalitni https://www.themoviedb.org/settings/api dan oling (v3 auth, "API Key" qatori).

Kalit edge function orqali ishlatiladi — frontendga oqib chiqmaydi.

## 2-qadam — Yangi edge function: `tmdb-search`
`supabase/functions/tmdb-search/index.ts` yaratiladi:
- `GET ?q=...` → `https://api.themoviedb.org/3/search/multi?api_key=...&query=...&include_adult=false`
- Faqat `movie` va `tv` natijalarini qaytaradi (poster, sarlavha, yil, tmdb_id, media_type).
- `verify_jwt = false` (umumiy qidiruv).
- Kalit yo'q bo'lsa 503 + tushunarli xato.

## 3-qadam — `MediaSearchDialog.tsx` ni qayta yozish
- Consumet kodini olib tashlash.
- Yagona qidiruv maydoni (Anime/Movies tablari shart emas — TMDB multi-search).
- Natijalar grid: poster (`https://image.tmdb.org/t/p/w300{poster_path}`), sarlavha, yil, "Film" yoki "Serial" rozetkasi.
- Tanlanganda iframe URL quriladi:
  - movie: `https://vidsrc.to/embed/movie/{tmdb_id}`
  - tv: `https://vidsrc.to/embed/tv/{tmdb_id}/1/1`
- `onPick(url, title, "iframe")` chaqiriladi.

## 4-qadam — `PlayerState` ga `iframe` qo'shish
`src/hooks/useSyncedPlayer.ts`:
```ts
videoKind: "file" | "youtube" | "iframe"
```
DB ham allaqachon `text` (`video_kind`) — migratsiya shart emas. `RoomRow` tipi `room.$roomId.tsx` da yangilanadi.

Iframe holatida `useSyncedPlayer` da:
- davriy host vaqt broadcast'i — `videoKind === "iframe"` bo'lsa o'tkazib yuboriladi.
- remote "player" event qabul qilinganda ham seek/play/pause iframe uchun o'tkazib yuboriladi.
- Lekin `videoUrl` o'zgarishi (yangi kontent tanlash) baribir broadcast qilinadi va hammada yangilanadi.

## 5-qadam — `SyncedPlayer.tsx` da iframe rendering
`videoKind === "iframe"` bo'lsa:
- `<ReactPlayer>` o'rniga `<iframe src={videoUrl} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="absolute inset-0 w-full h-full border-0" />`.
- Custom play/pause/seek/volume overlay'i butunlay yashiriladi.
- Buffering overlay'i ham ko'rsatilmaydi (sinxronizatsiya yo'q).
- Kichik yuqori burchakda info badge: "Mustaqil tomosha — chat sinxron".

## 6-qadam — Xona toolbar'iga "Iframe ssilka" maydoni
`src/routes/room.$roomId.tsx` da YouTube URL inputi yonida:
- Yangi input: `placeholder="Iframe (Embed) ssilka kiriting"` + "Qo'shish" tugmasi.
- Submit qilinganda: `broadcastState({ videoUrl: pasted, videoKind: "iframe", isPlaying: false, playbackTime: 0 })`.
- Mavjud YouTube/file flow'lariga tegmasdan qoldiriladi.
- `MediaSearchDialog` ham bir xil `broadcastState` chaqiruvini ishlatadi.

## 7-qadam — O'zbek matnlarini qo'shish (`src/lib/uz.ts`)
- `searchTmdbHint`, `tmdbUnavailable`, `iframeUrl`, `iframeUrlPlaceholder`, `iframeAdded`, `independentWatch`, `mediaTypeMovie`, `mediaTypeTv`, `releaseYear`.

## Texnik xulosa
- DB sxemasi o'zgarmaydi (`video_kind` allaqachon `text`).
- Hech qanday LiveKit konfiguratsiyasi o'zgartirilmaydi.
- YouTube va fayl ijrosi avvalgidek sinxron qoladi.
- Iframe rejimida custom kontroller ham, vaqt broadcast'i ham yo'q — faqat ulashilgan URL.

## Sizdan kerak
**`TMDB_API_KEY`** secret'ini qo'shing. Reja tasdiqlangach, men buni so'rayman va keyin barcha kodni yozaman.