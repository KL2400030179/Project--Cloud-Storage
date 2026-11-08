CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_type TEXT,
    file_size BIGINT NOT NULL DEFAULT 0,
    file_hash TEXT,
    category TEXT NOT NULL DEFAULT 'Other',
    mime_type TEXT,
    ai_summary TEXT,
    ai_document_type TEXT,
    ai_suggested_category TEXT,
    ai_keywords TEXT[],
    extracted_text TEXT,
    ai_analyzed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    action TEXT NOT NULL,
    file_id UUID,
    file_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.files
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS file_name TEXT,
    ADD COLUMN IF NOT EXISTS storage_path TEXT,
    ADD COLUMN IF NOT EXISTS file_type TEXT,
    ADD COLUMN IF NOT EXISTS file_size BIGINT,
    ADD COLUMN IF NOT EXISTS file_hash TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS mime_type TEXT,
    ADD COLUMN IF NOT EXISTS ai_summary TEXT,
    ADD COLUMN IF NOT EXISTS ai_document_type TEXT,
    ADD COLUMN IF NOT EXISTS ai_suggested_category TEXT,
    ADD COLUMN IF NOT EXISTS ai_keywords TEXT[],
    ADD COLUMN IF NOT EXISTS extracted_text TEXT,
    ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE public.activity_logs
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS action TEXT,
    ADD COLUMN IF NOT EXISTS file_id UUID,
    ADD COLUMN IF NOT EXISTS file_name TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

UPDATE public.files SET file_size = 0 WHERE file_size IS NULL;
UPDATE public.files SET category = 'Other' WHERE category IS NULL;
UPDATE public.files SET created_at = NOW() WHERE created_at IS NULL;
UPDATE public.files SET updated_at = NOW() WHERE updated_at IS NULL;
UPDATE public.activity_logs SET created_at = NOW() WHERE created_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_files_user_id ON public.files (user_id);
CREATE INDEX IF NOT EXISTS idx_files_file_hash ON public.files (file_hash);
CREATE INDEX IF NOT EXISTS idx_files_user_hash ON public.files (user_id, file_hash);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON public.files (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user_id ON public.activity_logs (user_id, created_at DESC);

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view only their own file metadata" ON public.files;
DROP POLICY IF EXISTS "Users can insert only their own file metadata" ON public.files;
DROP POLICY IF EXISTS "Users can update only their own file metadata" ON public.files;
DROP POLICY IF EXISTS "Users can delete only their own file metadata" ON public.files;
DROP POLICY IF EXISTS "Users can view only their own activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can insert only their own activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can update only their own activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can delete only their own activity logs" ON public.activity_logs;

CREATE POLICY "Users can view only their own file metadata"
ON public.files FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert only their own file metadata"
ON public.files FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update only their own file metadata"
ON public.files FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete only their own file metadata"
ON public.files FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Users can view only their own activity logs"
ON public.activity_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert only their own activity logs"
ON public.activity_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update only their own activity logs"
ON public.activity_logs FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete only their own activity logs"
ON public.activity_logs FOR DELETE
USING (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('user-files', 'user-files', FALSE, 52428800)
ON CONFLICT (id) DO UPDATE
SET public = FALSE, file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "Authenticated users can upload to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can list files in their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can download files from their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete files in their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update files in their own folder" ON storage.objects;

CREATE POLICY "Authenticated users can upload to their own folder"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'user-files'
    AND auth.role() = 'authenticated'
    AND COALESCE((storage.foldername(name))[1], '') = auth.uid()::text
);

CREATE POLICY "Authenticated users can list files in their own folder"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'user-files'
    AND auth.role() = 'authenticated'
    AND COALESCE((storage.foldername(name))[1], '') = auth.uid()::text
);

CREATE POLICY "Authenticated users can delete files from their own folder"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'user-files'
    AND auth.role() = 'authenticated'
    AND COALESCE((storage.foldername(name))[1], '') = auth.uid()::text
);

CREATE POLICY "Authenticated users can update files in their own folder"
ON storage.objects FOR UPDATE
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
