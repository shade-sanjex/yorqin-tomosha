-- Rooms: lobby + permissions + youtube
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_active  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS controllers uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS video_kind text NOT NULL DEFAULT 'file';

-- Restrict video_kind values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_video_kind_check'
  ) THEN
    ALTER TABLE public.rooms
      ADD CONSTRAINT rooms_video_kind_check CHECK (video_kind IN ('file','youtube'));
  END IF;
END$$;

-- Avatars storage bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars','avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Avatars policies
DROP POLICY IF EXISTS "avatars_public_read"   ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_insert"  ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_update"  ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_delete"  ON storage.objects;

CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );