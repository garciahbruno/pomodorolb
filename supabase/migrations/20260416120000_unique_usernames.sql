update public.profiles
set username = nullif(btrim(username), '')
where username is distinct from nullif(btrim(username), '');

with ranked as (
  select
    id,
    username,
    row_number() over (
      partition by lower(username)
      order by id
    ) as duplicate_rank
  from public.profiles
  where username is not null
)
update public.profiles p
set username = format(
  '%s-%s',
  left(r.username, 48),
  left(replace(p.id::text, '-', ''), 8)
)
from ranked r
where p.id = r.id
  and r.duplicate_rank > 1;

alter table public.profiles
drop constraint if exists profiles_username_not_blank;

alter table public.profiles
add constraint profiles_username_not_blank
check (username is null or btrim(username) <> '');

create unique index if not exists profiles_username_unique_idx
on public.profiles (lower(username))
where username is not null;

create or replace function public.normalize_profile_username()
returns trigger
language plpgsql
as $$
begin
  if new.username is not null then
    new.username := nullif(btrim(new.username), '');
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_profile_username on public.profiles;
create trigger normalize_profile_username
before insert or update of username
on public.profiles
for each row
execute function public.normalize_profile_username();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := nullif(btrim(new.raw_user_meta_data ->> 'username'), '');

  if v_username is null then
    v_username := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
  end if;

  if v_username is null then
    v_username := format('user-%s', left(replace(new.id::text, '-', ''), 8));
  end if;

  insert into public.profiles (id, username)
  values (new.id, v_username)
  on conflict (id) do update
  set username = coalesce(public.profiles.username, excluded.username);

  return new;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'username_taken';
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
