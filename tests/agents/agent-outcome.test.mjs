import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { outcome, publishOutcome } from "../../scripts/agent-outcome.cjs";
import { runCommand } from "../../scripts/command-runner.mjs";
import { reviewFailureReason } from "../../scripts/review-runner.mjs";

const healthy = {
  budgetOutcome: "success",
  installOutcome: "success",
  modelOutcome: "success",
  jobResult: "success",
};
test("result classification never reports a failed job as successful", () => {
  assert.equal(outcome({ ...healthy, reason: "success" }).reason, "success");
  for (const reason of ["limit_exhausted", "timeout", "infra", "agent_failed"])
    assert.deepEqual(
      [outcome({ ...healthy, reason }).reason, outcome({ ...healthy, reason }).status],
      [reason, "нужен человек"],
    );
  assert.equal(outcome({ ...healthy, installOutcome: "failure" }).reason, "infra");
  assert.equal(
    outcome({ ...healthy, reason: "success", jobResult: "failure" }).reason,
    "agent_failed",
  );
  assert.equal(outcome({ ...healthy, jobResult: "cancelled" }).reason, "agent_failed");
  assert.equal(
    outcome({ ...healthy, modelOutcome: "failure", jobResult: "failure" }).reason,
    "agent_failed",
  );
  assert.equal(reviewFailureReason(new Error("Reviewer timed out")), "timeout");
  assert.equal(
    reviewFailureReason(Object.assign(new Error("missing executable"), { code: "ENOENT" })),
    "infra",
  );
  assert.equal(
    reviewFailureReason(new Error("Reviewer did not complete a final response")),
    "agent_failed",
  );
});

test("independent reporter saves reason, full SHA, status and logs without a model", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agent-outcome-"));
  const comments = [];
  const sha = "a".repeat(40);
  const github = {
    rest: {
      pulls: { get: async () => ({ data: { head: { sha } } }) },
      issues: { createComment: async (args) => comments.push(args) },
    },
  };
  const context = { repo: { owner: "owner", repo: "calendar" } };
  const summary = {
    addRaw() {
      return { write: async () => {} };
    },
  };
  try {
    const input = {
      reason: "limit_exhausted",
      number: "7",
      isPR: "true",
      sha,
      used: "3",
      limit: "3",
      lane: "command",
      runUrl: "https://example.test/logs",
    };
    await publishOutcome({ github, context, input, summary, directory });
    const result = JSON.parse(await readFile(join(directory, "agent-outcome.json")));
    assert.equal(result.modelInvoked, false);
    for (const text of [
      "limit_exhausted",
      sha,
      "нужен человек",
      "https://example.test/logs",
      "Модель не вызывалась",
    ])
      assert.ok(comments[0].body.includes(text), text);
    const stale = await publishOutcome({
      github,
      context,
      summary,
      directory,
      input: { ...healthy, ...input, reason: "success", lane: "review", sha: "b".repeat(40) },
    });
    assert.equal(stale.reason, "agent_failed");
    assert.equal(stale.detail, "stale_sha");
    assert.equal(stale.sha, "b".repeat(40));
    assert.equal(stale.currentSha, sha);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  "command wrapper distinguishes missing key/tool and agent failure",
  { timeout: 5000 },
  async () => {
    assert.equal((await runCommand({ binary: "not-an-existing-agent", env: {} })).reason, "infra");
    assert.deepEqual(
      await runCommand({ binary: "not-an-existing-agent", env: { OPENCODE_API_KEY: "fake" } }),
      {
        reason: "infra",
        modelInvoked: false,
        exitCode: null,
      },
    );
    assert.equal(
      (
        await runCommand({
          binary: process.execPath,
          args: ["-e", "process.exit(2)"],
          env: { ...process.env, OPENCODE_API_KEY: "fake" },
        })
      ).reason,
      "agent_failed",
    );
  },
);

test(
  "timeout kills a stuck command and child cannot access Actions output files",
  { timeout: 5000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "command-wrapper-"));
    const record = join(directory, "child.json");
    const env = {
      ...process.env,
      OPENCODE_API_KEY: "fake",
      GITHUB_OUTPUT: "private",
      GITHUB_ENV: "private",
      GITHUB_STEP_SUMMARY: "private",
    };
    try {
      const result = await runCommand({
        binary: process.execPath,
        args: [
          "-e",
          "require('node:fs').writeFileSync(process.argv[1], JSON.stringify({pid:process.pid, output:process.env.GITHUB_OUTPUT, env:process.env.GITHUB_ENV, summary:process.env.GITHUB_STEP_SUMMARY})); process.on('SIGTERM',()=>{});setInterval(()=>{},1000)",
          record,
        ],
        env,
        timeout: 150,
        killAfter: 50,
      });
      assert.equal(result.reason, "timeout");
      assert.equal(result.modelInvoked, true);
      const child = JSON.parse(await readFile(record));
      assert.deepEqual(Object.keys(child), ["pid"]);
      assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
