import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const trackedFiles = execFileSync("git", ["ls-files"], {
  cwd: repoRoot,
  encoding: "utf8"
})
  .split("\n")
  .map((value) => value.trim())
  .filter(Boolean);

const forbiddenPatterns = [
  "local-playgrounds/agno-prompt-lab",
  "apps/api/agents",
  "skills/prompt/v1",
  "skills/prompt/v2",
  "skills/image-edit/v1",
  "AI_EDIT_DIRECTOR_",
  "AI_EDIT_FLOW",
  "/api/image-edit-plan",
  "/api/creative/image-edit-plan",
  "/api/creative/image-segment"
];

const allowedPrefixes = ["archive/legacy/"];
const allowedFiles = new Set([
  "docs/archive-inventory.md",
  "docs/runtime-map.md",
  "scripts/ops/check-runtime-ownership.mjs",
  "services/socialpython/.env.example"
]);

const violations = [];

for (const relativePath of trackedFiles) {
  if (allowedFiles.has(relativePath) || allowedPrefixes.some((prefix) => relativePath.startsWith(prefix))) {
    continue;
  }

  let content;
  try {
    content = readFileSync(path.join(repoRoot, relativePath), "utf8");
  } catch {
    continue;
  }

  for (const pattern of forbiddenPatterns) {
    if (!content.includes(pattern)) {
      continue;
    }

    violations.push({ file: relativePath, pattern });
  }
}

if (violations.length > 0) {
  console.error("Runtime ownership check failed.\n");
  for (const violation of violations) {
    console.error(`- ${violation.file}: contains "${violation.pattern}"`);
  }
  process.exit(1);
}

console.log("Runtime ownership check passed.");
