import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function validateRequest({ baseSha, headSha, testFile }) {
  if (!/^[a-f0-9]{40}$/.test(baseSha) || !/^[a-f0-9]{40}$/.test(headSha))
    throw new Error("Full base and head SHA are required");
  if (!/^tests\/[a-z0-9-]+\.test\.ts$/.test(testFile))
    throw new Error("Use one tests/<name>.test.ts file");
}

export function behaviorFailed(code, junit) {
  return (
    code === 1 &&
    /<testcase\b/.test(junit) &&
    /<failure\b[^>]*\btype="AssertionError"/.test(junit) &&
    !/<error\b/.test(junit)
  );
}

async function command(program, args, cwd, logPath, timeout = 180000) {
  const child = spawn(program, args, {
    cwd,
    env: process.env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chunks = [];
  let size = 0;
  let timedOut = false;
  const kill = (signal) => {
    if (child.pid) {
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
  };
  const cancel = () => kill("SIGTERM");
  process.once("SIGTERM", cancel);
  process.once("SIGINT", cancel);
  const timer = setTimeout(() => {
    timedOut = true;
    kill("SIGKILL");
  }, timeout);
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) {
        timedOut = true;
        kill("SIGKILL");
      } else chunks.push(chunk);
    });
  try {
    const code = await new Promise((accept, reject) => {
      child.once("error", reject);
      child.once("close", accept);
    });
    await writeFile(logPath, Buffer.concat(chunks));
    if (timedOut) throw new Error(`Command timed out or exceeded output limit: ${program}`);
    return code;
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGTERM", cancel);
    process.removeListener("SIGINT", cancel);
    kill("SIGKILL");
  }
}

async function main() {
  const request = {
    baseSha: process.env.BASE_SHA,
    headSha: process.env.REVIEW_SHA,
    testFile: process.env.TEST_FILE,
  };
  validateRequest(request);
  const root = process.cwd();
  const output = resolve(process.env.EVIDENCE_DIR || "artifacts/regression");
  await mkdir(output, { recursive: true });
  const report = {
    ...request,
    pr: process.env.PR_NUMBER || null,
    runUrl: process.env.RUN_URL || null,
    status: "failed",
    phases: [],
  };
  const scratch = await mkdtemp(join(tmpdir(), "calendar-regression-"));
  const base = join(scratch, "base");
  let added = false;
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    if (sha !== request.headSha) throw new Error("Checkout does not match the requested head");
    const source = execFileSync("git", ["show", `${request.headSha}:${request.testFile}`], {
      encoding: "utf8",
    });
    execFileSync("git", ["worktree", "add", "--detach", base, request.baseSha], { stdio: "pipe" });
    added = true;
    await mkdir(dirname(resolve(base, request.testFile)), { recursive: true });
    await writeFile(resolve(base, request.testFile), source);
    await symlink(resolve(root, "node_modules"), resolve(base, "node_modules"), "dir");
    for (const [name, cwd, expected] of [
      ["base", base, "assertion-failure"],
      ["head", root, "passed"],
    ]) {
      const buildCode = await command(
        "pnpm",
        ["run", "build"],
        cwd,
        resolve(output, `${name}-build.log`),
      );
      if (buildCode !== 0)
        throw new Error(`${name} build failed; this is not evidence of a behavior regression`);
      const junitPath = resolve(output, `${name}.xml`);
      const code = await command(
        "pnpm",
        [
          "exec",
          "vitest",
          "run",
          request.testFile,
          "--reporter=junit",
          `--outputFile=${junitPath}`,
        ],
        cwd,
        resolve(output, `${name}-tests.log`),
      );
      const junit = await readFile(junitPath, "utf8");
      const passed =
        name === "base"
          ? behaviorFailed(code, junit)
          : code === 0 && /<testcase\b/.test(junit) && !/<(?:failure|error)\b/.test(junit);
      report.phases.push({
        name,
        sha: name === "base" ? request.baseSha : request.headSha,
        expected,
        exitCode: code,
        passed,
      });
      if (!passed)
        throw new Error(
          `${name}: expected ${expected}, got exit ${code}; inspect the attached test log`,
        );
    }
    report.status = "passed";
  } catch (error) {
    report.error = error.message;
    process.exitCode = 1;
  } finally {
    try {
      if (added) execFileSync("git", ["worktree", "remove", "--force", base], { stdio: "pipe" });
      await rm(scratch, { recursive: true, force: true });
    } catch (error) {
      report.cleanupError = error.message;
      report.status = "failed";
      process.exitCode = 1;
    }
    await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
    await writeFile(
      resolve(output, "report.md"),
      [
        `# Regression check: ${report.status}`,
        `Base: \`${request.baseSha}\``,
        `Head: \`${request.headSha}\``,
        `Test: \`${request.testFile}\``,
        `PR: ${report.pr}`,
        `Run: ${report.runUrl}`,
        ...report.phases.map(
          (p) => `- ${p.name}: expected ${p.expected}; exit ${p.exitCode}; verified ${p.passed}`,
        ),
        ...(report.error ? [report.error] : []),
      ].join("\n\n"),
    );
    console.log(`Regression check ${report.status}; ${output}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
