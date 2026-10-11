-- LeadDesk, Workshop 5 (Task B): the leads table, the same fields as materials/leads.json.
-- The vocabulary is the app's own: LEAD_STATUSES and LEAD_SOURCES in lib/types.ts, ids like leadId() in lib/db.ts.

create table public.leads (
  id         text        primary key check (id ~ '^lead_[0-9]{4}$'),
  full_name  text        not null,
  company    text        not null,
  email      text        not null,
  source     text        not null check (source in ('website', 'google-ads', 'facebook-ads', 'linkedin', 'referral', 'webinar')),
  status     text        not null check (status in ('new', 'contacted', 'qualified', 'won', 'lost')),
  budget     integer     check (budget is null or budget >= 0),
  message    text        not null,
  created_at timestamptz not null
);

comment on table public.leads is 'LeadDesk leads: 20 synthetic rows from materials/leads.json (Workshop 5).';
comment on column public.leads.status is 'new | contacted | qualified | won | lost (LEAD_STATUSES in lib/types.ts)';
comment on column public.leads.budget is 'Budget in USD; null when the lead did not name one';

-- RLS on and no policies: the public API keys (anon, authenticated) read nothing.
-- Only privileged roles, such as the one behind the Supabase MCP server, see the rows.
alter table public.leads enable row level security;
