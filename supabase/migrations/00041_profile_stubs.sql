-- Allow guardian profile stubs that don't have portal (auth) accounts yet.
--
-- Before: profiles.id was a FK to auth.users(id), meaning every profile
-- required a corresponding Supabase Auth user. This blocked importing
-- guardian contact info without sending portal invitations.
--
-- After: profiles.id is a standalone UUID PK with a default. A separate
-- nullable column `auth_user_id` tracks which profiles are linked to auth
-- users. The trigger that auto-creates profiles on auth sign-up now populates
-- auth_user_id instead of using the auth.users id as the profile id.

-- 1. Drop the FK constraint and add a UUID default
alter table profiles
  drop constraint if exists profiles_id_fkey;

alter table profiles
  alter column id set default gen_random_uuid();

-- 2. Add auth_user_id for profiles that do have auth accounts
alter table profiles
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

-- Backfill: existing profiles have id = auth.users.id, so set auth_user_id = id
-- Only where that id actually exists in auth.users (should be all of them pre-migration)
update profiles p
set auth_user_id = p.id
where p.auth_user_id is null
  and exists (select 1 from auth.users u where u.id = p.id);

create index if not exists idx_profiles_auth_user on profiles(auth_user_id);

-- 3. Update the auth sign-up trigger to set auth_user_id
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Check if a profile stub already exists for this email
  update public.profiles
  set auth_user_id = new.id,
      email        = coalesce(email, new.email),
      full_name    = coalesce(nullif(full_name, ''), coalesce(new.raw_user_meta_data->>'full_name', ''))
  where email = new.email and auth_user_id is null;

  -- If no existing stub, create a new profile
  if not found then
    insert into public.profiles (id, auth_user_id, email, full_name, avatar_url)
    values (
      new.id,
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', ''),
      new.raw_user_meta_data->>'avatar_url'
    )
    on conflict (id) do update
      set auth_user_id = excluded.auth_user_id,
          email        = excluded.email;
  end if;

  return new;
end;
$$;
