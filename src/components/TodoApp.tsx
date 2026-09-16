'use client';

import {useEffect, useState} from 'react';

import {searchResultListSchema, todoListSchema, type Todo} from '@/lib/api-contract';
import {readError} from '@/lib/read-error';

import TodoItem from './TodoItem';

type Mode = 'keyword' | 'ai';

/**
 * A committed AI search: the ids that matched, in rank order. Deliberately NOT
 * the todos themselves — `todos` below is the single source of truth for every
 * title and completed flag, and the rendered rows are derived from it. Storing
 * whole rows here would mean a toggle or a delete had to be applied in two
 * places, and one of them would eventually be forgotten.
 *
 * This works because GET /api/todos returns the entire table. If the list ever
 * paginates, a match could reference a todo that is not loaded, and this has to
 * become a real second list.
 *
 * The endpoint also returns a `similarity` score per result, which this drops.
 * It is worth looking at with curl when you are tuning the distance cutoff; it
 * is not worth putting on screen.
 */
type Matches = string[];

function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>('keyword');
  // What the user has typed but not yet submitted. Only `query` filters.
  const [draftQuery, setDraftQuery] = useState('');
  const [query, setQuery] = useState('');
  // null means "no AI search has been run", which is different from "ran and
  // found nothing" — that is an empty array.
  const [matches, setMatches] = useState<Matches | null>(null);
  const [searching, setSearching] = useState(false);

  /**
   * Deliberately naive: every change refetches the whole list. One obvious
   * loop, no cache to reason about. It also gives us something real to
   * improve later, once an AI call makes responses slow.
   */
  async function load() {
    const response = await fetch('/api/todos');

    if (!response.ok) {
      setError(await readError(response));
      setLoading(false);

      return;
    }

    setTodos(todoListSchema.parse(await response.json()));
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- state is set after an await, not synchronously
    void load();
  }, []);

  async function send(request: Promise<Response>) {
    const response = await request;

    if (!response.ok) {
      setError(await readError(response));

      return;
    }

    await load();
  }

  function clearSearch() {
    setQuery('');
    setDraftQuery('');
    setMatches(null);
  }

  async function addTodo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = title.trim();

    if (!trimmed) {
      return;
    }

    setTitle('');
    // A new todo that does not match the active search would silently vanish:
    // in keyword mode it fails the substring test, and in AI mode it is not in
    // `matches` at all. Dropping the search puts it back on screen.
    clearSearch();

    await send(
      fetch('/api/todos', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title: trimmed}),
      }),
    );
  }

  /**
   * One search, one embedding call. Searching as you type would mean an OpenAI
   * request every few keystrokes, plus debouncing and out-of-order response
   * handling — a different post. So both modes commit on submit, which also
   * keeps them comparable: same gesture, same query, different retrieval.
   */
  async function runAiSearch(trimmed: string) {
    setSearching(true);

    const response = await fetch(`/api/todos/search?q=${encodeURIComponent(trimmed)}`);

    if (!response.ok) {
      setError(await readError(response));
      setMatches(null);
      setSearching(false);

      return;
    }

    const results = searchResultListSchema.parse(await response.json());

    setMatches(results.map(result => result.id));
    setError(null);
    setSearching(false);
  }

  async function runSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = draftQuery.trim();

    setQuery(trimmed);

    if (mode === 'ai' && trimmed) {
      await runAiSearch(trimmed);
    } else {
      setMatches(null);
    }
  }

  /**
   * Switching modes re-runs the committed query immediately. That flip is the
   * whole point: "No todos match things for the party" becomes "buy ice 0.68"
   * without retyping, so nothing but the retrieval strategy has changed.
   *
   * Note this costs an embedding call every time you flip into AI mode, even
   * for a query you just ran. Caching the last query would fix it; the naive
   * version is easier to read.
   */
  async function switchMode(next: Mode) {
    setMode(next);

    if (!query) {
      return;
    }

    if (next === 'ai') {
      await runAiSearch(query);
    } else {
      setMatches(null);
    }
  }

  /**
   * Deliberately naive: a case-insensitive substring test on the title. It has
   * no idea that "party supplies" and "buy ice" are related, which is the
   * whole reason the AI mode exists.
   */
  const needle = query.toLowerCase();

  const keywordRows = needle
    ? todos.filter(todo => todo.title.toLowerCase().includes(needle))
    : todos;

  // Map the matched ids back over `todos`, preserving rank order. A todo that
  // was deleted since the search ran simply drops out here.
  const aiRows =
    matches?.map(id => todos.find(todo => todo.id === id)).filter(todo => todo !== undefined) ?? [];

  const rows = mode === 'ai' && matches ? aiRows : keywordRows;

  const searched = mode === 'ai' ? matches !== null : Boolean(query);

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <div className="mb-10 flex items-center justify-between gap-6">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Todos</h1>

        <form onSubmit={runSearch} className="flex gap-2">
          {/* The sparkle toggles AI mode: filled means the next search goes
              through embeddings, outlined means the naive substring filter.
              Styled like the other controls on purpose — it is a search
              option, not a new visual language. */}
          <button
            type="button"
            onClick={() => switchMode(mode === 'ai' ? 'keyword' : 'ai')}
            aria-pressed={mode === 'ai'}
            aria-label={mode === 'ai' ? 'Switch to keyword search' : 'Switch to AI search'}
            title={mode === 'ai' ? 'AI search: matches by meaning' : 'Keyword search: exact text'}
            className={`flex shrink-0 items-center rounded-lg border px-2.5 py-2 text-sm shadow-sm transition ${
              mode === 'ai'
                ? 'border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800'
                : 'border-neutral-300 bg-white text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
              <path d="M12 2.5l1.6 4.6 4.6 1.6-4.6 1.6L12 15l-1.6-4.7-4.6-1.6 4.6-1.6L12 2.5z" />
              <path d="M18.5 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" />
            </svg>
          </button>

          <input
            type="search"
            value={draftQuery}
            onChange={event => setDraftQuery(event.target.value)}
            placeholder="Search todos"
            aria-label="Search todos"
            className="w-60 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
          />

          <button
            type="submit"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50"
          >
            Search
          </button>
        </form>
      </div>

      <form onSubmit={addTodo} className="mb-6 flex gap-2">
        <input
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder="What needs doing?"
          aria-label="Todo title"
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
        />
        <button
          type="submit"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-40"
          disabled={!title.trim()}
        >
          Add
        </button>
      </form>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      {loading || searching ? (
        <p className="text-sm text-neutral-500">{searching ? 'Searching…' : 'Loading…'}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center text-sm text-neutral-500">
          {!searched
            ? 'Nothing here yet. Add your first todo above.'
            : mode === 'ai'
              ? `Nothing close enough to "${query}".`
              : `No todos match "${query}".`}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map(todo => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={() => send(fetch(`/api/todos/${todo.id}/toggle`, {method: 'POST'}))}
              onDelete={() => send(fetch(`/api/todos/${todo.id}`, {method: 'DELETE'}))}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

export default TodoApp;
