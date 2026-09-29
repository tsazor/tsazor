import { useEffect, useMemo, useState } from "react";
import { loadTodos, saveTodos, markBenchReady, type TodoItem } from "./bench-model";

type Filter = "all" | "active" | "completed";

export function TodoPage() {
  const [todos, setTodos] = useState<TodoItem[]>(loadTodos);
  const [filter, setFilter] = useState<Filter>("all");
  const [editingId, setEditingId] = useState<number>(-1);

  // ready marker: after the initial state resolved and first view rendered
  useEffect(markBenchReady, []);

  const visible = useMemo(
    () =>
      filter === "active"
        ? todos.filter((t) => !t.completed)
        : filter === "completed"
          ? todos.filter((t) => t.completed)
          : todos,
    [todos, filter],
  );
  const leftCount = todos.filter((t) => !t.completed).length;
  const doneCount = todos.length - leftCount;
  const allCompleted = todos.length > 0 && doneCount === todos.length;

  const persist = (next: TodoItem[]) => {
    setTodos(next);
    saveTodos(next);
  };

  const newTodoKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const title = e.currentTarget.value.trim();
    if (!title) return;
    persist([...todos, { id: Date.now() + Math.floor(Math.random() * 1000), title, completed: false }]);
    e.currentTarget.value = "";
  };

  const commitEdit = (todo: TodoItem, value: string) => {
    setEditingId(-1);
    const title = value.trim();
    if (title) persist(todos.map((t) => (t.id === todo.id ? { ...t, title } : t)));
    else persist(todos.filter((t) => t.id !== todo.id));
  };

  return (
    <section className="todoapp">
      <h1>todos</h1>
      <input className="new-todo" placeholder="What needs to be done?" onKeyDown={newTodoKey} />
      {todos.length > 0 && (
        <>
          <ul className="todo-list">
            {visible.map((todo) => (
              <li
                key={todo.id}
                className={(todo.completed ? "completed " : "") + (editingId === todo.id ? "editing" : "")}
              >
                {editingId === todo.id ? (
                  <input
                    className="edit-todo"
                    defaultValue={todo.title}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit(todo, e.currentTarget.value);
                      else if (e.key === "Escape") setEditingId(-1);
                    }}
                    onBlur={(e) => commitEdit(todo, e.currentTarget.value)}
                  />
                ) : (
                  <>
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={(e) => persist(todos.map((t) => (t.id === todo.id ? { ...t, completed: e.currentTarget.checked } : t)))}
                    />
                    <span className="todo-title" onDoubleClick={() => setEditingId(todo.id)}>
                      {todo.title}
                    </span>
                    <button className="destroy" onClick={() => persist(todos.filter((t) => t.id !== todo.id))}>
                      x
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="todo-footer">
            <input
              type="checkbox"
              checked={allCompleted}
              onChange={(e) => persist(todos.map((t) => ({ ...t, completed: e.currentTarget.checked })))}
              title="Toggle all"
            />
            <span className="todo-count">{leftCount} items left</span>
            <div className="todo-filter">
              <button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>All</button>
              <button className={filter === "active" ? "selected" : ""} onClick={() => setFilter("active")}>Active</button>
              <button className={filter === "completed" ? "selected" : ""} onClick={() => setFilter("completed")}>Completed</button>
            </div>
            {doneCount > 0 && (
              <button className="clear-completed" onClick={() => persist(todos.filter((t) => !t.completed))}>
                Clear completed
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}