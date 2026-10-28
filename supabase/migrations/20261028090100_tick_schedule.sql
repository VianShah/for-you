-- Every 5 minutes: send the notifications the phones scheduled ("Goldiee is crying").
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('diary-tick') where exists (select 1 from cron.job where jobname = 'diary-tick');
select cron.schedule('diary-tick', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://egvoajakldcsdyhbprxg.supabase.co/functions/v1/tick',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-tick', (select value from public.config where key = 'tick_secret')),
    body := '{}'::jsonb
  );
$$);
