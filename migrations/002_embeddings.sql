-- Run this against your database, after 001_init.sql.

-- pgvector is not part of stock Postgres. On Supabase it is available but not
-- enabled until you ask for it.
create extension if not exists vector;

-- 1536 is the native output width of OpenAI's text-embedding-3-small.
--
-- Nullable on purpose. The column is added to a table that may already have
-- rows, and there is no sensible default vector to give them. It also matches
-- how POST /api/todos writes: the row is inserted first and the embedding is
-- filled in afterwards, so a todo is briefly (or, if OpenAI is down,
-- indefinitely) embedding-less. POST /api/todos/backfill fills the gaps.
alter table todos add column if not exists embedding vector(1536);

-- No index, deliberately.
--
-- At demo scale Postgres sequentially scans this column in well under a
-- millisecond and returns the *exact* nearest neighbours. Once you are into
-- the tens of thousands of rows, add:
--
--   create index on todos using hnsw (embedding vector_cosine_ops);
--
-- `vector_cosine_ops` is the opclass matching the `<=>` operator the search
-- query uses. Note that HNSW is an *approximate* index: it trades recall for
-- speed, so the top-20 it returns may not be the true top-20. That tradeoff is
-- worth measuring before you take it.
