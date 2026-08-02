ALTER TABLE public.brand_kits
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_status integer,
  ADD COLUMN IF NOT EXISTS error_message text;