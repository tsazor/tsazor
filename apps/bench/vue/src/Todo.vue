<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { loadTodos, saveTodos, markBenchReady, type TodoItem } from "./bench-model";

const todos = ref<TodoItem[]>([]);
const filter = ref<"all" | "active" | "completed">("all");
const editingId = ref<number>(-1);

// ready marker: after the initial state resolved (first view renders this tick)
onMounted(() => {
  todos.value = loadTodos();
  markBenchReady();
});

const visible = computed(() =>
  filter.value === "active"
    ? todos.value.filter((t) => !t.completed)
    : filter.value === "completed"
      ? todos.value.filter((t) => t.completed)
      : todos.value,
);
const leftCount = computed(() => todos.value.filter((t) => !t.completed).length);
const doneCount = computed(() => todos.value.length - leftCount.value);
const allCompleted = computed(() => todos.value.length > 0 && doneCount.value === todos.value.length);

const persist = (next: TodoItem[]) => {
  todos.value = next;
  saveTodos(next);
};

const newTodoKey = (e: KeyboardEvent) => {
  if (e.key !== "Enter") return;
  const input = e.target as HTMLInputElement;
  const title = input.value.trim();
  if (!title) return;
  persist([...todos.value, { id: Date.now() + Math.floor(Math.random() * 1000), title, completed: false }]);
  input.value = "";
};

const toggle = (e: Event, todo: TodoItem) =>
  persist(todos.value.map((t) => (t.id === todo.id ? { ...t, completed: (e.target as HTMLInputElement).checked } : t)));

const toggleAll = (e: Event) => {
  const completed = (e.target as HTMLInputElement).checked;
  persist(todos.value.map((t) => ({ ...t, completed })));
};

const commitEdit = (todo: TodoItem, value: string) => {
  editingId.value = -1;
  const title = value.trim();
  if (title) persist(todos.value.map((t) => (t.id === todo.id ? { ...t, title } : t)));
  else persist(todos.value.filter((t) => t.id !== todo.id));
};

const saveEdit = (e: Event, todo: TodoItem) => commitEdit(todo, (e.target as HTMLInputElement).value);
const editKey = (e: KeyboardEvent, todo: TodoItem) => {
  if (e.key === "Enter") commitEdit(todo, (e.target as HTMLInputElement).value);
  else if (e.key === "Escape") editingId.value = -1;
};
</script>

<template>
  <section class="todoapp">
    <h1>todos</h1>
    <input class="new-todo" placeholder="What needs to be done?" @keydown="newTodoKey" />
    <template v-if="todos.length > 0">
      <ul class="todo-list">
        <li
          v-for="todo in visible"
          :key="todo.id"
          :class="(todo.completed ? 'completed ' : '') + (editingId === todo.id ? 'editing' : '')"
        >
          <input
            v-if="editingId === todo.id"
            class="edit-todo"
            :value="todo.title"
            @change="saveEdit($event, todo)"
            @keydown="editKey($event, todo)"
          />
          <template v-else>
            <input type="checkbox" :checked="todo.completed" @change="toggle($event, todo)" />
            <span class="todo-title" @dblclick="editingId = todo.id">{{ todo.title }}</span>
            <button class="destroy" @click="persist(todos.filter((t) => t.id !== todo.id))">x</button>
          </template>
        </li>
      </ul>
      <div class="todo-footer">
        <input type="checkbox" :checked="allCompleted" title="Toggle all" @change="toggleAll" />
        <span class="todo-count">{{ leftCount }} items left</span>
        <div class="todo-filter">
          <button :class="filter === 'all' ? 'selected' : ''" @click="filter = 'all'">All</button>
          <button :class="filter === 'active' ? 'selected' : ''" @click="filter = 'active'">Active</button>
          <button :class="filter === 'completed' ? 'selected' : ''" @click="filter = 'completed'">Completed</button>
        </div>
        <button v-if="doneCount > 0" class="clear-completed" @click="persist(todos.filter((t) => !t.completed))">
          Clear completed
        </button>
      </div>
    </template>
  </section>
</template>