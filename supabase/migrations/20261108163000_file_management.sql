ALTER TABLE public.files
    ADD COLUMN IF NOT EXISTS folder_id UUID,
    ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    parent_folder_id UUID,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, user_id)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'folders_parent_owner_fkey'
          AND conrelid = 'public.folders'::regclass
    ) THEN
        ALTER TABLE public.folders
            ADD CONSTRAINT folders_parent_owner_fkey
            FOREIGN KEY (parent_folder_id, user_id)
            REFERENCES public.folders (id, user_id)
            ON DELETE SET NULL (parent_folder_id);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'files_folder_owner_fkey'
          AND conrelid = 'public.files'::regclass
    ) THEN
        ALTER TABLE public.files
            ADD CONSTRAINT files_folder_owner_fkey
            FOREIGN KEY (folder_id, user_id)
            REFERENCES public.folders (id, user_id)
            ON DELETE SET NULL (folder_id);
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.file_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES public.files (id) ON DELETE CASCADE,
    tag TEXT NOT NULL CHECK (length(trim(tag)) BETWEEN 1 AND 40),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.file_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES public.files (id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    storage_path TEXT NOT NULL,
    file_hash TEXT,
    file_size BIGINT NOT NULL DEFAULT 0 CHECK (file_size >= 0),
    mime_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (file_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES public.files (id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_user_folder
    ON public.files (user_id, folder_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_files_user_favorites
    ON public.files (user_id, created_at DESC)
    WHERE is_favorite = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_files_user_trash
    ON public.files (user_id, deleted_at DESC)
    WHERE deleted_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_file_tags_file_tag
    ON public.file_tags (file_id, lower(tag));

CREATE INDEX IF NOT EXISTS idx_file_tags_user_tag
    ON public.file_tags (user_id, lower(tag));

CREATE INDEX IF NOT EXISTS idx_file_versions_file
    ON public.file_versions (user_id, file_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_share_links_owner
    ON public.share_links (user_id, file_id, created_at DESC);

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.folders, public.file_tags, public.file_versions, public.share_links
TO authenticated;

DROP POLICY IF EXISTS "Users can manage their own folders" ON public.folders;
CREATE POLICY "Users can manage their own folders"
ON public.folders
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (
    auth.uid() = user_id
);

DROP POLICY IF EXISTS "Users can manage their own file tags" ON public.file_tags;
CREATE POLICY "Users can manage their own file tags"
ON public.file_tags
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
        SELECT 1
        FROM public.files file_record
        WHERE file_record.id = file_id
          AND file_record.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Users can manage their own file versions" ON public.file_versions;
CREATE POLICY "Users can manage their own file versions"
ON public.file_versions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
        SELECT 1
        FROM public.files file_record
        WHERE file_record.id = file_id
          AND file_record.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Users can manage their own share links" ON public.share_links;
CREATE POLICY "Users can manage their own share links"
ON public.share_links
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
        SELECT 1
        FROM public.files file_record
        WHERE file_record.id = file_id
          AND file_record.user_id = auth.uid()
          AND file_record.deleted_at IS NULL
    )
);
