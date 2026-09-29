<script setup lang="ts">
import { onMounted, ref } from "vue";
import TodoPage from "./Todo.vue";
import RowsPage from "./Rows.vue";

/** Deliberate hash switch instead of a router dependency — bench measures framework size. */
const hash = ref(location.hash || "#/todo");
onMounted(() => {
  window.addEventListener("hashchange", () => (hash.value = location.hash || "#/todo"));
});
</script>

<template>
  <nav class="bench-nav">
    <a href="#/todo" :class="hash.startsWith('#/rows') ? '' : 'active'">Todo</a>
    <a href="#/rows" :class="hash.startsWith('#/rows') ? 'active' : ''">Rows</a>
  </nav>
  <main>
    <RowsPage v-if="hash.startsWith('#/rows')" />
    <TodoPage v-else />
  </main>
</template>