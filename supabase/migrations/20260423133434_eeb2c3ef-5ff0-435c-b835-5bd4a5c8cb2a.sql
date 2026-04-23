
CREATE TYPE public.participant_status AS ENUM ('kirdi', 'yuklanmoqda', 'tayyor');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Yangi xona',
  video_url TEXT,
  video_storage_path TEXT,
  playback_time DOUBLE PRECISION NOT NULL DEFAULT 0,
  is_playing BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms_select_auth" ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "rooms_insert_host" ON public.rooms FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY "rooms_update_host" ON public.rooms FOR UPDATE TO authenticated USING (auth.uid() = host_id);
CREATE POLICY "rooms_delete_host" ON public.rooms FOR DELETE TO authenticated USING (auth.uid() = host_id);

CREATE TABLE public.room_participants (
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.participant_status NOT NULL DEFAULT 'kirdi',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rp_select_auth" ON public.room_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "rp_insert_self" ON public.room_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rp_update_self" ON public.room_participants FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "rp_delete_self_or_host" ON public.room_participants FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.rooms WHERE id = room_id AND host_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.is_room_participant(_room_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.room_participants WHERE room_id = _room_id AND user_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.rooms WHERE id = _room_id AND host_id = _user_id);
$$;

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_select_participants" ON public.chat_messages FOR SELECT TO authenticated
  USING (public.is_room_participant(room_id, auth.uid()));
CREATE POLICY "chat_insert_participants" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_room_participant(room_id, auth.uid()));

ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.room_participants REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

INSERT INTO storage.buckets (id, name, public) VALUES ('watch_party_media', 'watch_party_media', true);

CREATE POLICY "wpm_select_public" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'watch_party_media');
CREATE POLICY "wpm_insert_auth" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'watch_party_media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "wpm_delete_owner" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'watch_party_media' AND auth.uid()::text = (storage.foldername(name))[1]);
