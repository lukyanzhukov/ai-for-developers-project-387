import test from "node:test";
import assert from "node:assert/strict";
import { reserve, commandBudget } from "../../scripts/pr-run-budget.cjs";
import { reserveReview } from "../../scripts/review-policy.cjs";

const sha = "a".repeat(40);
function fixture(lane = "command") {
  const workflow = lane === "command" ? "opencode.yml" : "opencode-pr-review.yml";
  const gate = lane === "command" ? "Admit PR command" : "Reserve review attempt";
  const title = lane === "command" ? "OpenCode PR #7" : "OpenCode review PR #7";
  const runs = [];
  const jobs = new Map();
  const context = {
    repo: { owner: "owner", repo: "calendar" },
    runId: 10,
    payloadRunAttempt: 1,
    sha,
    eventName: lane === "command" ? "issue_comment" : "pull_request",
    payload: {
      action: "created",
      comment: { body: "/oc check", user: { login: "owner", type: "User" } },
      issue: { number: 7, pull_request: {} },
      pull_request: { number: 7, head: { sha } },
    },
  };
  const pr = {
    state: "open",
    draft: false,
    user: { login: "owner" },
    head: { sha, repo: { full_name: "owner/calendar" } },
    base: { sha: "b".repeat(40), repo: { full_name: "owner/calendar" } },
  };
  const actions = {
    getWorkflow: async (args) => {
      assert.equal(args.workflow_id, workflow);
      return { data: { id: 42 } };
    },
    listWorkflowRuns() {},
    listJobsForWorkflowRunAttempt() {},
  };
  const github = {
    rest: {
      actions,
      pulls: { get: async () => ({ data: pr }) },
      apps: { getBySlug: async () => ({ data: { permissions: { actions: "read" } } }) },
      issues: {
        listComments() {
          throw new Error("PR text is not budget storage");
        },
      },
    },
    paginate: async (method, args) => {
      assert.equal(args.per_page, 100);
      if (method === actions.listWorkflowRuns) return runs;
      assert.equal(method, actions.listJobsForWorkflowRunAttempt);
      return jobs.get(args.run_id + ":" + args.attempt_number) || [];
    },
  };
  function record({
    id = context.runId,
    attempt = context.payloadRunAttempt,
    conclusion = "success",
    event = context.eventName,
  } = {}) {
    let run = runs.find((r) => r.id === id);
    if (!run) {
      run = {
        id,
        workflow_id: 42,
        display_title: title,
        actor: { login: "owner" },
        event,
        run_attempt: attempt,
      };
      runs.push(run);
    }
    run.run_attempt = Math.max(run.run_attempt, attempt);
    jobs.set(id + ":" + attempt, [
      { run_attempt: attempt, conclusion: "cancelled", steps: [{ name: gate, conclusion }] },
    ]);
    return run;
  }
  return { github, context, pr, runs, jobs, record, lane };
}

for (const lane of ["command", "review"]) {
  test(
    lane + ": changed SHA, cancelled model, rerun and timeout consume persistent admissions",
    async () => {
      const f = fixture(lane);
      for (let i = 1; i <= 3; i++) {
        f.context.payloadRunAttempt = i;
        f.pr.head.sha = String(i).repeat(40);
        f.context.payload.pull_request.head.sha = f.pr.head.sha;
        const result = lane === "command" ? await commandBudget(f) : await reserveReview(f);
        assert.equal(result.allowed, true);
        assert.equal(result.used, i);
        f.record();
      }
      f.context.runId = 11;
      const result = lane === "command" ? await commandBudget(f) : await reserveReview(f);
      assert.equal(result.allowed, false);
      assert.equal(result.reason, "limit_exhausted");
      assert.equal(result.used, 3);
      assert.equal(result.sha, "3".repeat(40));
      assert.match(result.runUrl, /runs\/11\/attempts\/3$/);
    },
  );

  test(
    lane +
      ": rejected and pre-admission cancellations do not consume budget; completed reservations do",
    async () => {
      const f = fixture(lane);
      f.record({ id: 1, conclusion: "failure" });
      f.record({ id: 2, conclusion: "skipped" });
      f.record({ id: 3, conclusion: "cancelled" });
      f.record({ id: 4 });
      assert.equal((await reserve({ ...f, number: 7 })).used, 2);
    },
  );

  test(
    lane + ": unrelated PRs/workflows and report-only reruns cannot forge or duplicate attempts",
    async () => {
      const f = fixture(lane);
      f.record({ id: 1 }).display_title += "0";
      f.record({ id: 2 }).workflow_id = 99;
      f.record({ id: 3 });
      f.runs.at(-1).run_attempt = 2;
      // GitHub may return an earlier successful job during a report-only rerun.
      f.jobs.set("3:2", [
        {
          run_attempt: 1,
          steps: [
            {
              name: lane === "command" ? "Admit PR command" : "Reserve review attempt",
              conclusion: "success",
            },
          ],
        },
      ]);
      assert.equal((await reserve({ ...f, number: 7 })).used, 2);
    },
  );

  test(lane + ": unavailable history fails closed", async () => {
    const f = fixture(lane);
    f.github.paginate = async () => {
      throw new Error("history unavailable");
    };
    await assert.rejects(reserve({ ...f, number: 7 }), /history unavailable/);
  });
}

test("general and inline human commands share one PR budget", async () => {
  const f = fixture();
  assert.equal((await commandBudget(f)).used, 1);
  f.record();
  f.context.runId = 11;
  f.context.eventName = "pull_request_review_comment";
  delete f.context.payload.issue;
  assert.equal((await commandBudget(f)).used, 2);
  f.record();
  f.context.runId = 12;
  assert.equal((await commandBudget(f)).used, 3);
  f.record();
  f.context.runId = 13;
  assert.equal((await commandBudget(f)).reason, "limit_exhausted");
});

test("changing App actions permission to write fails before a model can run", async () => {
  const f = fixture();
  f.github.rest.apps.getBySlug = async () => ({ data: { permissions: { actions: "write" } } });
  await assert.rejects(commandBudget(f), /actions:read/);
});

test("issue commands retain their separate workflow; closed PRs are refused", async () => {
  const f = fixture();
  delete f.context.payload.issue.pull_request;
  f.github.paginate = async () => {
    throw new Error("no PR budget query expected");
  };
  assert.equal((await commandBudget(f)).limit, 0);
  f.context.payload.issue.pull_request = {};
  f.pr.state = "closed";
  await assert.rejects(commandBudget(f), /must be open/);
});

test("manual review dispatches and automatic reviews share the review history", async () => {
  const f = fixture("review");
  f.record({ id: 1, event: "workflow_dispatch" });
  f.record({ id: 2, event: "pull_request" });
  f.context.eventName = "workflow_dispatch";
  f.context.actor = "owner";
  f.context.payload = { inputs: { pr_number: "7" } };
  assert.equal((await reserveReview(f)).used, 3);
});
