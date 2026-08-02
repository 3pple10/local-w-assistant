CREATE TABLE public.design_doc_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version integer NOT NULL,
  label text,
  markdown text NOT NULL,
  parsed jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (version)
);

CREATE INDEX idx_design_doc_versions_version ON public.design_doc_versions (version DESC);

ALTER TABLE public.design_doc_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all design doc versions"
ON public.design_doc_versions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create design doc versions"
ON public.design_doc_versions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);
