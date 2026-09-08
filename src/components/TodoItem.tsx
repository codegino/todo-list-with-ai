'use client';

import type {Todo} from '@/lib/api-contract';

type TodoItemProps = {
  todo: Todo;
  onToggle: () => void;
  onDelete: () => void;
};

function TodoItem({todo, onToggle, onDelete}: TodoItemProps) {
  return (
    <li className="group flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-3 shadow-sm transition hover:border-neutral-300">
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={onToggle}
        aria-label={`Toggle ${todo.title}`}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-neutral-300 accent-neutral-900"
      />

      <p
        className={`min-w-0 flex-1 truncate text-sm ${
          todo.completed ? 'text-neutral-400 line-through' : 'text-neutral-900'
        }`}
      >
        {todo.title}
      </p>

      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${todo.title}`}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-neutral-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 focus:opacity-100"
      >
        Delete
      </button>
    </li>
  );
}

export default TodoItem;
