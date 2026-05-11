import { spawn } from "node:child_process";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("run-pnpm requires pnpm arguments.");
  process.exit(1);
}

const packageManager = "pnpm@10.6.5";

const candidates = [
  { command: "pnpm", args },
  { command: "corepack", args: ["pnpm", ...args] },
  { command: "npx", args: ["-y", packageManager, ...args] }
];

runCandidate(0);

function runCandidate(index) {
  const candidate = candidates[index];

  if (!candidate) {
    console.error(
      "Unable to run pnpm. Install pnpm globally, enable corepack, or allow npm/npx to fetch pnpm on first run."
    );
    process.exit(1);
  }

  const spawnOptions = {
    stdio: "inherit",
    env: process.env
  };
  const child =
    process.platform === "win32"
      ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", commandLineForCmd(candidate)], spawnOptions)
      : spawn(candidate.command, candidate.args, spawnOptions);

  child.on("error", (error) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      runCandidate(index + 1);
      return;
    }

    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    if (process.platform === "win32" && code === 9009) {
      runCandidate(index + 1);
      return;
    }

    process.exit(code ?? 1);
  });
}

function commandLineForCmd(candidate) {
  return [candidate.command, ...candidate.args].map(quoteCmdArg).join(" ");
}

function quoteCmdArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_@%+=:,./\\-]+$/.test(text)) {
    return text;
  }

  return `"${text.replace(/(["^&|<>])/g, "^$1")}"`;
}
