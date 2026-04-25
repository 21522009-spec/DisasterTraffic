import { test, mock } from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import { addReport } from "../store.js";

test("addReport testing suite", async (t) => {
  // Clear mocks after each sub-test
  t.afterEach(() => {
    mock.restoreAll();
  });

  await t.test("Scenario 1: adding a report to a new/empty store (file missing)", async () => {
    const readFileMock = mock.method(fs, "readFile", () => {
      return Promise.reject(new Error("ENOENT"));
    });
    const writeFileMock = mock.method(fs, "writeFile", () => Promise.resolve());
    const renameMock = mock.method(fs, "rename", () => Promise.resolve());

    const reportData = {
      type: "fire",
      severity: 3,
      description: "Big fire",
      lat: 10,
      lon: 20,
    };

    const result = await addReport(reportData);

    assert.strictEqual(result.type, "fire");
    assert.strictEqual(result.severity, 3);
    assert.ok(result.id.startsWith("r_"));
    assert.ok(typeof result.time === "number");

    // Check if writeFile was called
    assert.strictEqual(writeFileMock.mock.callCount(), 1);
    const lastWrite = JSON.parse(writeFileMock.mock.calls[0].arguments[1]);
    assert.strictEqual(lastWrite.reports.length, 1);
    assert.strictEqual(lastWrite.reports[0].id, result.id);

    // Check if rename was called (part of writeAtomic)
    assert.strictEqual(renameMock.mock.callCount(), 1);
  });

  await t.test("Scenario 2: adding a report to a store with existing data", async () => {
    const existingReport = { id: "r_old", type: "flood", time: Date.now() - 10000 };
    const readFileMock = mock.method(fs, "readFile", async () => {
      return JSON.stringify({ reports: [existingReport] });
    });
    const writeFileMock = mock.method(fs, "writeFile", () => Promise.resolve());
    const renameMock = mock.method(fs, "rename", () => Promise.resolve());

    const result = await addReport({ type: "fire", severity: 1 });

    const lastWrite = JSON.parse(writeFileMock.mock.calls[0].arguments[1]);
    assert.strictEqual(lastWrite.reports.length, 2);
    assert.ok(lastWrite.reports.some(r => r.id === result.id));
    assert.ok(lastWrite.reports.some(r => r.id === "r_old"));
  });

  await t.test("Scenario 3: sorting logic", async () => {
    const now = Date.now();
    // We want to verify it sorts by time descending.
    // We'll mock readFile to return reports out of order.
    const r1 = { id: "r1", type: "oldest", time: now - 2000 };
    const r2 = { id: "r2", type: "newest", time: now };

    mock.method(fs, "readFile", async () => {
      // Return them in "wrong" order (oldest first)
      return JSON.stringify({ reports: [r1, r2] });
    });
    const writeFileMock = mock.method(fs, "writeFile", () => Promise.resolve());
    mock.method(fs, "rename", () => Promise.resolve());

    // Add a third report that's middle in time
    // We need to mock Date.now() to control the time of the new report
    const midTime = now - 1000;
    mock.method(Date, "now", () => midTime);

    await addReport({ type: "middle" });

    const lastWrite = JSON.parse(writeFileMock.mock.calls[0].arguments[1]);
    assert.strictEqual(lastWrite.reports.length, 3);

    // Should be sorted by time desc: r2 (now), middle (midTime), r1 (now - 2000)
    assert.strictEqual(lastWrite.reports[0].id, "r2");
    assert.strictEqual(lastWrite.reports[1].type, "middle");
    assert.strictEqual(lastWrite.reports[2].id, "r1");
  });

  await t.test("Scenario 4: capping logic", async () => {
    const existingReports = [];
    for (let i = 0; i < 2000; i++) {
      existingReports.push({ id: `r_${i}`, time: i });
    }

    mock.method(fs, "readFile", async () => {
      return JSON.stringify({ reports: existingReports });
    });
    const writeFileMock = mock.method(fs, "writeFile", () => Promise.resolve());
    mock.method(fs, "rename", () => Promise.resolve());

    // Mock Date.now to be very high so it's the newest
    mock.method(Date, "now", () => 999999);

    const result = await addReport({ type: "newest" });

    const lastWrite = JSON.parse(writeFileMock.mock.calls[0].arguments[1]);
    assert.strictEqual(lastWrite.reports.length, 2000);
    assert.strictEqual(lastWrite.reports[0].type, "newest");
    // The one with the smallest time (0) should be gone
    assert.ok(!lastWrite.reports.some(r => r.id === "r_0"));
    // The one with time 1 should still be there (it's at the end now)
    assert.ok(lastWrite.reports.some(r => r.id === "r_1"));
  });
});
