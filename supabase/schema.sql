-- Elibrary MVP schema. Run in Supabase SQL Editor on a fresh project.
-- Re-runnable for the starter schema; review existing policies before production use.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  status text not null default 'active' check (status in ('active','deactivated')),
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists status text not null default 'active';
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check check (status in ('active','deactivated'));

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  author text not null check (char_length(author) between 1 and 160),
  description text,
  category text,
  page_count integer not null default 1 check (page_count between 1 and 100000),
  cover_url text,
  file_path text not null unique,
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  allow_reading boolean not null default true,
  allow_download boolean not null default true,
  status text not null default 'published' check (status in ('published','pending','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint at_least_one_permission check (allow_reading or allow_download)
);
alter table public.books add column if not exists page_count integer not null default 1;
alter table public.books drop constraint if exists books_page_count_check;
alter table public.books add constraint books_page_count_check check (page_count between 1 and 100000);
create index if not exists books_published_created_idx on public.books(status, created_at desc);
create index if not exists books_uploader_idx on public.books(uploader_id);

create table if not exists public.reading_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  last_page integer not null default 1 check (last_page > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);
create table if not exists public.bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);
create table if not exists public.book_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  event_type text not null check (event_type in ('read','download','upload')),
  created_at timestamptz not null default now()
);
alter table public.book_events drop constraint if exists book_events_event_type_check;
alter table public.book_events add constraint book_events_event_type_check check (event_type in ('read','download','upload'));
create index if not exists book_events_recent_idx on public.book_events(created_at desc);
create index if not exists book_events_user_idx on public.book_events(user_id, event_type);
create or replace function public.record_book_upload()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.book_events (user_id, book_id, event_type) values (new.uploader_id, new.id, 'upload');
  return new;
end;
$$;
drop trigger if exists on_book_uploaded on public.books;
create trigger on_book_uploaded after insert on public.books for each row execute procedure public.record_book_upload();
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r join public.profiles p on p.id = r.user_id where r.user_id = (select auth.uid()) and r.role = 'admin' and p.status = 'active');
$$;
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'active');
$$;
revoke all on function public.is_admin() from public;
revoke all on function public.is_active_user() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;

create or replace function public.get_admin_user_stats()
returns table (user_id uuid, uploaded_count bigint, download_count bigint, read_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return query
    select p.id,
      (select count(*) from public.books b where b.uploader_id = p.id and b.status <> 'removed'),
      (select count(*) from public.book_events e where e.user_id = p.id and e.event_type = 'download'),
      (select count(*) from public.book_events e where e.user_id = p.id and e.event_type = 'read')
    from public.profiles p;
end;
$$;
revoke all on function public.get_admin_user_stats() from public;
grant execute on function public.get_admin_user_stats() to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, email, status)
  values (new.id, new.raw_user_meta_data ->> 'display_name', new.email, 'active')
  on conflict (id) do update set email = excluded.email;
  insert into public.user_roles (user_id, role) values (new.id, 'user') on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.books enable row level security;
alter table public.reading_progress enable row level security;
alter table public.bookmarks enable row level security;
alter table public.book_events enable row level security;
alter table public.reports enable row level security;

-- Remove policy names from the earlier starter schema. Permissive policies are OR-combined in Postgres.
drop policy if exists "Authenticated users can read profiles" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Authenticated users can view published books" on public.books;
drop policy if exists "Users can upload books" on public.books;
drop policy if exists "Uploaders can update their books" on public.books;
drop policy if exists "Uploaders can delete their books" on public.books;
drop policy if exists "Users can upload PDFs to their own folder" on storage.objects;
drop policy if exists "Users can update PDFs in their own folder" on storage.objects;
drop policy if exists "Users can delete PDFs in their own folder" on storage.objects;
drop policy if exists "Users manage their own reading progress" on public.reading_progress;
drop policy if exists "Users manage their own bookmarks" on public.bookmarks;
drop policy if exists "Users can create their own book events" on public.book_events;
drop policy if exists "Users can view their own book events" on public.book_events;
drop policy if exists "Users can report books" on public.reports;
drop policy if exists "Users can view their own reports" on public.reports;

-- Profiles: users can read their own profile; admins can monitor accounts.
drop policy if exists "profiles_read_self_or_admin" on public.profiles;
create policy "profiles_read_self_or_admin" on public.profiles for select to authenticated
using (id = (select auth.uid()) or public.is_admin());
drop policy if exists "profiles_update_own_name" on public.profiles;
drop policy if exists "admins_update_account_status" on public.profiles;
create policy "admins_update_account_status" on public.profiles for update to authenticated
using (public.is_admin() and id <> (select auth.uid())) with check (public.is_admin() and id <> (select auth.uid()));
revoke update on public.profiles from authenticated;
grant update (status) on public.profiles to authenticated;

-- Role records are readable only by their owner and admins. Nobody can change roles from the client.
drop policy if exists "roles_read_self_or_admin" on public.user_roles;
create policy "roles_read_self_or_admin" on public.user_roles for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());
revoke insert, update, delete on public.user_roles from anon, authenticated;

-- Signed-in, active users can discover published books; uploaders can see/manage their own books.
drop policy if exists "books_read_published_or_owner" on public.books;
create policy "books_read_published_or_owner" on public.books for select to authenticated
using (public.is_active_user() and (status = 'published' or uploader_id = (select auth.uid()) or public.is_admin()));
drop policy if exists "books_insert_as_self" on public.books;
create policy "books_insert_as_self" on public.books for insert to authenticated
with check (public.is_active_user() and uploader_id = (select auth.uid()) and (storage.foldername(file_path))[1] = (select auth.uid())::text);
drop policy if exists "books_update_owner_or_admin" on public.books;
create policy "books_update_owner_or_admin" on public.books for update to authenticated
using (public.is_active_user() and (uploader_id = (select auth.uid()) or public.is_admin()))
with check (public.is_active_user() and ((uploader_id = (select auth.uid()) and (storage.foldername(file_path))[1] = (select auth.uid())::text) or public.is_admin()));
drop policy if exists "books_delete_owner_or_admin" on public.books;
create policy "books_delete_owner_or_admin" on public.books for delete to authenticated
using (public.is_active_user() and (uploader_id = (select auth.uid()) or public.is_admin()));

-- Private PDF bucket. Uploads are allowed only into the uploader's own UUID folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('book-pdfs','book-pdfs',false,52428800,array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = array['application/pdf'];
drop policy if exists "pdf_upload_own_folder" on storage.objects;
create policy "pdf_upload_own_folder" on storage.objects for insert to authenticated
with check (bucket_id = 'book-pdfs' and public.is_active_user() and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "pdf_update_own_folder" on storage.objects;
create policy "pdf_update_own_folder" on storage.objects for update to authenticated
using (bucket_id = 'book-pdfs' and public.is_active_user() and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'book-pdfs' and public.is_active_user() and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "pdf_delete_own_folder" on storage.objects;
create policy "pdf_delete_own_folder" on storage.objects for delete to authenticated
using (bucket_id = 'book-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Deliberately no general authenticated SELECT policy for PDFs. get-book-url Edge Function verifies permissions.
drop policy if exists "Authenticated users can read PDF objects" on storage.objects;

-- Personal features. Events are written by the trusted Edge Function, not directly by browser clients.
drop policy if exists "reading_progress_self" on public.reading_progress;
create policy "reading_progress_self" on public.reading_progress for all to authenticated
using (user_id = (select auth.uid()) and public.is_active_user()) with check (user_id = (select auth.uid()) and public.is_active_user());
drop policy if exists "bookmarks_self" on public.bookmarks;
create policy "bookmarks_self" on public.bookmarks for all to authenticated
using (user_id = (select auth.uid()) and public.is_active_user()) with check (user_id = (select auth.uid()) and public.is_active_user());
drop policy if exists "events_admin_read_only" on public.book_events;
create policy "events_admin_read_only" on public.book_events for select to authenticated using (public.is_admin());
drop policy if exists "reports_insert_self" on public.reports;
create policy "reports_insert_self" on public.reports for insert to authenticated
with check (reporter_id = (select auth.uid()) and public.is_active_user());
drop policy if exists "reports_read_self_or_admin" on public.reports;
create policy "reports_read_self_or_admin" on public.reports for select to authenticated
using (reporter_id = (select auth.uid()) or public.is_admin());
revoke insert, update, delete on public.book_events from anon, authenticated;

-- Admin setup (run only AFTER creating your own account and replacing the UUID):
-- insert into public.user_roles (user_id, role) values ('YOUR-AUTH-USER-UUID', 'admin')
-- on conflict (user_id) do update set role = 'admin';
-- Never add a public admin signup form or expose a service-role key in Vite.
