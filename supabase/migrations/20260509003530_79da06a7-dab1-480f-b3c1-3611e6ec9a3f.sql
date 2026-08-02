ALTER TABLE public.brand_kits
  ADD COLUMN IF NOT EXISTS typography_scale jsonb,
  ADD COLUMN IF NOT EXISTS imagery_style jsonb,
  ADD COLUMN IF NOT EXISTS motion_style jsonb,
  ADD COLUMN IF NOT EXISTS brand_positioning jsonb;