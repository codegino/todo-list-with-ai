'use client';

import {useEffect, useState} from 'react';

import {todoListSchema, type Todo} from '@/lib/api-contract';

import TodoItem from './TodoItem';

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Something went wrong';
}

function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  async function addTodo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = title.trim();

    if (!trimmed) {
      return;
    }

    setTitle('');

    await send(
      fetch('/api/todos', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title: trimmed}),
      }),
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
        Todos
      </h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">
        {todos.filter(todo => !todo.completed).length} remaining
      </p>

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

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : todos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center text-sm text-neutral-500">
          Nothing here yet. Add your first todo above.
        </p>
      ) : (
        <ul className="space-y-2">
          {todos.map(todo => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={() =>
                send(fetch(`/api/todos/${todo.id}/toggle`, {method: 'POST'}))
              }
              onDelete={() =>
                send(fetch(`/api/todos/${todo.id}`, {method: 'DELETE'}))
              }
            />
          ))}
        </ul>
      )}
    </main>
  );
}

export default TodoApp;
