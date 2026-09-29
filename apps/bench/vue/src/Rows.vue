<script setup lang="ts">
import { onMounted, ref } from "vue";
import { markBenchReady, type BenchRow } from "./bench-model";

const rows = ref<BenchRow[]>([]);
const selectedId = ref<number>(-1);

// ready marker: identical protocol across the 5 bench apps
onMounted(markBenchReady);

const rowClass = (row: BenchRow) => (row.id === selectedId.value ? "selected" : "");
// random 6-digit ids, but globally unique — duplicate keys break Svelte's
// keyed each and make "remove one row" ambiguous in id-keyed frameworks
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

const create10k = () => (rows.value = makeRows(10000));
const append1k = () => (rows.value = [...rows.value, ...makeRows(1000)]);
const updateEvery10th = () => (rows.value = rows.value.map((row, i) => (i % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row)));
const swapRows = () => (rows.value = [rows.value[1]!, rows.value[0]!, ...rows.value.slice(2)]);
const select = (row: BenchRow) => (selectedId.value = row.id);
const remove = (row: BenchRow) => (rows.value = rows.value.filter((r) => r.id !== row.id));
</script>

<template>
  <section class="rowsbench">
    <div class="rows-toolbar">
      <button @click="create10k">create 10,000 rows</button>
      <button @click="append1k">append 1,000 rows</button>
      <button @click="updateEvery10th">update every 10th row</button>
      <button @click="swapRows">swap rows</button>
    </div>
    <p class="rows-linecount" role="status" aria-live="polite">{{ rows.length }} lines</p>
    <table class="rows-table">
      <tbody>
        <tr v-for="row in rows" :key="row.id" :class="rowClass(row)">
          <td class="col-id">{{ row.id }}</td>
          <td class="col-title" @click="select(row)">{{ row.label }}</td>
          <td class="col-remove" @click="remove(row)"><span aria-hidden="true">x</span></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>