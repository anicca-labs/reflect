-- Email opt-outs. Every outreach recipient query must exclude these addresses
-- (NOT EXISTS against this table). Service-role only; metadata only.
-- First row: cgmrsdepp@gmail.com replied "unsubscribe" to the 2026-09-17 product-news email.
create table if not exists api.email_unsubscribes (
  email text primary key,
  unsubscribed_at timestamptz not null default now(),
  source text
);
alter table api.email_unsubscribes enable row level security;
grant select, insert, delete on api.email_unsubscribes to service_role;
