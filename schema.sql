-- Hand Cricket Online: starter schema for Supabase
-- Run this in Supabase Dashboard -> SQL Editor.
-- This is a beginner-friendly prototype policy. Room codes act as invitations,
-- but this open policy is NOT suitable for a public production launch.

create table if not exists public.rooms (
  code text primary key check (code ~ '^[0-9]{6}$'),
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

drop policy if exists "Prototype: read rooms" on public.rooms;
drop policy if exists "Prototype: create rooms" on public.rooms;
drop policy if exists "Prototype: update rooms" on public.rooms;

create policy "Prototype: read rooms" on public.rooms
for select to anon using (true);

create policy "Prototype: create rooms" on public.rooms
for insert to anon with check (true);

create policy "Prototype: update rooms" on public.rooms
for update to anon using (true) with check (true);

alter publication supabase_realtime add table public.rooms;
