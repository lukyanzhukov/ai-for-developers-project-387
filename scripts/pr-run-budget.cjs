// Admissions are recorded by completed Actions steps, never by editable PR text.
const lanes = {
  command: {
    workflow: "opencode.yml",
    prefix: "OpenCode PR #",
    gate: "Admit PR command",
    events: ["issue_comment", "pull_request_review_comment"],
  },
  review: {
    workflow: "opencode-pr-review.yml",
    prefix: "OpenCode review PR #",
    gate: "Reserve review attempt",
    events: ["pull_request", "workflow_dispatch"],
  },
};

async function reserve({ github, context, number, lane, limit = 3 }) {
  const policy = lanes[lane];
  if (!policy || !Number.isSafeInteger(limit) || limit < 1)
    throw new Error("Invalid budget policy");
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("Invalid PR number");
  const currentAttempt = Number(context.payloadRunAttempt ?? process.env.GITHUB_RUN_ATTEMPT ?? 1);
  if (!Number.isSafeInteger(currentAttempt) || currentAttempt < 1)
    throw new Error("Invalid run attempt");
  const { data: workflow } = await github.rest.actions.getWorkflow({
    ...context.repo,
    workflow_id: policy.workflow,
  });
  const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
    ...context.repo,
    workflow_id: workflow.id,
    per_page: 100,
  });
  const admissions = new Set();
  const title = policy.prefix + number;
  for (const run of runs) {
    if (run.workflow_id !== workflow.id || !policy.events.includes(run.event)) continue;
    const associated = run.pull_requests?.some((pr) => pr.number === number);
    if (run.display_title !== title && !(lane === "review" && associated)) continue;
    if (lane === "command" && run.actor?.login !== context.repo.owner) continue;
    const attempts = Number(run.run_attempt);
    if (!Number.isSafeInteger(attempts) || attempts < 1)
      throw new Error("Actions history omitted run_attempt");
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (run.id === context.runId && attempt === currentAttempt) continue;
      const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, {
        ...context.repo,
        run_id: run.id,
        attempt_number: attempt,
        per_page: 100,
      });
      if (
        jobs.some(
          (job) =>
            job.run_attempt === attempt &&
            job.steps?.some((step) => step.name === policy.gate && step.conclusion === "success"),
        )
      )
        admissions.add(run.id + ":" + attempt);
    }
  }
  const used = admissions.size;
  return {
    allowed: used < limit,
    used: used < limit ? used + 1 : used,
    limit,
    reason: used < limit ? "" : "limit_exhausted",
    key: context.runId + ":" + currentAttempt,
    runUrl:
      "https://github.com/" +
      context.repo.owner +
      "/" +
      context.repo.repo +
      "/actions/runs/" +
      context.runId +
      "/attempts/" +
      currentAttempt,
  };
}

async function commandTarget({ github, context }) {
  const authorize = require("./opencode-command-policy.cjs");
  if (!(await authorize({ github, context }))) return { allowed: false };
  const { payload, repo } = context;
  const isPR =
    Boolean(payload.issue?.pull_request) || context.eventName === "pull_request_review_comment";
  const number = payload.issue?.number ?? payload.pull_request?.number;
  let sha = context.sha;
  if (isPR) {
    const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: number });
    if (pr.state !== "open") throw new Error("PR must be open");
    sha = pr.head.sha;
  }
  if (!/^[a-f0-9]{40}$/.test(sha ?? "")) throw new Error("Missing full SHA");
  return { allowed: true, isPR, number, sha };
}

async function commandBudget(args) {
  const target = await commandTarget(args);
  if (!target.allowed || !target.isPR) return { ...target, used: 0, limit: 0 };
  // The App token obtained by opencode github run must also be unable to delete runs.
  const { data: app } = await args.github.rest.apps.getBySlug({ app_slug: "opencode-agent" });
  if (app.permissions?.actions !== "read")
    throw new Error("OpenCode App must have actions:read for immutable budget history");
  return { ...target, ...(await reserve({ ...args, number: target.number, lane: "command" })) };
}

module.exports = { reserve, commandTarget, commandBudget, lanes };
