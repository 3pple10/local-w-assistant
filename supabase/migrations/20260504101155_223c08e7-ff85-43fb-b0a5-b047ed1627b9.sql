
-- Roles enum + table
create type public.app_role as enum ('admin', 'user');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Profiles viewable by everyone" on public.profiles for select using (true);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = user_id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = user_id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy "Users can view own roles" on public.user_roles for select using (auth.uid() = user_id);

-- Brand kits
create table public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  anon_token text,
  name text not null default 'Untitled brand kit',
  source_type text not null default 'url',
  source_url text,
  status text not null default 'pending',
  share_token text unique,
  is_public boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index brand_kits_user_id_idx on public.brand_kits(user_id);
create index brand_kits_anon_token_idx on public.brand_kits(anon_token);
create index brand_kits_share_token_idx on public.brand_kits(share_token);

alter table public.brand_kits enable row level security;

create policy "Users view own kits" on public.brand_kits for select using (auth.uid() = user_id);
create policy "Users insert own kits" on public.brand_kits for insert with check (auth.uid() = user_id);
create policy "Users update own kits" on public.brand_kits for update using (auth.uid() = user_id);
create policy "Users delete own kits" on public.brand_kits for delete using (auth.uid() = user_id);
create policy "Public kits viewable via share" on public.brand_kits for select using (is_public = true);

-- Colors
create table public.kit_colors (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.brand_kits(id) on delete cascade,
  hex text not null,
  role text,
  name text,
  position integer not null default 0,
  locked boolean not null default false,
  created_at timestamptz not null default now()
);
create index kit_colors_kit_id_idx on public.kit_colors(kit_id);
alter table public.kit_colors enable row level security;
create policy "Colors via kit owner" on public.kit_colors for all
  using (exists (select 1 from public.brand_kits k where k.id = kit_id and (k.user_id = auth.uid() or k.is_public = true)))
  with check (exists (select 1 from public.brand_kits k where k.id = kit_id and k.user_id = auth.uid()));

-- Fonts
create table public.kit_fonts (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.brand_kits(id) on delete cascade,
  family text not null,
  role text,
  weights text[] default '{}',
  google_font boolean default false,
  scale jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index kit_fonts_kit_id_idx on public.kit_fonts(kit_id);
alter table public.kit_fonts enable row level security;
create policy "Fonts via kit owner" on public.kit_fonts for all
  using (exists (select 1 from public.brand_kits k where k.id = kit_id and (k.user_id = auth.uid() or k.is_public = true)))
  with check (exists (select 1 from public.brand_kits k where k.id = kit_id and k.user_id = auth.uid()));

-- Assets
create table public.kit_assets (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.brand_kits(id) on delete cascade,
  kind text not null,
  url text not null,
  storage_path text,
  width integer,
  height integer,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index kit_assets_kit_id_idx on public.kit_assets(kit_id);
alter table public.kit_assets enable row level security;
create policy "Assets via kit owner" on public.kit_assets for all
  using (exists (select 1 from public.brand_kits k where k.id = kit_id and (k.user_id = auth.uid() or k.is_public = true)))
  with check (exists (select 1 from public.brand_kits k where k.id = kit_id and k.user_id = auth.uid()));

-- Tokens (spacing/radius/shadow/animation)
create table public.kit_tokens (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.brand_kits(id) on delete cascade,
  category text not null,
  name text not null,
  value text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index kit_tokens_kit_id_idx on public.kit_tokens(kit_id);
alter table public.kit_tokens enable row level security;
create policy "Tokens via kit owner" on public.kit_tokens for all
  using (exists (select 1 from public.brand_kits k where k.id = kit_id and (k.user_id = auth.uid() or k.is_public = true)))
  with check (exists (select 1 from public.brand_kits k where k.id = kit_id and k.user_id = auth.uid()));

-- Voice
create table public.kit_voice (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null unique references public.brand_kits(id) on delete cascade,
  tone jsonb,
  vocabulary jsonb,
  dos jsonb,
  donts jsonb,
  samples jsonb,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.kit_voice enable row level security;
create policy "Voice via kit owner" on public.kit_voice for all
  using (exists (select 1 from public.brand_kits k where k.id = kit_id and (k.user_id = auth.uid() or k.is_public = true)))
  with check (exists (select 1 from public.brand_kits k where k.id = kit_id and k.user_id = auth.uid()));

-- updated_at trigger
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.update_updated_at_column();
create trigger brand_kits_updated_at before update on public.brand_kits for each row execute function public.update_updated_at_column();
create trigger kit_voice_updated_at before update on public.kit_voice for each row execute function public.update_updated_at_column();

-- New user trigger -> profile + default user role
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage bucket for brand assets (public read)
insert into storage.buckets (id, name, public) values ('brand-assets', 'brand-assets', true)
on conflict (id) do nothing;

create policy "Brand assets publicly readable"
  on storage.objects for select
  using (bucket_id = 'brand-assets');

create policy "Authenticated users can upload brand assets"
  on storage.objects for insert
  with check (bucket_id = 'brand-assets' and auth.role() = 'authenticated');

create policy "Users can update own brand assets"
  on storage.objects for update
  using (bucket_id = 'brand-assets' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete own brand assets"
  on storage.objects for delete
  using (bucket_id = 'brand-assets' and auth.uid()::text = (storage.foldername(name))[1]);
