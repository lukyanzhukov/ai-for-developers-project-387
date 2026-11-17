function outcome(input) {
  let reason = input.reason;
  if (input.jobConclusion === "timed_out") reason = input.modelStarted ? "timeout" : "infra";
  if (!["success", "limit_exhausted", "timeout", "infra", "agent_failed"].includes(reason)) {
    if (input.budgetOutcome !== "success" || input.installOutcome !== "success") reason = "infra";
    else if (input.jobResult === "success" && input.modelOutcome === "success") reason = "success";
    else reason = "agent_failed";
  }
  if (reason === "success" && (input.jobResult !== "success" || input.modelOutcome !== "success"))
    reason =
      input.budgetOutcome !== "success" || input.installOutcome !== "success"
        ? "infra"
        : "agent_failed";
  return {
    reason,
    status: reason === "success" ? "завершено" : "нужен человек",
    modelInvoked:
      input.modelInvoked === "true" || input.modelInvoked === true || Boolean(input.modelStarted),
    sha: input.sha || null,
    number: Number(input.number) || null,
    used: input.used === undefined || input.used === "" ? null : Number(input.used),
    limit: Number(input.limit) || (input.isPR === "true" ? 3 : 0),
    lane: input.lane,
    runUrl: input.runUrl,
    jobResult: input.jobResult,
  };
}

async function publishOutcome({ github, context, input, summary, directory }) {
  const fs = require("node:fs");
  const path = require("node:path");
  if (
    context.runId &&
    github.rest.actions &&
    !["success", "limit_exhausted"].includes(input.reason)
  ) {
    try {
      const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, {
        ...context.repo,
        run_id: context.runId,
        attempt_number: Number(process.env.GITHUB_RUN_ATTEMPT || 1),
        per_page: 100,
      });
      const job = jobs.find(
        (item) => item.name === (input.lane === "review" ? "review" : "opencode"),
      );
      const model = job?.steps?.find((step) =>
        ["Run OpenCode", "Review with OpenCode CLI"].includes(step.name),
      );
      input = {
        ...input,
        jobConclusion: job?.conclusion,
        modelStarted: Boolean(model?.started_at && model.conclusion !== "skipped"),
      };
    } catch {
      // Preserve the known reason; the report still points to logs for unavailable details.
    }
  }
  const result = outcome(input);
  if (result.number && input.isPR === "true") {
    try {
      const { data: pr } = await github.rest.pulls.get({
        ...context.repo,
        pull_number: result.number,
      });
      result.requestedSha = result.sha;
      result.currentSha = pr.head.sha;
      if (result.lane === "command") result.sha = pr.head.sha;
      else if (result.sha !== pr.head.sha && result.reason === "success") {
        result.reason = "agent_failed";
        result.status = "нужен человек";
        result.detail = "stale_sha";
      }
    } catch {
      if (result.reason === "success") result.reason = "infra";
      result.status = "нужен человек";
      result.detail = "current_sha_unavailable";
    }
  }
  const text = [
    "<!-- opencode-outcome:v2 -->",
    "Результат " +
      (result.lane === "review" ? "авторевью" : "команды") +
      ": " +
      result.reason +
      ".",
    "Статус: **" + result.status + "**.",
    "Head SHA: " + (result.sha || "недоступен, см. логи") + ".",
    result.currentSha && result.currentSha !== result.sha
      ? "Текущий SHA: " + result.currentSha + "."
      : "",
    result.detail ? "Уточнение: " + result.detail + "." : "",
    result.limit
      ? "Бюджет: " + (result.used ?? "неизвестен") + "/" + result.limit + "."
      : "Лимит PR не применяется.",
    result.modelInvoked ? "Шаг модели запускался." : "Модель не вызывалась.",
    "[Логи запуска](" + result.runUrl + ").",
  ].join("\n\n");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "agent-outcome.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(directory, "agent-outcome.md"), text);
  await summary.addRaw(text).write();
  if (result.number)
    await github.rest.issues.createComment({
      ...context.repo,
      issue_number: result.number,
      body: text,
    });
  return result;
}

module.exports = { outcome, publishOutcome };
