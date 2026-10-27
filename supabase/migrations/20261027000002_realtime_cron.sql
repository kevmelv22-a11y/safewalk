-- Realtime-publicatie (Realtime respecteert RLS voor postgres_changes)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.location_updates, public.safety_sessions, public.alert_deliveries, public.check_ins;
  end if;
end $$;

-- pg_cron: retentie elk kwartier + check-deadlines elke minuut (via pg_net → Edge Function).
-- Vereist secrets in Supabase Vault: 'project_url' en 'cron_secret' (zie README).
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule('safewalk-purge-locations', '*/15 * * * *', 'select public.purge_old_locations()');
    perform cron.schedule('safewalk-check-deadlines', '* * * * *', $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/check-deadlines',
        headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
        body := '{}'::jsonb)
    $cron$);
  end if;
end $$;
