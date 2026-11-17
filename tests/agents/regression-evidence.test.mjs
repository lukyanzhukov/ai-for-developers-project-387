import test from "node:test";
import assert from "node:assert/strict";
import { validateRequest, behaviorFailed } from "../../scripts/regression-evidence.mjs";

test("only full SHAs and one test path are accepted", () => {
  const input = {
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    testFile: "tests/upcoming-search.test.ts",
  };
  validateRequest(input);
  for (const testFile of [
    "../secrets",
    "tests/../app.test.ts",
    "tests/a.test.ts;echo x",
    "--help",
    "tests/a.test.ts tests/b.test.ts",
  ]) {
    assert.throws(() => validateRequest({ ...input, testFile }));
  }
  assert.throws(() => validateRequest({ ...input, headSha: "main" }));
});

test("red means an assertion failed, not a broken environment or timeout", () => {
  const failure =
    '<testsuite><testcase><failure message="expected 1 to be 0" type="AssertionError">trace</failure></testcase></testsuite>';
  assert.equal(behaviorFailed(1, failure), true);
  assert.equal(behaviorFailed(0, failure), false);
  assert.equal(behaviorFailed(127, failure), false);
  assert.equal(behaviorFailed(1, '<failure type="TimeoutError">browser missing</failure>'), false);
  assert.equal(behaviorFailed(1, `${failure}<error message="could not load"/>`), false);
  assert.equal(behaviorFailed(1, "No test files found"), false);
});

test(
  "runner proves both revisions without changing history; build errors stay failures",
  { timeout: 15000 },
  async () => {
    const { mkdtemp, mkdir, writeFile, chmod, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join, resolve } = await import("node:path");
    const { execFileSync, spawnSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const root = await mkdtemp(join(tmpdir(), "regression fixture "));
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
    const git = (...args) =>
      execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
        cwd: root,
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    try {
      git("init", "--quiet");
      git("config", "user.email", "fixture@example.test");
      git("config", "user.name", "Fixture");
      await writeFile(join(root, "feature.txt"), "base");
      git("add", "feature.txt");
      git("commit", "-qm", "base");
      const baseSha = git("rev-parse", "HEAD");
      await mkdir(join(root, "tests"));
      await writeFile(
        join(root, "tests", "regression.test.ts"),
        "// regression contract fixture\n",
      );
      await writeFile(join(root, "feature.txt"), "fixed");
      git("add", "feature.txt", "tests");
      git("commit", "-qm", "head");
      const headSha = git("rev-parse", "HEAD");
      await mkdir(join(root, "node_modules"));
      await mkdir(join(root, "bin"));
      const pnpm = join(root, "bin", "pnpm");
      await writeFile(
        pnpm,
        `#!/usr/bin/env node
const fs = require('node:fs');
const fixed = fs.readFileSync('feature.txt','utf8') === 'fixed';
if (process.argv[2] === 'run') process.exit(process.env.FIXTURE_BUILD_FAIL === 'yes' && !fixed ? 2 : 0);
const target = process.argv.find(x => x.startsWith('--outputFile=')).slice('--outputFile='.length);
fs.writeFileSync(target, '<testsuite><testcase>' + (fixed ? '' : '<failure type="AssertionError">expected clear</failure>') + '</testcase></testsuite>');
process.exit(fixed ? 0 : 1);
`,
      );
      await chmod(pnpm, 0o755);
      const output = join(root, "evidence");
      const input = {
        ...env,
        PATH: `${join(root, "bin")}:${env.PATH}`,
        BASE_SHA: baseSha,
        REVIEW_SHA: headSha,
        TEST_FILE: "tests/regression.test.ts",
        EVIDENCE_DIR: output,
      };
      const script = fileURLToPath(
        new URL("../../scripts/regression-evidence.mjs", import.meta.url),
      );
      const result = spawnSync(process.execPath, [script], {
        cwd: root,
        env: input,
        encoding: "utf8",
        timeout: 8000,
      });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      const report = JSON.parse(await readFile(join(output, "report.json"), "utf8"));
      assert.equal(report.status, "passed");
      assert.deepEqual(
        report.phases.map((p) => [p.sha, p.exitCode, p.passed]),
        [
          [baseSha, 1, true],
          [headSha, 0, true],
        ],
      );
      assert.equal(git("rev-parse", "HEAD"), headSha);
      assert.equal(git("worktree", "list", "--porcelain").split("worktree ").length - 1, 1);
      const broken = spawnSync(process.execPath, [script], {
        cwd: root,
        env: { ...input, FIXTURE_BUILD_FAIL: "yes", EVIDENCE_DIR: resolve(root, "broken") },
        encoding: "utf8",
        timeout: 8000,
      });
      assert.equal(broken.status, 1);
      const failure = JSON.parse(await readFile(join(root, "broken", "report.json"), "utf8"));
      assert.equal(failure.status, "failed");
      assert.match(failure.error, /build failed/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
