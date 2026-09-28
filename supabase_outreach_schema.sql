-- ==============================================================================
-- Robostangs Attendance System - Outreach Tables Schema
-- Run this script in your Supabase Dashboard: SQL Editor > New query > Run
-- ==============================================================================

-- 1. Outreach Events Table
-- Stores event records created when Outreach Mode is activated in the scanner app.
create table if not exists public.outreach_events (
    id text primary key,
    name text not null,
    start_time timestamptz,
    end_time timestamptz,
    location text,
    status text not null default 'active',
    created_at timestamptz not null default now()
);

-- 2. Outreach Attendance Table
-- Stores check-ins and check-outs bucketed under a specific outreach event.
create table if not exists public.outreach_attendance (
    id uuid primary key default gen_random_uuid(),
    event_id text references public.outreach_events(id) on delete cascade,
    event_name text not null,
    member_id text not null,
    check_in timestamptz not null default now(),
    check_out timestamptz,
    created_at timestamptz not null default now()
);

-- 3. Indexes for fast lookups
create index if not exists idx_outreach_events_status_created
    on public.outreach_events(status, created_at desc);

create index if not exists idx_outreach_attendance_event
    on public.outreach_attendance(event_id, check_in asc);

create index if not exists idx_outreach_attendance_member_event
    on public.outreach_attendance(member_id, event_id, check_out);

-- 4. Enable Row Level Security (RLS)
alter table public.outreach_events enable row level security;
alter table public.outreach_attendance enable row level security;

-- 5. Policies for outreach_events (Scanner app with anon key + service role)
drop policy if exists "Allow select outreach_events" on public.outreach_events;
create policy "Allow select outreach_events"
    on public.outreach_events for select using (true);

drop policy if exists "Allow insert outreach_events" on public.outreach_events;
create policy "Allow insert outreach_events"
    on public.outreach_events for insert with check (true);

drop policy if exists "Allow update outreach_events" on public.outreach_events;
create policy "Allow update outreach_events"
    on public.outreach_events for update using (true);

-- 6. Policies for outreach_attendance (Scanner app with anon key + service role)
drop policy if exists "Allow select outreach_attendance" on public.outreach_attendance;
create policy "Allow select outreach_attendance"
    on public.outreach_attendance for select using (true);

drop policy if exists "Allow insert outreach_attendance" on public.outreach_attendance;
create policy "Allow insert outreach_attendance"
    on public.outreach_attendance for insert with check (true);

drop policy if exists "Allow update outreach_attendance" on public.outreach_attendance;
create policy "Allow update outreach_attendance"
    on public.outreach_attendance for update using (true);
