const SHA = /^[a-f0-9]{40}$/;

async function target({ github, context }) {
  const manual = context.eventName === "workflow_dispatch";
  if (!manual && context.eventName !== "pull_request") throw new Error("Unsupported review event");
  if (manual && context.actor !== context.repo.owner)
    throw new Error("Only the owner can repeat a review");
  const raw = manual ? context.payload.inputs?.pr_number : context.payload.pull_request?.number;
  if (!/^[1-9]\d*$/.test(String(raw))) throw new Error("Invalid PR number");
  const number = Number(raw);
  if (!Number.isSafeInteger(number)) throw new Error("Invalid PR number");
  const { data: pr } = await github.rest.pulls.get({ ...context.repo, pull_number: number });
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  if (
    pr.state !== "open" ||
    pr.draft ||
    pr.head?.repo?.full_name !== repository ||
    pr.base?.repo?.full_name !== repository ||
    ![context.repo.owner, "opencode-agent[bot]"].includes(pr.user?.login) ||
    !SHA.test(pr.head?.sha ?? "") ||
    !SHA.test(pr.base?.sha ?? "")
  )
    throw new Error("PR is closed, draft or outside the trusted repository");
  if (!manual && context.payload.pull_request.head.sha !== pr.head.sha)
    throw new Error("This review event is stale");
  return { number, sha: pr.head.sha, baseSha: pr.base.sha };
}

async function reserveReview(args) {
  const pr = await target(args);
  const { reserve } = require("./pr-run-budget.cjs");
  return { ...pr, ...(await reserve({ ...args, number: pr.number, lane: "review" })) };
}

const browserProfiles = {
  "browser:keyboard": "keyboard-search",
  "browser:type-filter": "type-filter",
};

function browserProfile(labels = []) {
  const names = labels.map((label) => label.name);
  for (const name of names) {
    if (
      typeof name === "string" &&
      name.startsWith("browser:") &&
      !Object.hasOwn(browserProfiles, name)
    )
      throw new Error("Unknown browser profile label");
  }
  const selected = Object.entries(browserProfiles).find(([label]) => names.includes(label));
  return selected ? selected[1] : "search";
}

module.exports = { reserveReview, target, browserProfile };
