-- Foundery schema (PostgreSQL / Supabase).
--
-- Everything lives in the `foundery` schema rather than `public` on purpose:
-- Supabase auto-generates a REST API over `public`, and these tables hold
-- salaries and client revenue. Keeping them out of `public` means PostgREST
-- never sees them, so the anon key cannot reach them even by accident. Row
-- level security is switched on underneath as a second lock.
--
-- Idempotent: safe to run against an existing database.

create schema if not exists foundery;

-- Belt and braces: make sure Supabase's API roles have nothing here. They
-- only exist on Supabase, so this is skipped on a plain Postgres (or the
-- local PGlite database) rather than failing the whole script.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema foundery from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema foundery from authenticated';
  end if;
end $$;

create table if not exists foundery.clients (
  id              bigint generated always as identity primary key,
  name            text not null,
  slug            text not null unique,
  status          text not null default 'active',      -- active | paused | churned
  engagement      text not null default 'retainer',    -- retainer | one_time
  vip             boolean not null default false,
  services        jsonb not null default '[]'::jsonb,  -- array of service tags
  retainer_amount numeric(14,2) not null default 0,    -- per month, founder-only
  one_time_value  numeric(14,2) not null default 0,    -- total contract, founder-only
  delivery_cost   numeric(14,2) not null default 0,    -- monthly cost to serve
  currency        text not null default 'INR',
  start_date      date,
  end_date        date,
  billing_day     integer not null default 1,          -- day the invoice is raised
  terms_days      integer not null default 15,         -- net-N payment terms
  owner           text,
  health          text not null default 'green',       -- green | amber | red
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists foundery.costs (
  id          bigint generated always as identity primary key,
  category    text not null,          -- salary | tools | contractor | charity | marketing | other
  label       text not null,
  person      text,                   -- redacted from the operator on sensitive categories
  amount      numeric(14,2) not null default 0,
  cadence     text not null default 'monthly',   -- monthly | annual | one_time
  currency    text not null default 'INR',
  start_date  date,
  end_date    date,
  active      boolean not null default true,
  client_id   bigint references foundery.clients(id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_costs_category on foundery.costs(category);

create table if not exists foundery.invoices (
  id          bigint generated always as identity primary key,
  client_id   bigint not null references foundery.clients(id) on delete cascade,
  number      text not null unique,
  period      text,                   -- '2026-08', or 'Phase 1'
  issue_date  date not null,
  due_date    date not null,
  terms_days  integer not null default 15,
  amount      numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  currency    text not null default 'INR',
  status      text not null default 'draft',   -- draft | sent | part_paid | paid | void
  paid_date   date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_invoices_client on foundery.invoices(client_id);
-- Ties a row to the external system it was synced from (e.g. Zoho Books), so
-- re-syncing updates in place instead of duplicating.
alter table foundery.invoices add column if not exists external_id text unique;
create index if not exists idx_invoices_due    on foundery.invoices(due_date);

create table if not exists foundery.onboarding_forms (
  id         bigint generated always as identity primary key,
  title      text not null,
  intro      text,
  token      text not null unique,    -- the public URL segment
  client_id  bigint references foundery.clients(id) on delete set null,
  fields     jsonb not null default '[]'::jsonb,
  status     text not null default 'open',     -- open | closed
  created_by text not null default 'founder',
  created_at timestamptz not null default now()
);

create table if not exists foundery.onboarding_submissions (
  id           bigint generated always as identity primary key,
  form_id      bigint not null references foundery.onboarding_forms(id) on delete cascade,
  answers      jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now()
);
create index if not exists idx_submissions_form on foundery.onboarding_submissions(form_id);

-- The handful of P&L figures that aren't derivable from invoices and costs.
create table if not exists foundery.pnl_months (
  month         text primary key,     -- 'YYYY-MM'
  other_income  numeric(14,2) not null default 0,
  one_off_costs numeric(14,2) not null default 0,
  tax_rate      numeric(5,4) not null default 0,   -- 0..1
  notes         text,
  closed        boolean not null default false,
  updated_at    timestamptz not null default now()
);

-- Guided, per-client onboarding: one personalised link per client, a fixed
-- details form, then an access checklist. `details` and `access` are jsonb so
-- the field list can evolve without a migration.
create table if not exists foundery.onboardings (
  id           bigint generated always as identity primary key,
  client_id    bigint not null references foundery.clients(id) on delete cascade,
  token        text not null unique,          -- the personalised URL segment
  status       text not null default 'invited',   -- invited | details_done | completed
  details      jsonb not null default '{}'::jsonb,
  access       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_onboardings_client on foundery.onboardings(client_id);

create table if not exists foundery.settings (
  key   text primary key,
  value text not null
);

create table if not exists foundery.audit_log (
  id        bigint generated always as identity primary key,
  ts        timestamptz not null default now(),
  actor     text not null,            -- founder | operator | public
  action    text not null,
  entity    text,
  entity_id text,
  detail    text
);
create index if not exists idx_audit_ts on foundery.audit_log(ts desc);

-- Nothing reaches these tables except the owner connection the app uses.
alter table foundery.clients                enable row level security;
alter table foundery.costs                  enable row level security;
alter table foundery.invoices               enable row level security;
alter table foundery.onboarding_forms       enable row level security;
alter table foundery.onboarding_submissions enable row level security;
alter table foundery.pnl_months             enable row level security;
alter table foundery.settings               enable row level security;
alter table foundery.onboardings            enable row level security;
alter table foundery.audit_log              enable row level security;
