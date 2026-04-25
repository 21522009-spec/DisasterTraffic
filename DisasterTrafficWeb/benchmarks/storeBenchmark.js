import { performance } from "perf_hooks";
import { ensureStore, getAll, addReport } from "../store.js";

async function runBenchmark() {
  await ensureStore();

  // Pre-populate with some data
  for (let i = 0; i < 50; i++) {
    await addReport({
      type: "benchmark",
      severity: 1,
      description: "benchmark report",
      lat: 0,
      lon: 0,
    });
  }

  const iterations = 1000;

  console.log(`Starting benchmark: ${iterations} iterations of getAll()`);

  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    await getAll();
  }

  const end = performance.now();

  const totalTime = end - start;
  const timePerIteration = totalTime / iterations;

  console.log(`Total time: ${totalTime.toFixed(2)} ms`);
  console.log(`Average time per getAll(): ${timePerIteration.toFixed(4)} ms`);
}

runBenchmark().catch(console.error);
