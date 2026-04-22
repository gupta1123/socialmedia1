import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const serverPath = path.resolve(repoRoot, "services/socialpython/server.py");
const args = process.argv.slice(2);

const candidates = [
  path.resolve(repoRoot, "services/socialpython/.venv/bin/python"),
  "python3.11",
  "python3"
];

const interpreter = pickInterpreter(candidates);

if (!interpreter) {
  console.error(
    "Unable to start services/socialpython. Install Python 3.10+ or create services/socialpython/.venv."
  );
  process.exit(1);
}

const child = spawn(interpreter, [serverPath, ...args], {
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(`Failed to launch socialpython with ${interpreter}:`, error.message);
  process.exit(1);
});

function pickInterpreter(candidateList) {
  for (const candidate of candidateList) {
    const probe = spawnSync(
      candidate,
      [
        "-c",
        "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')"
      ],
      {
        encoding: "utf8"
      }
    );

    if (probe.error || probe.status !== 0) {
      continue;
    }

    const [majorText, minorText] = probe.stdout.trim().split(".");
    const major = Number(majorText);
    const minor = Number(minorText);

    if (major > 3 || (major === 3 && minor >= 10)) {
      return candidate;
    }
  }

  return null;
}
