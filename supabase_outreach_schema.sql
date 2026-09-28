-- outreach tables

-- store outreach events
create table if not exists public.outreach_events (
    id text primary key,
    name text not null,
    start_time timestamptz,
    end_time timestamptz,
    location text,
    status text not null default 'active',
    created_at timestamptz not null default now()
);

-- store outreach check-ins and check-outs
create table if not exists public.outreach_attendance (
    id uuid primary key default gen_random_uuid(),
    event_id text references public.outreach_events(id) on delete cascade,
    event_name text not null,
    member_id text not null,
    check_in timestamptz not null default now(),
    check_out timestamptz,
    created_at timestamptz not null default now()
);

-- speed up common queries
create index if not exists idx_outreach_events_status_created
    on public.outreach_events(status, created_at desc);

create index if not exists idx_outreach_attendance_event
    on public.outreach_attendance(event_id, check_in asc);

create index if not exists idx_outreach_attendance_member_event
    on public.outreach_attendance(member_id, event_id, check_out);

-- enable row-level security
alter table public.outreach_events enable row level security;
alter table public.outreach_attendance enable row level security;

-- allow the scanner to access events
drop policy if exists "Allow select outreach_events" on public.outreach_events;
create policy "Allow select outreach_events"
    on public.outreach_events for select using (true);

drop policy if exists "Allow insert outreach_events" on public.outreach_events;
create policy "Allow insert outreach_events"
    on public.outreach_events for insert with check (true);

drop policy if exists "Allow update outreach_events" on public.outreach_events;
create policy "Allow update outreach_events"
    on public.outreach_events for update using (true);

-- allow the scanner to access attendance
drop policy if exists "Allow select outreach_attendance" on public.outreach_attendance;
create policy "Allow select outreach_attendance"
    on public.outreach_attendance for select using (true);

drop policy if exists "Allow insert outreach_attendance" on public.outreach_attendance;
create policy "Allow insert outreach_attendance"
    on public.outreach_attendance for insert with check (true);

drop policy if exists "Allow update outreach_attendance" on public.outreach_attendance;
create policy "Allow update outreach_attendance"
    on public.outreach_attendance for update using (true);
