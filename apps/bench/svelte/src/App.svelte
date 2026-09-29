<script lang="ts">
  import { onMount } from "svelte";
  import TodoPage from "./Todo.svelte";
  import RowsPage from "./Rows.svelte";

  /** Deliberate hash switch instead of a router dependency — bench measures framework size. */
  let hash = $state(location.hash || "#/todo");
  onMount(() => {
    window.addEventListener("hashchange", () => (hash = location.hash || "#/todo"));
  });

  const isRows = $derived(hash.startsWith("#/rows"));
</script>

<nav class="bench-nav">
  <a href="#/todo" class={isRows ? "" : "active"}>Todo</a>
  <a href="#/rows" class={isRows ? "active" : ""}>Rows</a>
</nav>
<main>
  {#if isRows}
    <RowsPage />
  {:else}
    <TodoPage />
  {/if}
</main>