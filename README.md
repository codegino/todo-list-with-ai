# Todo List with AI

The base todo application used throughout the "integrating AI into an app" blog
series. This first cut is intentionally plain: no ORM, no auth, no optimistic
updates, no AI. Those arrive in later posts.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4
- Postgres (any 13+, with the `pgvector` extension available), queried with
  plain SQL via [`postgres`](https://github.com/porsager/postgres)
- Zod for request validation
- OpenAI embeddings, called with plain `fetch` — no SDK

That is the whole dependency list. There is no ORM and no migration runner — the
schema is a set of SQL files you run against your database.

Nothing here uses vectors yet. The requirement is listed now because you pick a
database once, in this post, but the embeddings post later in the series needs
`pgvector` — and it is not part of stock Postgres. Choosing an instance that
Nothing here uses vectors yet. The requirement is listed now because you pick a
database once, in this post, but the embeddings post later in the series needs
`pgvector` — and it is not part of stock Postgres. Choosing an instance that
cannot install it means moving your data later. (`docker run postgres:17` is the
common trap; use `pgvector/pgvector:pg17` instead.)

That post is now here:
[`migrations/002_embeddings.sql`](migrations/002_embeddings.sql) enables
`pgvector` and adds the vector column.

## Setup

### 1. Install

```sh
pnpm install
cp .env.example .env
```

### 2. Point `DATABASE_URL` at a database

Any Postgres 13+ with `pgvector` available. See
[Using Supabase](#using-supabase-what-i-use) for the exact steps on the setup
this series is written against.

### 3. Create the table

Run the migrations in order:

```sh
psql "$DATABASE_URL" -f migrations/001_init.sql
psql "$DATABASE_URL" -f migrations/002_embeddings.sql
```

Or paste them into whatever SQL console your provider gives you.

### 4. Run

```sh
pnpm dev
```

### 5. Backfill embeddings for todos you already had

`002` adds the `embedding` column to a table that may already have rows. Those
todos have no embedding, so **they will not show up in AI search** until you
fill them in:

```sh
curl -X POST localhost:3000/api/todos/backfill
# {"embedded":7}
```

It does up to 100 at a time, so run it again if you had more. Skip this if your
table was empty — though you will want it again the first time you change
models. See [Backfilling and re-embedding](#backfilling-and-re-embedding).

## Using Supabase (what I use)

Every post in this series was written against Supabase, so this is the only path
that is actually tested. Two reasons for it: the free tier is enough for the
whole series, and `pgvector` is already available there — no extension wrangling
when the embeddings post arrives.

You do not need any of this if you are bringing your own Postgres. Skip to the
API section.

**Connection string.** Supabase → Project Settings → Database → Connection
string. Use a pooler host (`aws-N-<region>.pooler.supabase.com`), not the direct
`db.<ref>` one — the direct host is IPv6-only and fails on most networks. Either
pooler port works; `src/db/index.ts` sets `prepare: false`, which is what the
transaction pooler needs.

**Creating the table.** Open the Supabase SQL editor, paste the contents of
`migrations/001_init.sql`, and run it.

**Security.** Tables in the `public` schema are exposed through Supabase's
auto-generated REST API. Row Level Security is off by default, so this table is
readable and writable by anyone holding your anon key. Fine for a demo, not for
anything real.

## API

| Method   | Path                    | Returns                        |
| -------- | ----------------------- | ------------------------------ |
| `GET`    | `/api/todos`            | `200` — array, newest first    |
| `POST`   | `/api/todos`            | `201` — created todo           |
| `DELETE` | `/api/todos/:id`        | `204` — no content             |
| `POST`   | `/api/todos/:id/toggle` | `200` — updated todo           |
| `GET`    | `/api/todos/search?q=`  | `200` — matches, closest first |
| `POST`   | `/api/todos/backfill`   | `200` — `{embedded}`           |

Note that the list and the search endpoints are deliberately separate, and
return different shapes. A search result is a todo plus a `similarity` between 0
and 1. Neither endpoint ever returns the `embedding` column.

Errors are `{ "error": "message" }`. Validation failures are `400` with an extra
`details` field mapping each field to its messages — machine-readable on
purpose, so a future LLM caller can be handed a structured reason and retry. A
body that is not valid JSON is a different `400` (`"Malformed JSON body"`) with
no `details`, so a caller can tell "your syntax is broken" from "your fields are
wrong" — the two need different retries.

```sh
curl -X POST localhost:3000/api/todos \
  -H 'Content-Type: application/json' \
  -d '{"title":"Write post one"}'

curl 'localhost:3000/api/todos/search?q=groceries'
```

## How the AI search works

Three moving parts:

1. **On create.** `POST /api/todos` inserts the row and returns `201`
   immediately, then embeds the title in an `after()` callback and writes the
   vector back. The OpenAI call is _not_ on the critical path — creating a todo
   is the core feature, embedding it is not.
2. **On search.** `GET /api/todos/search?q=` embeds your query, then asks
   Postgres for the nearest todos by cosine distance (`<=>`), cut off at 0.6
   distance and capped at 20 results. Every result carries its similarity score.
3. **Backfill.** `POST /api/todos/backfill` embeds up to 100 todos that have no
   vector yet, in a single batched API call. See
   [Backfilling and re-embedding](#backfilling-and-re-embedding).

The model is `text-embedding-3-small` at its native 1536 dimensions
(`src/lib/embeddings.ts`), which is why the column is `vector(1536)`. Change one
and you must change the other; Postgres will reject the mismatch at write time.

## Backfilling and re-embedding

Nobody adds vector search to an empty database. `002` adds a column to a table
that already has rows, and **those rows have no embedding, so they never appear
in search** — which looks exactly like the feature being broken. Wiring up
writes only covers todos created from now on; something has to cover the rest.

That is what `POST /api/todos/backfill` is for. It selects todos `where
embedding is null`, embeds up to 100 of them in one batched request, and writes
the vectors back. Run it again if you have more than 100.

The same endpoint is your answer to a second problem, and this is the one worth
remembering: **an embedding is derived data.** It is a function of the title
_and_ the model that produced it. Switch to `text-embedding-3-large`, shorten
the output to 512 dimensions, or move to another provider, and every vector in
the table is stale — they are no longer comparable to the vectors your new
queries produce. Rebuilding is not optional, and it is the same code path with
one word changed:

```sql
-- backfill: only the rows that are missing one
where embedding is null

-- re-embed: all of them, after a model change
where true
```

(A model change also means a new migration, since the column width is part of
the schema.) A rebuild path is not a nicety you add later; it is part of
shipping derived data at all.

It is a distant third, but the endpoint also recovers todos whose embedding
call failed at write time — see the caveats below.

## Layout

```
migrations/001_init.sql        the schema
migrations/002_embeddings.sql  pgvector + the embedding column
src/db/index.ts                postgres client (hot-reload safe singleton)
src/db/types.ts                row types, hand-written to match the SQL
src/lib/api-contract.ts        Zod schemas + the shape of the 400 they produce
src/lib/embeddings.ts          the OpenAI call, and the pgvector cast helper
src/app/api/todos/             route handlers
src/components/TodoApp.tsx     the whole UI: list, add, and both searches
```

## The UI

One page, with the search box next to the title. A sparkle button to the left of
the box switches between two modes:

- **Dim — keyword.** The original naive search: a case-insensitive substring
  test on the title, filtered in the browser over the list already on screen. It
  cannot match "things for the party" to "buy ice".
- **Lit — AI.** `GET /api/todos/search?q=`, which matches by meaning. The field
  turns violet so it is obvious which one is armed.

The search endpoint returns a similarity score per result, but the UI does not
show it. Read it with curl when you are tuning the distance cutoff.

Both commit on submit rather than searching as you type, so the two are directly
comparable — and so AI mode is one embedding call per search, not one per
keystroke. Clicking the sparkle re-runs the query you already submitted, which
is the fastest way to see the difference: search for "things for the party" in
keyword mode, get nothing, click the sparkle, get "buy ice".

Results are ordinary todo rows in both modes — you can tick them off and delete
them from a result list. Adding a todo clears the search, since a new todo that
did not match would otherwise silently vanish.

## Caveats

`src/db/types.ts` is hand-written. If you change a column in the SQL file,
change it there too — nothing enforces the match.

**Embedding failures are silent.** If OpenAI is unreachable when you add a todo,
the todo is still created — it just has no embedding and never appears in AI
search. Nothing tells you. `after()` is best-effort: no retries, no queue, and
if the process dies mid-callback the work is lost without a trace. Re-running
the backfill is the only recovery, and you have to remember to. A real app would
insert an outbox row in the same transaction and let a worker with retries and a
dead-letter queue do the embedding.

**The backfill endpoint is unauthenticated**, like everything else here. It is a
write endpoint that spends OpenAI credits on demand. Same caveat as the RLS one
above: fine for a demo, not for anything real.

**0.6 is a magic number.** The distance cutoff in the search route was picked by
eye. It depends on your data — short todo titles behave differently from
paragraphs. The similarity scores are in the response precisely so you can see
where the useful results stop and retune it.

**There is no index on the vector column**, so search is an exact sequential
scan. Correct and fast at this size, and it stops mattering somewhere in the
tens of thousands of rows — see the comment in `002_embeddings.sql`.

**Titles are never re-embedded**, because there is no way to edit a title. Add
one and you will need to re-embed on update, or the vector silently describes
the old text.
