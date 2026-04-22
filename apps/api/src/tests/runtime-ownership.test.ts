import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../..");
const scriptPath = path.join(repoRoot, "scripts/ops/check-runtime-ownership.mjs");

describe("runtime ownership guard", () => {
  it("rejects active references to archived runtime trees", () => {
    const output = execFileSync("node", [scriptPath], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    expect(output).toContain("Runtime ownership check passed.");
  });
});
