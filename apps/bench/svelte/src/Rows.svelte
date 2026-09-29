<script lang="ts">
  import { onMount } from "svelte";
  import { markBenchReady, type BenchRow } from "./bench-model";

  let rows = $state<BenchRow[]>([]);
  let selectedId = $state<number>(-1);

  onMount(markBenchReady);

  const rowClass = (row: BenchRow) => (row.id === selectedId ? "selected" : "");
  // random 6-digit ids, but globally unique — Svelte's keyed each crashes on
  // duplicate keys, and random ids collide statistically at 10k rows
  const usedIds = new Set<number>();
  const makeRows = (count: number): BenchRow[] => {
    const made: BenchRow[] = [];
    for (let i = 0; i < count; i++) {
      let id: number;
      do {
        id = 100000 + Math.floor(Math.random() * 900000);
      } while (usedIds.has(id));
      usedIds.add(id);
      made.push({ id, label: `item #${id}` });
    }
    return made;
  };

  const create10k = () => (rows = makeRows(10000));
  const append1k = () => (rows = [...rows, ...makeRows(1000)]);
  const updateEvery10th = () => (rows = rows.map((row, i) => (i % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row)));
  const swapRows = () => (rows = [rows[1]!, rows[0]!, ...rows.slice(2)]);
</script>

<section class="rowsbench">
  <div class="rows-toolbar">
    <button onclick={create10k}>create 10,000 rows</button>
    <button onclick={append1k}>append 1,000 rows</button>
    <button onclick={updateEvery10th}>update every 10th row</button>
    <button onclick={swapRows}>swap rows</button>
  </div>
  <p class="rows-linecount" role="status" aria-live="polite">{rows.length} lines</p>
  <table class="rows-table">
    <tbody>
      {#each rows as row (row.id)}
        <tr class={row.id === selectedId ? "selected" : ""}>
          <td class="col-id">{row.id}</td>
          <td class="col-title" onclick={() => (selectedId = row.id)}>{row.label}</td>
          <td class="col-remove" onclick={() => (rows = rows.filter((r) => r.id !== row.id))}>
            <span aria-hidden="true">x</span>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>