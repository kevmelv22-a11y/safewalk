-- SafeWalk – kernschema, RLS en serverlogica
-- Principe: locatie is alleen zichtbaar voor de eigenaar en voor geaccepteerde
-- vertrouwde contacten die expliciet aan een ACTIEVE, NIET-VERLOPEN sessie zijn toegevoegd.
-- Beheerders krijgen GEEN toegang tot locaties.


-- ───────────── Tabellen ─────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  default_grace_minutes int not null default 5 check (default_grace_minutes between 1 and 30),
  sos_countdown_seconds int not null default 5 check (sos_countdown_seconds between 3 and 15),
  onboarding_done boolean not null default false,
  restricted boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.admins (user_id uuid primary key references auth.users(id) on delete cascade);

create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free','premium')),
  expires_at timestamptz,
  provider text,
  updated_at timestamptz not null default now()
);

create table public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,   -- deelt locatie
  contact_id uuid not null references auth.users(id) on delete cascade, -- mag meekijken (alleen per sessie)
  status text not null default 'accepted' check (status in ('accepted','removed')),
  created_at timestamptz not null default now(),
  unique (owner_id, contact_id),
  check (owner_id <> contact_id)
);

create table public.contact_invitations (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked')),
  responded_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

create table public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.safety_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_label text not null check (char_length(destination_label) between 1 and 120),
  destination_lat double precision check (destination_lat between -90 and 90),
  destination_lng double precision check (destination_lng between -180 and 180),
  expected_arrival timestamptz not null,
  status text not null default 'active' check (status in ('active','ended','expired','alert')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  expires_at timestamptz not null default now() + interval '12 hours'
);
create index on public.safety_sessions (user_id, status);

create table public.session_viewers (
  session_id uuid not null references public.safety_sessions(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (session_id, viewer_id)
);

create table public.location_updates (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.safety_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m real check (accuracy_m >= 0),
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on public.location_updates (session_id, recorded_at desc);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.safety_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  due_at timestamptz not null,
  grace_minutes int not null default 5 check (grace_minutes between 1 and 30),
  extensions int not null default 0,
  status text not null default 'pending' check (status in ('pending','confirmed','missed','cancelled')),
  responded_at timestamptz,
  escalated_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.check_ins (status, due_at);

create table public.safety_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.safety_sessions(id) on delete set null,
  kind text not null check (kind in ('sos','missed_check_in')),
  client_ref uuid unique, -- idempotentie voor offline-wachtrij
  lat double precision, lng double precision, accuracy_m real, location_at timestamptz,
  status text not null default 'open' check (status in ('open','cancelled','resolved')),
  created_at timestamptz not null default now()
);

create table public.alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.safety_alerts(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','sent','failed','no_token')),
  detail text,
  updated_at timestamptz not null default now(),
  unique (alert_id, recipient_id)
);

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text check (platform in ('ios','android','web')),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_id uuid,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('stalking','harassment','spam','other')),
  details text check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open','reviewing','closed')),
  created_at timestamptz not null default now()
);

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits int not null
);

-- ───────────── Hulpfuncties ─────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

create or replace function public.is_premium(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from subscriptions s where s.user_id = uid and s.tier = 'premium'
                 and (s.expires_at is null or s.expires_at > now()));
$$;

create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

create or replace function public.write_audit(p_action text, p_target uuid, p_meta jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into audit_logs(actor_id, action, target_id, meta) values (auth.uid(), p_action, p_target, coalesce(p_meta,'{}'));
$$;

-- Kern van de toegangscontrole: mag de huidige gebruiker deze sessie zien?
create or replace function public.can_view_session(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from safety_sessions s
    where s.id = p_session
      and (
        s.user_id = auth.uid()
        or (
          s.status in ('active','alert') and s.ended_at is null and s.expires_at > now()
          and exists (select 1 from session_viewers v
                      where v.session_id = s.id and v.viewer_id = auth.uid() and v.revoked_at is null)
          and exists (select 1 from trusted_contacts tc
                      where tc.owner_id = s.user_id and tc.contact_id = auth.uid() and tc.status = 'accepted')
          and not is_blocked_between(s.user_id, auth.uid())
        )
      )
  );
$$;

-- Atomische rate limiter (vast venster). Gebruikt door Edge Functions via service role.
create or replace function public.check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_hits int;
begin
  insert into rate_limits as r (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;

-- ───────────── Triggers ─────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name',''))
  on conflict do nothing;
  insert into subscriptions(user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Gratis: max 2 vertrouwde contacten (server-side afgedwongen).
create or replace function public.enforce_contact_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_count int; v_max int;
begin
  if new.status <> 'accepted' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'accepted' then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.owner_id::text));
  select count(*) into v_count from trusted_contacts
    where owner_id = new.owner_id and status = 'accepted' and id <> new.id;
  v_max := case when is_premium(new.owner_id) then 20 else 2 end;
  if v_count >= v_max then
    raise exception 'CONTACT_LIMIT: maximaal % vertrouwde contacten', v_max using errcode = 'P0001';
  end if;
  if is_blocked_between(new.owner_id, new.contact_id) then
    raise exception 'BLOCKED' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trusted_contacts_limit before insert or update on public.trusted_contacts
  for each row execute function public.enforce_contact_limit();

-- Verwijderen van contact → directe intrekking van alle sessietoegang.
create or replace function public.revoke_on_contact_removed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'removed' and old.status <> 'removed' then
    update session_viewers v set revoked_at = now()
      from safety_sessions s
      where v.session_id = s.id and s.user_id = new.owner_id and v.viewer_id = new.contact_id and v.revoked_at is null;
  end if;
  return new;
end $$;
create trigger trusted_contacts_revoke after update on public.trusted_contacts
  for each row execute function public.revoke_on_contact_removed();

-- Blokkeren → contactrelaties in beide richtingen verwijderen en toegang intrekken.
create or replace function public.apply_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update trusted_contacts set status = 'removed'
    where status = 'accepted' and ((owner_id = new.blocker_id and contact_id = new.blocked_id)
                                or (owner_id = new.blocked_id and contact_id = new.blocker_id));
  update contact_invitations set status = 'revoked'
    where status = 'pending' and inviter_id = new.blocked_id and responded_by = new.blocker_id;
  return new;
end $$;
create trigger blocks_apply after insert on public.blocks
  for each row execute function public.apply_block();

-- Kijkers kunnen alleen geaccepteerde contacten van de sessie-eigenaar zijn.
create or replace function public.validate_session_viewer() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select user_id into v_owner from safety_sessions where id = new.session_id;
  if not exists (select 1 from trusted_contacts where owner_id = v_owner and contact_id = new.viewer_id and status = 'accepted') then
    raise exception 'VIEWER_NOT_TRUSTED' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger session_viewers_validate before insert on public.session_viewers
  for each row execute function public.validate_session_viewer();

-- ───────────── RPC's (client) ─────────────
create or replace function public.create_invitation() returns text
language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if (select count(*) from contact_invitations where inviter_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'RATE_LIMITED';
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into contact_invitations(inviter_id, token_hash) values (auth.uid(), encode(sha256(convert_to(v_token,'UTF8')),'hex'));
  perform write_audit('invitation.created', null, '{}');
  return v_token; -- alleen de hash wordt opgeslagen
end $$;

create or replace function public.respond_invitation(p_token text, p_accept boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv contact_invitations;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into inv from contact_invitations
    where token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
  if inv.id is null or inv.status <> 'pending' or inv.expires_at < now() then raise exception 'INVITATION_INVALID'; end if;
  if inv.inviter_id = auth.uid() then raise exception 'INVITATION_SELF'; end if;
  if is_blocked_between(inv.inviter_id, auth.uid()) then raise exception 'INVITATION_INVALID'; end if;
  update contact_invitations set status = case when p_accept then 'accepted' else 'declined' end,
         responded_by = auth.uid() where id = inv.id;
  if p_accept then
    insert into trusted_contacts(owner_id, contact_id, status) values (inv.inviter_id, auth.uid(), 'accepted')
      on conflict (owner_id, contact_id) do update set status = 'accepted';
  end if;
  perform write_audit(case when p_accept then 'invitation.accepted' else 'invitation.declined' end, inv.inviter_id, '{}');
  return inv.inviter_id;
end $$;

create or replace function public.start_session(
  p_destination text, p_dest_lat double precision, p_dest_lng double precision,
  p_expected_arrival timestamptz, p_viewer_ids uuid[], p_grace_minutes int default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_viewer uuid; v_grace int;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_expected_arrival <= now() or p_expected_arrival > now() + interval '12 hours' then
    raise exception 'INVALID_ARRIVAL';
  end if;
  if coalesce(array_length(p_viewer_ids,1),0) = 0 then raise exception 'NO_VIEWERS'; end if;
  -- maximaal één actieve sessie tegelijk
  update safety_sessions set status = 'ended', ended_at = now() where user_id = auth.uid() and status in ('active','alert');
  select coalesce(p_grace_minutes, default_grace_minutes) into v_grace from profiles where id = auth.uid();
  insert into safety_sessions(user_id, destination_label, destination_lat, destination_lng, expected_arrival, expires_at)
    values (auth.uid(), p_destination, p_dest_lat, p_dest_lng, p_expected_arrival, p_expected_arrival + interval '2 hours')
    returning id into v_id;
  foreach v_viewer in array p_viewer_ids loop
    insert into session_viewers(session_id, viewer_id) values (v_id, v_viewer); -- trigger valideert
  end loop;
  insert into check_ins(session_id, user_id, due_at, grace_minutes) values (v_id, auth.uid(), p_expected_arrival, coalesce(v_grace,5));
  perform write_audit('session.started', v_id, jsonb_build_object('viewers', array_length(p_viewer_ids,1)));
  return v_id;
end $$;

create or replace function public.end_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update safety_sessions set status = 'ended', ended_at = now()
    where id = p_session and user_id = auth.uid() and ended_at is null;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  update check_ins set status = 'cancelled' where session_id = p_session and status = 'pending';
  update session_viewers set revoked_at = now() where session_id = p_session and revoked_at is null;
  perform write_audit('session.ended', p_session, '{}');
end $$;

create or replace function public.revoke_viewer(p_session uuid, p_viewer uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update session_viewers v set revoked_at = now() from safety_sessions s
    where v.session_id = s.id and s.id = p_session and s.user_id = auth.uid() and v.viewer_id = p_viewer and v.revoked_at is null;
  perform write_audit('session.viewer_revoked', p_session, jsonb_build_object('viewer', p_viewer));
end $$;

-- "Alles goed" of verlengen (max 3 verlengingen, max 60 min per keer)
create or replace function public.respond_check_in(p_session uuid, p_extend_minutes int default 0) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare c check_ins; v_due timestamptz;
begin
  select * into c from check_ins where session_id = p_session and user_id = auth.uid() and status in ('pending','missed')
    order by created_at desc limit 1 for update;
  if c.id is null then raise exception 'CHECK_IN_NOT_FOUND'; end if;
  if p_extend_minutes > 0 then
    if p_extend_minutes > 60 or c.extensions >= 3 then raise exception 'EXTENSION_NOT_ALLOWED'; end if;
    v_due := greatest(c.due_at, now()) + make_interval(mins => p_extend_minutes);
    update check_ins set due_at = v_due, extensions = extensions + 1, status = 'pending' where id = c.id;
    update safety_sessions set expected_arrival = v_due, expires_at = greatest(expires_at, v_due + interval '2 hours'),
      status = 'active' where id = p_session;
    perform write_audit('check_in.extended', p_session, jsonb_build_object('minutes', p_extend_minutes));
    return v_due;
  end if;
  update check_ins set status = 'confirmed', responded_at = now() where id = c.id;
  perform end_session(p_session);
  return null;
end $$;

-- ───────────── Server-side deadlinebewaking (service role / pg_cron) ─────────────
create or replace function public.escalate_missed_check_ins()
returns table(alert_id uuid, user_id uuid, session_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  -- sessies die hun harde vervaltijd voorbij zijn, worden beëindigd en toegang vervalt
  update safety_sessions s set status = 'expired', ended_at = now()
    where s.ended_at is null and s.expires_at < now();
  update session_viewers v set revoked_at = now() from safety_sessions s
    where v.session_id = s.id and s.ended_at is not null and v.revoked_at is null;

  return query
  with missed as (
    update check_ins c set status = 'missed', escalated_at = now()
      where c.status = 'pending' and c.due_at + make_interval(mins => c.grace_minutes) < now()
        and exists (select 1 from safety_sessions s where s.id = c.session_id and s.ended_at is null)
      returning c.session_id, c.user_id
  ), upd as (
    update safety_sessions s set status = 'alert' from missed m where s.id = m.session_id returning s.id
  ), ins as (
    insert into safety_alerts(user_id, session_id, kind, lat, lng, accuracy_m, location_at)
    select m.user_id, m.session_id, 'missed_check_in', l.lat, l.lng, l.accuracy_m, l.recorded_at
      from missed m
      left join lateral (select * from location_updates lu where lu.session_id = m.session_id
                         order by recorded_at desc limit 1) l on true
    returning safety_alerts.id, safety_alerts.user_id, safety_alerts.session_id
  )
  select ins.id, ins.user_id, ins.session_id from ins;
end $$;

-- Bewaarbeleid: locaties 24 uur na sessie-einde verwijderen; oude rate-limits opruimen.
create or replace function public.purge_old_locations() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from location_updates lu using safety_sessions s
    where lu.session_id = s.id and s.ended_at is not null and s.ended_at < now() - interval '24 hours';
  get diagnostics n = row_count;
  -- vangnet: nooit langer dan 3 dagen
  delete from location_updates where created_at < now() - interval '3 days';
  update safety_alerts set lat = null, lng = null, accuracy_m = null
    where created_at < now() - interval '30 days' and lat is not null;
  delete from rate_limits where window_start < now() - interval '1 day';
  return n;
end $$;

-- ───────────── RLS ─────────────
alter table public.profiles enable row level security;
alter table public.admins enable row level security;
alter table public.subscriptions enable row level security;
alter table public.trusted_contacts enable row level security;
alter table public.contact_invitations enable row level security;
alter table public.blocks enable row level security;
alter table public.safety_sessions enable row level security;
alter table public.session_viewers enable row level security;
alter table public.location_updates enable row level security;
alter table public.check_ins enable row level security;
alter table public.safety_alerts enable row level security;
alter table public.alert_deliveries enable row level security;
alter table public.push_tokens enable row level security;
alter table public.audit_logs enable row level security;
alter table public.abuse_reports enable row level security;
alter table public.rate_limits enable row level security;

-- profiles: eigen profiel; namen van eigen contacten zichtbaar; admin ziet profielen (geen locaties)
create policy profiles_self on public.profiles for select using (
  id = auth.uid() or public.is_admin()
  or exists (select 1 from public.trusted_contacts tc where tc.status = 'accepted'
             and ((tc.owner_id = auth.uid() and tc.contact_id = profiles.id) or (tc.contact_id = auth.uid() and tc.owner_id = profiles.id))));
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and restricted = false);

create policy subs_self on public.subscriptions for select using (user_id = auth.uid() or public.is_admin());

create policy tc_select on public.trusted_contacts for select using (owner_id = auth.uid() or contact_id = auth.uid());
-- beide kanten mogen de relatie beëindigen (status → removed); nooit heractiveren via client
create policy tc_remove on public.trusted_contacts for update
  using (owner_id = auth.uid() or contact_id = auth.uid()) with check (status = 'removed');

create policy inv_select on public.contact_invitations for select using (inviter_id = auth.uid());
create policy inv_revoke on public.contact_invitations for update using (inviter_id = auth.uid()) with check (status = 'revoked');

create policy blocks_select on public.blocks for select using (blocker_id = auth.uid());
create policy blocks_insert on public.blocks for insert with check (blocker_id = auth.uid());
create policy blocks_delete on public.blocks for delete using (blocker_id = auth.uid());

create policy sessions_select on public.safety_sessions for select using (public.can_view_session(id));

create policy viewers_select on public.session_viewers for select using (
  viewer_id = auth.uid() or exists (select 1 from public.safety_sessions s where s.id = session_id and s.user_id = auth.uid()));

-- DE kernregel voor locatie
create policy loc_select on public.location_updates for select using (public.can_view_session(session_id));
create policy loc_insert on public.location_updates for insert with check (
  user_id = auth.uid() and exists (select 1 from public.safety_sessions s where s.id = session_id
    and s.user_id = auth.uid() and s.ended_at is null and s.expires_at > now()));
create policy loc_delete_own on public.location_updates for delete using (user_id = auth.uid());

create policy checkins_select on public.check_ins for select using (public.can_view_session(session_id));

create policy alerts_select on public.safety_alerts for select using (
  user_id = auth.uid() or exists (select 1 from public.alert_deliveries d where d.alert_id = id and d.recipient_id = auth.uid()));
create policy alerts_cancel on public.safety_alerts for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy deliveries_select on public.alert_deliveries for select using (
  recipient_id = auth.uid() or exists (select 1 from public.safety_alerts a where a.id = alert_id and a.user_id = auth.uid()));

create policy push_self on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy abuse_insert on public.abuse_reports for insert with check (reporter_id = auth.uid());
create policy abuse_select on public.abuse_reports for select using (reporter_id = auth.uid() or public.is_admin());
create policy abuse_admin_update on public.abuse_reports for update using (public.is_admin());

create policy audit_admin on public.audit_logs for select using (public.is_admin());
-- admins / rate_limits: geen policies → alleen service role

-- Kolom-niveau: clients mogen alleen status van eigen alert wijzigen
revoke update on public.safety_alerts from authenticated;
grant update (status) on public.safety_alerts to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, default_grace_minutes, sos_countdown_seconds, onboarding_done) on public.profiles to authenticated;
revoke update on public.trusted_contacts from authenticated;
grant update (status) on public.trusted_contacts to authenticated;
revoke update on public.contact_invitations from authenticated;
grant update (status) on public.contact_invitations to authenticated;

revoke execute on function public.escalate_missed_check_ins() from public, anon, authenticated;
revoke execute on function public.purge_old_locations() from public, anon, authenticated;
revoke execute on function public.check_rate_limit(text,int,int) from public, anon, authenticated;
revoke execute on function public.write_audit(text,uuid,jsonb) from public, anon, authenticated;
