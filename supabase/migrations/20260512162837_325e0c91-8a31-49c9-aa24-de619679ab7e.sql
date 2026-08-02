
ALTER TABLE public.kit_fonts
  ADD COLUMN IF NOT EXISTS source_family text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_url text,
  ADD COLUMN IF NOT EXISTS license text,
  ADD COLUMN IF NOT EXISTS license_note text,
  ADD COLUMN IF NOT EXISTS file_urls jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_substitute boolean NOT NULL DEFAULT false;
