# Todo List with AI

The base todo application used throughout the "integrating AI into an app" blog
series. This first cut is intentionally plain: no ORM, no auth, no optimistic
updates, no AI. Those arrive in later posts.

Search is deliberately dumb in the same way: a case-insensitive substring test
on the title, filtered in the browser over the list already on screen. It cannot
match "things for the party" to "buy ice", which is exactly the failure a later
post replaces with embeddings.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4
- Postgres (any 13+, with the `pgvector` extension available), queried with
  plain SQL via [`postgres`](https://github.com/porsager/postgres)
- Zod for request validation

That is the whole dependency list. There is no ORM and no migration runner — the
schema is a SQL file you run against your database.

Nothing here uses vectors yet. The requirement is listed now because you pick a
database once, in this post, but the embeddings post later in the series needs
`pgvector` — and it is not part of stock Postgres. Choosing an instance that
cannot install it means moving your data later. (`docker run postgres:17` is the
common trap; use `pgvector/pgvector:pg17` instead.)

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

Run [`migrations/001_init.sql`](migrations/001_init.sql) against it:

```sh
psql "$DATABASE_URL" -f migrations/001_init.sql
```

Or paste it into whatever SQL console your provider gives you.

### 4. Run

```sh
pnpm dev
```

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

| Method   | Path                    | Returns                     |
| -------- | ----------------------- | --------------------------- |
| `GET`    | `/api/todos`            | `200` — array, newest first |
| `POST`   | `/api/todos`            | `201` — created todo        |
| `DELETE` | `/api/todos/:id`        | `204` — no content          |
| `POST`   | `/api/todos/:id/toggle` | `200` — updated todo        |

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
```

## Layout

```
migrations/001_init.sql   the schema
src/db/index.ts           postgres client (hot-reload safe singleton)
src/db/types.ts           Todo row type, hand-written to match the SQL
src/lib/api-contract.ts   Zod schemas + the shape of the 400 they produce
src/app/api/todos/        route handlers
src/components/TodoApp.tsx
```

## Caveat

`src/db/types.ts` is hand-written. If you change a column in the SQL file,
change it there too — nothing enforces the match.
