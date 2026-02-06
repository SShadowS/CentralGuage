/**
 * Tests for report dataset management
 */

import {
  assertEquals,
  assertExists,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { join } from "@std/path";
import {
  datasetExists,
  getDatasetPath,
  getDatasetsDir,
  listDatasets,
  loadDataset,
  saveDataset,
  toAbsolutePaths,
  toRelativePaths,
  updateDataset,
} from "../../../../../cli/commands/report/dataset.ts";
import {
  cleanupTempDir,
  createTempDir,
} from "../../../../utils/test-helpers.ts";

Deno.test("getDatasetPath", async (t) => {
  await t.step("returns correct path for dataset", () => {
    const path = getDatasetPath("/results", "myreport");
    assertEquals(path, join("/results", "datasets", "myreport.yml"));
  });

  await t.step("handles dataset names with hyphens", () => {
    const path = getDatasetPath("/results", "my-report-2025");
    assertEquals(path, join("/results", "datasets", "my-report-2025.yml"));
  });
});

Deno.test("getDatasetsDir", async (t) => {
  await t.step("returns correct datasets directory", () => {
    const dir = getDatasetsDir("/results");
    assertEquals(dir, join("/results", "datasets"));
  });
});

Deno.test("toRelativePaths", async (t) => {
  await t.step("converts absolute paths to relative", () => {
    const resultsDir = "/home/user/results";
    const absolutePaths = [
      "/home/user/results/benchmark-2025.json",
      "/home/user/results/subdir/other.json",
    ];

    const relative = toRelativePaths(resultsDir, absolutePaths);

    assertEquals(relative[0], "benchmark-2025.json");
    assertEquals(relative[1], "subdir/other.json");
  });

  await t.step("normalizes Windows path separators to forward slashes", () => {
    // This simulates Windows paths that get joined
    const resultsDir = "C:\\Users\\test\\results";
    const absolutePaths = ["C:\\Users\\test\\results\\file.json"];

    const relative = toRelativePaths(resultsDir, absolutePaths);

    // Should use forward slashes for storage consistency
    assertEquals(relative[0], "file.json");
  });
});

Deno.test("toAbsolutePaths", async (t) => {
  await t.step("converts relative paths to absolute", () => {
    const resultsDir = "/home/user/results";
    const relativePaths = ["benchmark-2025.json", "subdir/other.json"];

    const absolute = toAbsolutePaths(resultsDir, relativePaths);

    assertEquals(absolute[0], join(resultsDir, "benchmark-2025.json"));
    assertEquals(absolute[1], join(resultsDir, "subdir", "other.json"));
  });
});

Deno.test("saveDataset and loadDataset", async (t) => {
  let tempDir: string;

  await t.step("setup", async () => {
    tempDir = await createTempDir("dataset-test");
  });

  await t.step("saves dataset with correct structure", async () => {
    const file1 = join(tempDir, "file1.json");
    const file2 = join(tempDir, "file2.json");
    const files = [file1, file2];

    // Create the files so they exist
    await Deno.writeTextFile(file1, "{}");
    await Deno.writeTextFile(file2, "{}");

    await saveDataset(tempDir, "test-dataset", files, "Test description");

    const datasetPath = getDatasetPath(tempDir, "test-dataset");
    const content = await Deno.readTextFile(datasetPath);

    assertStringIncludes(content, "name: test-dataset");
    assertStringIncludes(content, "description: Test description");
    assertStringIncludes(content, "file1.json");
    assertStringIncludes(content, "file2.json");
    assertStringIncludes(content, "created:");
    assertStringIncludes(content, "updated:");
  });

  await t.step("loadDataset returns correct structure", async () => {
    const result = await loadDataset(tempDir, "test-dataset");

    assertEquals(result.dataset.name, "test-dataset");
    assertEquals(result.dataset.description, "Test description");
    assertEquals(result.dataset.files.length, 2);
    assertEquals(result.missingFiles.length, 0);
    assertEquals(result.availableFiles.length, 2);
  });

  await t.step("loadDataset identifies missing files", async () => {
    // Delete one of the files
    await Deno.remove(join(tempDir, "file1.json"));

    const result = await loadDataset(tempDir, "test-dataset");

    assertEquals(result.missingFiles.length, 1);
    assertEquals(result.availableFiles.length, 1);
    const missingFile = result.missingFiles[0];
    assertExists(missingFile);
    assertStringIncludes(missingFile, "file1.json");
  });

  await t.step("loadDataset throws for non-existent dataset", async () => {
    await assertRejects(
      () => loadDataset(tempDir, "non-existent"),
      Error,
      "not found",
    );
  });

  await t.step("cleanup", async () => {
    await cleanupTempDir(tempDir);
  });
});

Deno.test("updateDataset", async (t) => {
  let tempDir: string;

  await t.step("setup", async () => {
    tempDir = await createTempDir("dataset-update-test");
  });

  await t.step("adds new files to existing dataset", async () => {
    // Create initial files
    const file1 = join(tempDir, "file1.json");
    const file2 = join(tempDir, "file2.json");
    const file3 = join(tempDir, "file3.json");

    await Deno.writeTextFile(file1, "{}");
    await Deno.writeTextFile(file2, "{}");
    await Deno.writeTextFile(file3, "{}");

    // Create initial dataset
    await saveDataset(tempDir, "update-test", [file1, file2]);

    // Update with new file
    const updated = await updateDataset(tempDir, "update-test", [file3]);

    assertEquals(updated.files.length, 3);
    assertExists(updated.updated);
  });

  await t.step("does not duplicate existing files", async () => {
    const file1 = join(tempDir, "file1.json");

    // Try to add file1 again (already in dataset)
    const updated = await updateDataset(tempDir, "update-test", [file1]);

    // Should still be 3 files
    assertEquals(updated.files.length, 3);
  });

  await t.step("cleanup", async () => {
    await cleanupTempDir(tempDir);
  });
});

Deno.test("listDatasets", async (t) => {
  let tempDir: string;

  await t.step("setup", async () => {
    tempDir = await createTempDir("dataset-list-test");
  });

  await t.step("returns empty array when no datasets exist", async () => {
    const datasets = await listDatasets(tempDir);
    assertEquals(datasets.length, 0);
  });

  await t.step("returns all datasets sorted by updated date", async () => {
    const file = join(tempDir, "test.json");
    await Deno.writeTextFile(file, "{}");

    // Create datasets with slight delay to ensure different timestamps
    await saveDataset(tempDir, "dataset-a", [file]);
    await new Promise((r) => setTimeout(r, 50));
    await saveDataset(tempDir, "dataset-b", [file]);
    await new Promise((r) => setTimeout(r, 50));
    await saveDataset(tempDir, "dataset-c", [file]);

    const datasets = await listDatasets(tempDir);

    assertEquals(datasets.length, 3);
    // Most recently updated should be first
    const d0 = datasets[0];
    const d1 = datasets[1];
    const d2 = datasets[2];
    assertExists(d0);
    assertExists(d1);
    assertExists(d2);
    assertEquals(d0.name, "dataset-c");
    assertEquals(d1.name, "dataset-b");
    assertEquals(d2.name, "dataset-a");
  });

  await t.step("cleanup", async () => {
    await cleanupTempDir(tempDir);
  });
});

Deno.test("datasetExists", async (t) => {
  let tempDir: string;

  await t.step("setup", async () => {
    tempDir = await createTempDir("dataset-exists-test");
  });

  await t.step("returns false for non-existent dataset", async () => {
    const exists = await datasetExists(tempDir, "non-existent");
    assertEquals(exists, false);
  });

  await t.step("returns true for existing dataset", async () => {
    const file = join(tempDir, "test.json");
    await Deno.writeTextFile(file, "{}");
    await saveDataset(tempDir, "exists-test", [file]);

    const exists = await datasetExists(tempDir, "exists-test");
    assertEquals(exists, true);
  });

  await t.step("cleanup", async () => {
    await cleanupTempDir(tempDir);
  });
});

Deno.test("dataset without description", async (t) => {
  let tempDir: string;

  await t.step("setup", async () => {
    tempDir = await createTempDir("dataset-no-desc-test");
  });

  await t.step("saves and loads dataset without description", async () => {
    const file = join(tempDir, "test.json");
    await Deno.writeTextFile(file, "{}");

    await saveDataset(tempDir, "no-desc", [file]);

    const result = await loadDataset(tempDir, "no-desc");
    assertEquals(result.dataset.description, undefined);
  });

  await t.step("cleanup", async () => {
    await cleanupTempDir(tempDir);
  });
});
