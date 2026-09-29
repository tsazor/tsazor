<script lang="ts">
  import { onMount } from "svelte";
  import { loadTodos, saveTodos, markBenchReady, type TodoItem } from "./bench-model";

  let todos = $state<TodoItem[]>([]);
  let filter = $state<"all" | "active" | "completed">("all");
  let editingId = $state<number>(-1);

  onMount(() => {
    todos = loadTodos();
    markBenchReady();
  });

  const visible = $derived(
    filter === "active"
      ? todos.filter((t) => !t.completed)
      : filter === "completed"
        ? todos.filter((t) => t.completed)
        : todos,
  );
  const leftCount = $derived(todos.filter((t) => !t.completed).length);
  const doneCount = $derived(todos.length - leftCount);
  const allCompleted = $derived(todos.length > 0 && doneCount === todos.length);

  const persist = (next: TodoItem[]) => {
    todos = next;
    saveTodos(next);
  };

  const newTodoKey = (e: KeyboardEvent) => {
    if (e.key !== "Enter") return;
    const input = e.currentTarget as HTMLInputElement;
    const title = input.value.trim();
    if (!title) return;
    persist([...todos, { id: Date.now() + Math.floor(Math.random() * 1000), title, completed: false }]);
    input.value = "";
  };

  const commitEdit = (todo: TodoItem, value: string) => {
    editingId = -1;
    const title = value.trim();
    if (title) persist(todos.map((t) => (t.id === todo.id ? { ...t, title } : t)));
    else persist(todos.filter((t) => t.id !== todo.id));
  };
</script>

<section class="todoapp">
  <h1>todos</h1>
  <input class="new-todo" placeholder="What needs to be done?" onkeydown={newTodoKey} />
  {#if todos.length > 0}
    <ul class="todo-list">
      {#each visible as todo (todo.id)}
        <li class={(todo.completed ? "completed " : "") + (editingId === todo.id ? "editing" : "")}>
          {#if editingId === todo.id}
            <input
              class="edit-todo"
              value={todo.title}
              onchange={(e) => commitEdit(todo, (e.currentTarget as HTMLInputElement).value)}
              onkeydown={(e) => {
                if (e.key === "Enter") commitEdit(todo, (e.currentTarget as HTMLInputElement).value);
                else if (e.key === "Escape") editingId = -1;
              }}
            />
          {:else}
            <input
              type="checkbox"
              checked={todo.completed}
              onchange={(e) => persist(todos.map((t) => (t.id === todo.id ? { ...t, completed: (e.currentTarget as HTMLInputElement).checked } : t)))}
            />
            <span class="todo-title" ondblclick={() => (editingId = todo.id)}>{todo.title}</span>
            <button class="destroy" onclick={() => persist(todos.filter((t) => t.id !== todo.id))}>x</button>
          {/if}
        </li>
      {/each}
    </ul>
    <div class="todo-footer">
      <input type="checkbox" checked={allCompleted} title="Toggle all"
             onchange={(e) => persist(todos.map((t) => ({ ...t, completed: (e.currentTarget as HTMLInputElement).checked })))} />
      <span class="todo-count">{leftCount} items left</span>
      <div class="todo-filter">
        <button class={filter === "all" ? "selected" : ""} onclick={() => (filter = "all")}>All</button>
        <button class={filter === "active" ? "selected" : ""} onclick={() => (filter = "active")}>Active</button>
        <button class={filter === "completed" ? "selected" : ""} onclick={() => (filter = "completed")}>Completed</button>
      </div>
      {#if doneCount > 0}
        <button class="clear-completed" onclick={() => persist(todos.filter((t) => !t.completed))}>Clear completed</button>
      {/if}
    </div>
  {/if}
</section>