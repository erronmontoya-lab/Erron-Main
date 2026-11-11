-- ChurnIndex Phase 1 core schema.
--
-- Rules from the brief (sections 7 and 11):
--   * Row level security on every table, scoped to the account owner.
--   * Founders can READ their own data. Only server code (service role, in
--     Edge Functions) writes synced data, metrics and keys.
--   * Stripe keys live encrypted in Supabase Vault and never reach the browser.
--   * Store only the fields the metrics need: no card details, addresses or
--     end-customer emails.
--   * One call deletes an account, its stored key and every synced row.
--
-- NEEDS ENGINEER REVIEW before launch (brief section 11, item 2).

-- ------------------------------------------------------------------ accounts
-- One connected app. Phase 1 has one owner per account.
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  app_name text not null,
  category text,                -- self-reported, used for benchmark cohorts
  build_stack text,             -- self-reported (Lovable, Bolt, own stack...)
  primary_currency text,        -- set after the first sync
  multi_currency boolean not null default false,
  stripe_connected_at timestamptz,
  stripe_key_last4 text,        -- for display only
  sync_status text not null default 'not_connected'
    check (sync_status in ('not_connected', 'backfilling', 'ready', 'error')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index accounts_owner_idx on public.accounts (owner_id);

-- Founders can create, read and rename their own accounts. Connection and
-- sync fields are changed only by server code.
alter table public.accounts enable row level security;
create policy "owners read accounts" on public.accounts
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owners create accounts" on public.accounts
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owners update accounts" on public.accounts
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke insert, update on public.accounts from authenticated;
grant insert (owner_id, app_name, category, build_stack) on public.accounts to authenticated;
grant update (app_name, category, build_stack) on public.accounts to authenticated;

-- Helper used by every child-table policy.
create function public.owns_account(p_account_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.accounts a
    where a.id = p_account_id and a.owner_id = (select auth.uid())
  );
$$;
revoke execute on function public.owns_account(uuid) from public, anon;
grant execute on function public.owns_account(uuid) to authenticated;

-- ------------------------------------------------------- stripe credentials
-- Points at the Vault secret. No policies: browsers can never read this table.
create table public.stripe_credentials (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  vault_secret_id uuid not null,
  validated_at timestamptz not null default now()
);
alter table public.stripe_credentials enable row level security;

-- ------------------------------------------------------------- synced data
-- Mirrors churnindex/phase0/scorecard/models.py. Money in major units.
create table public.subscriptions (
  account_id uuid not null references public.accounts (id) on delete cascade,
  id text not null,                         -- Stripe subscription id
  customer_id text not null,                -- Stripe customer id only
  currency text not null,
  status text not null,
  start_at timestamptz not null,
  trial_end timestamptz,
  ended_at timestamptz,
  cancellation_reason text,
  discount_duration text check (discount_duration in ('once', 'repeating', 'forever')),
  discount_percent_off numeric,
  discount_amount_off numeric,
  discount_duration_in_months int,
  discount_start timestamptz,
  pause_start timestamptz,
  pause_end timestamptz,
  stripe_updated_at timestamptz,
  primary key (account_id, id)
);

create table public.subscription_items (
  account_id uuid not null,
  subscription_id text not null,
  id text not null,                         -- Stripe item id, or a generated id per price period
  unit_amount numeric not null,
  interval text not null check (interval in ('day', 'week', 'month', 'year')),
  interval_count int not null default 1,
  quantity int not null default 1,
  start_at timestamptz not null,
  end_at timestamptz,
  primary key (account_id, id),
  foreign key (account_id, subscription_id)
    references public.subscriptions (account_id, id) on delete cascade
);
create index subscription_items_sub_idx on public.subscription_items (account_id, subscription_id);

create table public.invoices (
  account_id uuid not null references public.accounts (id) on delete cascade,
  id text not null,
  customer_id text not null,
  subscription_id text,
  created_at timestamptz not null,
  currency text not null,
  amount_due numeric not null,
  amount_paid numeric not null,
  status text not null,
  first_failed_at timestamptz,
  paid_at timestamptz,
  primary key (account_id, id)
);
create index invoices_sub_idx on public.invoices (account_id, subscription_id);
create index invoices_failed_idx on public.invoices (account_id, first_failed_at)
  where first_failed_at is not null;

create table public.fx_rates (
  account_id uuid not null references public.accounts (id) on delete cascade,
  currency text not null,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  rate numeric not null,
  primary key (account_id, currency, month)
);

-- ---------------------------------------------------------- computed output
create table public.monthly_metrics (
  account_id uuid not null references public.accounts (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  currency text not null,
  mrr_start numeric not null,
  mrr_end numeric not null,
  customers_start int not null,
  customers_churned int not null,
  logo_churn_rate numeric,
  revenue_churn_rate numeric,
  voluntary_churned_mrr numeric not null,
  involuntary_churned_mrr numeric not null,
  recovery_rate numeric,
  failed_payment_mrr_at_risk numeric not null,
  trial_to_paid_rate numeric,
  recoverable_revenue numeric not null,
  details jsonb not null default '{}'::jsonb,  -- every other MonthMetrics field
  computed_at timestamptz not null default now(),
  primary key (account_id, month)
);

create table public.sync_runs (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  kind text not null check (kind in ('backfill', 'incremental')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  error text                                -- never contains the key
);
create index sync_runs_account_idx on public.sync_runs (account_id, started_at desc);

-- Owners read their own rows; nobody writes from the browser.
do $$
declare t text;
begin
  foreach t in array array['subscriptions', 'subscription_items', 'invoices', 'fx_rates',
                           'monthly_metrics', 'sync_runs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owners read %1$s" on public.%1$I for select to authenticated
         using ((select public.owns_account(account_id)))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- share cards
-- Public by design: shows recoverable revenue only, never churn or percentile.
create table public.share_cards (
  slug text primary key default encode(extensions.gen_random_bytes(8), 'hex'),
  account_id uuid not null references public.accounts (id) on delete cascade,
  recoverable_revenue numeric not null,
  currency text not null,
  created_at timestamptz not null default now()
);
create index share_cards_account_idx on public.share_cards (account_id);
alter table public.share_cards enable row level security;
create policy "anyone reads share cards" on public.share_cards
  for select to anon, authenticated using (true);
-- Hide the account id from the public; only the card's own fields are readable.
revoke select on public.share_cards from anon, authenticated;
grant select (slug, recoverable_revenue, currency, created_at) on public.share_cards to anon, authenticated;

-- ------------------------------------------------------------- key storage
-- Server-only. Edge Functions validate the key is read-only, then call this.
create function public.store_stripe_key(p_account_id uuid, p_key text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  if p_key !~ '^rk_(test|live)_' then
    raise exception 'Only restricted keys (rk_...) are accepted';
  end if;
  select vault_secret_id into v_old from public.stripe_credentials where account_id = p_account_id;
  v_new := vault.create_secret(p_key, 'stripe_key_' || p_account_id::text || '_' || extract(epoch from now())::bigint);
  insert into public.stripe_credentials (account_id, vault_secret_id)
    values (p_account_id, v_new)
    on conflict (account_id) do update set vault_secret_id = excluded.vault_secret_id, validated_at = now();
  if v_old is not null then
    delete from vault.secrets where id = v_old;
  end if;
  update public.accounts
    set stripe_connected_at = now(), stripe_key_last4 = right(p_key, 4)
    where id = p_account_id;
end;
$$;

create function public.read_stripe_key(p_account_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select s.decrypted_secret
  from public.stripe_credentials c
  join vault.decrypted_secrets s on s.id = c.vault_secret_id
  where c.account_id = p_account_id;
$$;

revoke execute on function public.store_stripe_key(uuid, text) from public, anon, authenticated;
revoke execute on function public.read_stripe_key(uuid) from public, anon, authenticated;
grant execute on function public.store_stripe_key(uuid, text) to service_role;
grant execute on function public.read_stripe_key(uuid) to service_role;

-- ---------------------------------------------------------- one-click delete
-- Callable by the owner from the browser. Deletes the Vault secret, then the
-- account; every synced row goes with it through ON DELETE CASCADE.
create function public.delete_account(p_account_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_secret uuid;
begin
  if not exists (select 1 from public.accounts
                 where id = p_account_id and owner_id = (select auth.uid())) then
    raise exception 'Account not found';
  end if;
  select vault_secret_id into v_secret from public.stripe_credentials where account_id = p_account_id;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
  delete from public.accounts where id = p_account_id;
end;
$$;
revoke execute on function public.delete_account(uuid) from public, anon;
grant execute on function public.delete_account(uuid) to authenticated;
