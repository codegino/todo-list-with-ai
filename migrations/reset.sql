-- WARNING: deletes every todo.
--
-- The alternative to running 001, 002, and 003 in order: drop everything and
-- create the final schema in one go. Use it for a fresh database, or to reset
-- the demo. If you already have todos you want to keep, run the numbered
-- migrations instead.

drop table if exists todos;

create extension if not exists vector;

create table todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),

  -- 002: 1536 is the native output width of text-embedding-3-small. Nullable,
  -- because the embedding is written after the row (see POST /api/todos).
  embedding vector(1536),

  -- 003: labels from the decision model. null = never classified,
  -- '{}' = classified and nothing passed the threshold.
  tags text[]
);
