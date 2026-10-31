-- Run after 001_core.sql in a Supabase PostgreSQL project.
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null default 'Team member',
 role text not null default 'readonly' check(role in ('administrator','manager','staff','readonly'))
);
alter table public.profiles enable row level security;
create policy "Read own profile" on public.profiles for select to authenticated using(id=auth.uid());
grant select on public.profiles to authenticated;
create or replace function public.app_new_user() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 insert into public.profiles(id,name) values(new.id,coalesce(new.raw_user_meta_data->>'name',split_part(new.email,'@',1),'Team member')) on conflict do nothing;
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.app_new_user();
insert into public.profiles(id,name) select id,coalesce(raw_user_meta_data->>'name',split_part(email,'@',1),'Team member') from auth.users on conflict do nothing;

create or replace function public.app_set_identity() returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.profiles;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into p from public.profiles where id=auth.uid();
 if p.id is null then raise exception 'User profile is not configured'; end if;
 perform set_config('app.actor_id',p.id::text,true);
 perform set_config('app.actor_name',p.name,true);
 perform set_config('app.actor_role',p.role,true);
end $$;
create or replace function public.app_read() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.app_set_identity();
 return public.app_snapshot();
end $$;
create or replace function public.app_mutate(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.app_set_identity();
 return public.app_apply(operation,payload);
end $$;
-- No client may directly mutate storage or select private data outside RPC policy.
alter table public.facilities enable row level security;
alter table public.rates enable row level security;
alter table public.customers enable row level security;
alter table public.bookings enable row level security;
alter table public.closures enable row level security;
alter table public.audit enable row level security;
alter table public.schedule_guard enable row level security;
revoke all on public.facilities,public.rates,public.customers,public.bookings,public.closures,public.audit,public.schedule_guard from anon,authenticated;
revoke all on function public.app_apply(text,jsonb),public.app_snapshot(),public.app_set_identity(),public.app_role(),public.app_actor(),public.app_resources_conflict(text,text),public.app_reserved_start(jsonb),public.app_reserved_end(jsonb),public.app_validate_schedule(),public.app_audit_change(),public.app_new_user() from public,anon,authenticated;
revoke all on function public.app_read(),public.app_mutate(text,jsonb) from public,anon;
grant execute on function public.app_read(),public.app_mutate(text,jsonb) to authenticated;
-- Assign the first administrator in the SQL editor after creating their auth user:
-- update public.profiles set role='administrator' where id='<AUTH USER UUID>';
-- Never derive a role from client-provided auth metadata.
