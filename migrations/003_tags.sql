-- Run this against your database, after 002_embeddings.sql.

-- The labels a decision model attached to the todo, e.g. {groceries,chores}.
--
-- Nullable on purpose, and the two "empty" values mean different things:
--
--   null  never classified: the row predates this column, or the model call
--         failed or timed out when the todo was created.
--   '{}'  classified, and no label passed the threshold ("Renew passport").
--
-- A real app would keep labels in their own table (id, name, description) with
-- a join table to todos, so they can be renamed, listed, and managed in the UI.
-- The demo has three fixed labels that live in code (src/lib/tags.ts), so a
-- text array is enough.
alter table todos add column if not exists tags text[];
