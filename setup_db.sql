-- Enable RLS (Row Level Security) is on by default in Supabase

-- 1. Create PROFILES table (extends default auth.users)
-- Drop if exists (careful!)
-- drop table if exists public.profiles cascade;
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  role text check (role in ('student', 'parent', 'admin')) default 'student',
  full_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;

-- Policies for Profiles
-- Users can read their own profile
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

-- Users can update their own profile
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Trigger to create profile on signup
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'student');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger check
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 2. Create LESSONS table
create table if not exists public.lessons (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  file_url text, -- URL to Supabase Storage
  transcript text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.lessons enable row level security;

-- Policies for Lessons
-- Admin (service_role) has full access by default (bypass RLS)
-- Students can view lessons assigned to them (via lesson_assignments)
-- NOTE: This policy depends on lesson_assignments table, which we create next.
-- create policy "Students can view assigned lessons" ... (will add later)

-- 3. Create LESSON_ASSIGNMENTS table
create table if not exists public.lesson_assignments (
  id uuid default gen_random_uuid() primary key,
  lesson_id uuid references public.lessons(id) not null,
  student_id uuid references public.profiles(id) not null,
  assigned_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(lesson_id, student_id)
);

alter table public.lesson_assignments enable row level security;

-- Policies for Assignments
drop policy if exists "Users can view their assignments" on public.lesson_assignments;
create policy "Users can view their assignments" on public.lesson_assignments
  for select using (auth.uid() = student_id);


-- Now add policy for lessons using the created assignments table
drop policy if exists "Students can view assigned lessons" on public.lessons;
create policy "Students can view assigned lessons" on public.lessons
  for select using (
    exists (
      select 1 from public.lesson_assignments 
      where lesson_assignments.lesson_id = lessons.id 
      and lesson_assignments.student_id = auth.uid()
    )
  );


-- 4. Create QUIZZES table
create table if not exists public.quizzes (
  id uuid default gen_random_uuid() primary key,
  lesson_id uuid references public.lessons(id) not null,
  questions_json jsonb not null, -- Storing questions as JSON for flexibility
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.quizzes enable row level security;

drop policy if exists "Students can view quizzes for their lessons" on public.quizzes;
create policy "Students can view quizzes for their lessons" on public.quizzes
  for select using (
    exists (
      select 1 from public.lesson_assignments
      where lesson_assignments.lesson_id = quizzes.lesson_id
      and lesson_assignments.student_id = auth.uid()
    )
  );


-- 5. Create QUIZ_RESULTS table
create table if not exists public.quiz_results (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  quiz_id uuid references public.quizzes(id) not null,
  score integer not null,
  max_score integer not null,
  details_json jsonb,
  completed_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.quiz_results enable row level security;

drop policy if exists "Users can view own results" on public.quiz_results;
create policy "Users can view own results" on public.quiz_results
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own results" on public.quiz_results;
create policy "Users can insert own results" on public.quiz_results
  for insert with check (auth.uid() = user_id);

-- 6. Storage Bucket setup (Optional SQL, usually manual)
insert into storage.buckets (id, name, public) 
values ('lessons', 'lessons', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public) 
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Storage Policies
-- Everyone can read public buckets (if public=true)
create policy "Public Access" 
on storage.objects for select 
using ( bucket_id in ('lessons', 'avatars') );

-- Only authenticated users can upload? Or service_role only?
-- Service_role bypasses RLS so we don't need policy for backend upload.
