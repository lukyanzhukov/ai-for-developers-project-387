const ATTEMPT = "<!-- opencode-review-attempt:v1 -->";
const DENIED = "<!-- opencode-review-denied:v1 -->";
const SHA = /^[a-f0-9]{40}$/;

function reservation(comment, number) {
  if (comment.user?.login !== "github-actions[bot]" || comment.user?.type !== "Bot") return;
  if (!comment.body?.startsWith(`${ATTEMPT}\n`)) return;
  try {
    const value = JSON.parse(comment.body.split("\n")[1]);
    if (value.pr === number && SHA.test(value.sha) && /^\d+:\d+$/.test(value.key)) return value;
  } catch {
    /* Other comments are not reservations. */
  }
}

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

async function reserveReview({ github, context, limit = 3 }) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid review limit");
  const pr = await target({ github, context });
  const key = `${context.runId}:${context.payloadRunAttempt ?? process.env.GITHUB_RUN_ATTEMPT ?? 1}`;
  if (!/^\d+:\d+$/.test(key)) throw new Error("Invalid run identity");
  const runUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}/attempts/${key.split(":")[1]}`;
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...context.repo,
    issue_number: pr.number,
    per_page: 100,
  });
  const previous = new Map();
  for (const comment of comments) {
    const value = reservation(comment, pr.number);
    if (value) previous.set(value.key, value);
  }
  const used = previous.size;
  const reason = previous.has(key)
    ? "этот запуск уже зарезервировал попытку"
    : used >= limit
      ? "лимит запусков исчерпан"
      : "";
  const result = { ...pr, key, used, limit, runUrl, allowed: !reason, reason };
  if (reason) {
    await github.rest.issues.createComment({
      ...context.repo,
      issue_number: pr.number,
      body: `${DENIED}\nАвторевью не запущено: ${reason}.\n\nПопыток использовано: ${used}/${limit}.\nHead SHA: \`${pr.sha}\`.\n[Логи запуска](${runUrl}). Модель не вызывалась.`,
    });
    return result;
  }
  await github.rest.issues.createComment({
    ...context.repo,
    issue_number: pr.number,
    body: `${ATTEMPT}\n${JSON.stringify({ pr: pr.number, sha: pr.sha, key })}\nПопытка авторевью ${used + 1}/${limit}, SHA \`${pr.sha}\`. [Запуск](${runUrl}).`,
  });
  return { ...result, used: used + 1 };
}

function browserProfile(labels = []) {
  const names = labels.map((label) => label.name);
  if (
    names.some(
      (name) =>
        typeof name === "string" && name.startsWith("browser:") && name !== "browser:keyboard",
    )
  )
    throw new Error("Unknown browser profile label");
  return names.includes("browser:keyboard") ? "keyboard-search" : "search";
}

module.exports = { reserveReview, target, reservation, browserProfile, ATTEMPT };
