-- IntelliVault Storage Bucket policies
-- Run this in the Supabase SQL editor after the bucket exists.

-- Storage bucket: user-files
-- Keep the bucket private. Signed URLs are used for controlled sharing.

DROP POLICY IF EXISTS "Authenticated users can upload to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can list files in their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can download files from their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete files in their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update files in their own folder" ON storage.objects;

CREATE POLICY "Authenticated users can upload to their own folder"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'user-files'
  AND auth.role() = 'authenticated'
  AND COALESCE((storage.foldername(name))[1], '') = auth.uid()::text
);

CREATE POLICY "Authenticated users can list files in their own folder"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'user-files'
  AND auth.role() = 'authenticated'
  AND COALESCE((storage.foldername(name))[1], '') = auth.uid()::text
);

CREATE POLICY "Authenticated users can download files from their own folder"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'user-files'
  AND auth.role() = 'authenticated'
  AND COALESCE((storage.foldername(name))[1], '') = auth.uid()::text
);

CREATE POLICY "Authenticated users can delete files in their own folder"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'user-files'
  AND auth.role() = 'authenticated'
  AND COALESCE((storage.foldername(name))[1], '') = auth.uid()::text
);

CREATE POLICY "Authenticated users can update files in their own folder"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'user-files'
  AND auth.role() = 'authenticated'
  AND COALESCE((storage.foldername(name))[1], '') = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'user-files'
  AND auth.role() = 'authenticated'
  AND COALESCE((storage.foldername(name))[1], '') = auth.uid()::text
);

-- AI metadata is stored in the public files table but is still user-scoped through
-- the row policies below. Users can only update their own AI content for their own files.
DROP POLICY IF EXISTS "Users can update only their own AI metadata" ON public.files;

CREATE POLICY "Users can update only their own AI metadata"
ON public.files
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
