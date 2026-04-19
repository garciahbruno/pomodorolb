create or replace function public.record_completion(
  p_user_id uuid,
  p_cooldown_minutes integer default 50
)
returns table (
  user_id uuid,
  completed_at timestamptz,
  next_allowed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_completed_at timestamptz;
  v_next_allowed_at timestamptz;
  v_retry_after_seconds integer;
begin
  if p_user_id is null then
    raise exception using errcode = 'P0001', message = 'completion_user_required';
  end if;

  if p_cooldown_minutes is null or p_cooldown_minutes < 1 then
    raise exception using errcode = 'P0001', message = 'completion_invalid_cooldown';
  end if;

  if auth.role() <> 'service_role' then
    if auth.uid() is null or auth.uid() <> p_user_id then
      raise exception using errcode = '42501', message = 'completion_forbidden';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text),
    hashtext(reverse(p_user_id::text))
  );

  select c.completed_at
  into v_last_completed_at
  from public.completions c
  where c.user_id = p_user_id
  order by c.completed_at desc
  limit 1;

  if v_last_completed_at is not null then
    v_next_allowed_at := v_last_completed_at + make_interval(mins => p_cooldown_minutes);

    if v_next_allowed_at > now() then
      v_retry_after_seconds := greatest(
        1,
        ceil(extract(epoch from (v_next_allowed_at - now())))::integer
      );

      raise exception using
        errcode = 'P0001',
        message = 'completion_cooldown_active',
        detail = json_build_object(
          'next_allowed_at', v_next_allowed_at,
          'retry_after_seconds', v_retry_after_seconds
        )::text;
    end if;
  end if;

  return query
  insert into public.completions (user_id)
  values (p_user_id)
  returning
    public.completions.user_id,
    public.completions.completed_at,
    public.completions.completed_at + make_interval(mins => p_cooldown_minutes);
end;
$$;

revoke all on function public.record_completion(uuid, integer) from public, anon;
grant execute on function public.record_completion(uuid, integer) to authenticated, service_role;
