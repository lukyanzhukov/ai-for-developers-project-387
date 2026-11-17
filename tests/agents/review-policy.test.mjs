import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { reserveReview } from "../../scripts/review-policy.cjs";
import { changedLines, parseReport, publishReview } from "../../scripts/publish-review.cjs";

const sha = "a".repeat(40);
const repository = "owner/calendar";
function fixture() {
  const comments = [];
  const posted = [];
  const inline = [];
  const pr = {
    state: "open",
    draft: false,
    user: { login: "owner" },
    head: { sha, repo: { full_name: repository } },
    base: { sha: "b".repeat(40), repo: { full_name: repository } },
  };
  const context = {
    eventName: "pull_request",
    repo: { owner: "owner", repo: "calendar" },
    runId: 10,
    payloadRunAttempt: 1,
    payload: { pull_request: { number: 7, head: { sha } } },
  };
  const issues = {
    listComments: () => {},
    createComment: async (args) => {
      posted.push(args);
      comments.push({ body: args.body, user: { login: "github-actions[bot]", type: "Bot" } });
    },
  };
  const pulls = {
    get: async () => ({ data: pr }),
    listFiles: () => {},
    createReview: async (args) => inline.push(args),
  };
  const github = {
    rest: { issues, pulls },
    paginate: async (method, args) => {
      assert.equal(args.per_page, 100);
      return method === issues.listComments
        ? comments
        : [{ filename: "web/test.tsx", patch: "@@ -1,2 +1,3 @@\n old\n+added\n last" }];
    },
  };
  return { github, context, comments, posted, inline, pr };
}
test("review rejects drafts, forks, stale events and untrusted dispatches before history access", async () => {
  for (const mutate of [
    (f) => {
      f.pr.draft = true;
    },
    (f) => {
      f.pr.head.repo.full_name = "other/fork";
    },
    (f) => {
      f.context.payload.pull_request.head.sha = "c".repeat(40);
    },
    (f) => {
      f.context.eventName = "workflow_dispatch";
      f.context.actor = "outsider";
      f.context.payload = { inputs: { pr_number: "7" } };
    },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(reserveReview(f));
    assert.equal(f.posted.length, 0);
  }
});

test("workflow gates the model and its secret on a reserved attempt", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/opencode-pr-review.yml", import.meta.url),
    "utf8",
  );
  const block = workflow
    .split("      - name: Review with OpenCode CLI\n")[1]
    .split("      - name:")[0];
  const condition = block.match(/^        if: (.+)$/m)[1];
  for (const allowed of ["true", "false", undefined]) {
    const result = runInNewContext(
      `(${condition})`,
      { steps: { budget: { outputs: { allowed } } } },
      { timeout: 100 },
    );
    assert.equal(result, allowed === "true");
  }
  assert.ok(block.includes("secrets.OPENCODE_API_KEY"));
  assert.ok(
    workflow.indexOf("Reserve review attempt") < workflow.indexOf("Review with OpenCode CLI"),
  );
  assert.match(
    workflow,
    /group: opencode-review-\$\{\{ github.event.pull_request.number \|\| inputs.pr_number \}\}/,
  );
  assert.match(workflow, /cancel-in-progress: true/);
});

test("diff line mapping excludes removed lines and handles several hunks", () => {
  assert.deepEqual(
    [
      ...changedLines(
        "@@ -10,2 +20,2 @@\n-old\n+new\n context\n@@ -99 +100 @@\n+tail\n\\ No newline at end of file",
      ),
    ],
    [20, 21, 100],
  );
});

test("publisher binds both comment types to the checked head and diff", async () => {
  const f = fixture();
  const report = {
    summary: "Нужна правка",
    findings: [
      { path: "web/test.tsx", line: 2, body: "Проверь обработку пустого запроса." },
      { path: "secrets.env", line: 1, body: "unrelated" },
    ],
  };
  const result = await publishReview({
    ...f,
    number: 7,
    sha,
    report,
    runUrl: "https://example.test/run",
  });
  assert.equal(result.inlineComments, 1);
  assert.equal(result.rejected, 1);
  assert.equal(f.inline[0].commit_id, sha);
  assert.equal(f.inline[0].comments[0].line, 2);
  assert.ok(f.posted[0].body.includes(sha));
});

test("stale reviews never publish a comment", async () => {
  const f = fixture();
  f.pr.head.sha = "c".repeat(40);
  await assert.rejects(
    publishReview({ ...f, number: 7, sha, report: { summary: "old", findings: [] } }),
    /stale/,
  );
  assert.equal(f.posted.length, 0);
  assert.equal(f.inline.length, 0);
});

test("bounded Markdown fallback preserves the report without invented inline findings", () => {
  assert.deepEqual(parseReport("Нет подтверждённых дефектов"), {
    summary: "Нет подтверждённых дефектов",
    findings: [],
  });
  assert.equal(parseReport('```json\n{"summary":"OK","findings":[]}\n```').summary, "OK");
  assert.throws(() => parseReport(""));
});
