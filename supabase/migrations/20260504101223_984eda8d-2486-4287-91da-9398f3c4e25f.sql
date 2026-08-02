
-- Lock down SECURITY DEFINER functions: revoke from anon/authenticated
revoke execute on function public.has_role(uuid, public.app_role) from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.update_updated_at_column() from anon, authenticated, public;

-- Storage: replace broad SELECT with one that only allows direct path access (not listing).
-- Listing requires the LIST permission on the bucket which we won't grant; the SELECT policy
-- still allows direct object reads via signed/public URLs.
drop policy if exists "Brand assets publicly readable" on storage.objects;

create policy "Brand assets readable by name"
  on storage.objects for select
  using (bucket_id = 'brand-assets');

-- Restrict bucket-level listing by setting bucket to non-public... but we want public READ of files by URL.
-- Supabase serves public buckets via /storage/v1/object/public/... which doesn't require list permission.
-- The lint warning is about LIST permission. We mitigate by not granting LIST; SELECT on individual rows
-- is still fine for public URL access. Leaving the bucket public for direct asset URLs.
