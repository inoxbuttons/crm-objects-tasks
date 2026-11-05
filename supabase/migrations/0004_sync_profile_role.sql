-- 0004: Supabase Auth сначала вставляет строку в auth.users, а app_metadata
-- (с ролью) дописывает отдельным UPDATE. Поэтому синхронизируем профиль и при
-- изменении app_metadata. Менять app_metadata может только админ (secret key),
-- пользователь через API — нет; user_metadata на роль не влияет.

create function private.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set role = coalesce((new.raw_app_meta_data ->> 'role')::public.user_role, role),
         email = new.email
   where id = new.id;
  return new;
end;
$$;

revoke all on function private.sync_profile_from_auth() from public, anon, authenticated;

create trigger on_auth_user_updated
  after update of raw_app_meta_data, email on auth.users
  for each row execute function private.sync_profile_from_auth();

-- Починить уже созданные профили
update public.profiles p
   set role = (u.raw_app_meta_data ->> 'role')::public.user_role
  from auth.users u
 where u.id = p.id and u.raw_app_meta_data ? 'role';
