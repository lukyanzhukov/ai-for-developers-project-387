// Authorize the target before any step receives the model secret.
module.exports = async function authorizeCommand({ github, context }) {
  const { payload, eventName, repo } = context;
  if (!["issue_comment", "pull_request_review_comment"].includes(eventName)) return false;
  if (payload.action !== "created") return false;
  const comment = payload.comment;
  if (comment?.user?.type !== "User" || comment.user.login !== repo.owner) return false;
  if (!/(?:^|\s)\/(?:oc|opencode)(?=\s|$)/i.test(comment.body ?? "")) return false;

  if (eventName === "issue_comment" && payload.issue && !payload.issue.pull_request) return true;
  const number =
    eventName === "issue_comment" ? payload.issue?.number : payload.pull_request?.number;
  if (!Number.isSafeInteger(number) || number <= 0) return false;

  // issue_comment payloads omit PR head metadata. Fetch it from GitHub rather
  // than trusting the comment or assuming every comment targets a local branch.
  // API errors propagate: an unavailable authorization check must stop the job.
  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: number });
  const repository = `${repo.owner}/${repo.repo}`;
  return pr.base?.repo?.full_name === repository && pr.head?.repo?.full_name === repository;
};
