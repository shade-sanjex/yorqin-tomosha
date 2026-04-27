-- Tighten SELECT policy: a public bucket still serves files by direct URL via the storage CDN
-- without needing a SELECT policy on storage.objects. Removing the broad SELECT policy
-- prevents anonymous bulk listing while keeping <img src="..."> rendering working.
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;

-- Allow only the file owner to list their own avatars (e.g. for management UIs).
CREATE POLICY "avatars_owner_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );