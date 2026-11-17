import { spawn } from "node:child_process";
import { appendFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function runCommand({
  binary = "opencode",
  args = ["github", "run"],
  env = process.env,
  timeout = 1800000,
  killAfter = 10000,
} = {}) {
  if (!env.OPENCODE_API_KEY) return { reason: "infra", modelInvoked: false };
  const childEnv = { ...env };
  for (const key of ["GITHUB_OUTPUT", "GITHUB_ENV", "GITHUB_STEP_SUMMARY"]) delete childEnv[key];
  const child = spawn(binary, args, {
    env: childEnv,
    detached: true,
    stdio: ["ignore", "inherit", "inherit"],
  });
  let reason;
  let modelInvoked = false;
  let force;
  const kill = (signal) => {
    if (child.pid) {
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
  };
  const stop = (why) => {
    reason ||= why;
    kill("SIGTERM");
    force ||= setTimeout(() => kill("SIGKILL"), killAfter);
  };
  const interrupt = () => stop("agent_failed");
  process.once("SIGTERM", interrupt);
  process.once("SIGINT", interrupt);
  const timer = setTimeout(() => stop("timeout"), timeout);
  try {
    const exitCode = await new Promise((accept) => {
      child.once("spawn", () => (modelInvoked = true));
      child.once("error", () => {
        reason = "infra";
        accept(null);
      });
      child.once("close", accept);
    });
    return {
      reason: reason || (exitCode === 0 ? "success" : "agent_failed"),
      modelInvoked,
      exitCode,
    };
  } finally {
    clearTimeout(timer);
    clearTimeout(force);
    process.removeListener("SIGTERM", interrupt);
    process.removeListener("SIGINT", interrupt);
    kill("SIGKILL");
  }
}

async function main() {
  const result = await runCommand();
  await writeFile(resolve(process.env.RUNNER_TEMP, "command-result.json"), JSON.stringify(result));
  await appendFile(
    process.env.GITHUB_OUTPUT,
    "reason=" + result.reason + "\nmodelInvoked=" + result.modelInvoked + "\n",
  );
  if (result.reason !== "success") process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
