function parseReport(text) {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  try {
    const value = JSON.parse(clean);
    if (typeof value.summary === "string" && value.summary.trim() && Array.isArray(value.findings))
      return value;
  } catch {
    /* A bounded reviewer can return its final report as Markdown. */
  }
  if (!clean) throw new Error("Reviewer returned no report");
  return { summary: text, findings: [] };
}

function changedLines(patch = "") {
  const lines = new Set();
  let line;
  for (const row of patch.split("\n")) {
    const hunk = row.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (line === undefined || row.startsWith("\\") || row.startsWith("-")) continue;
    if (row.startsWith("+") || row.startsWith(" ")) {
      lines.add(line);
      line++;
    }
  }
  return lines;
}

async function publishReview({ github, context, number, sha, report, runUrl }) {
  const args = { ...context.repo, pull_number: number };
  const current = async () => {
    const { data: pr } = await github.rest.pulls.get(args);
    if (pr.state !== "open" || pr.head.sha !== sha)
      throw new Error(`Review is stale: checked ${sha}, current ${pr.head.sha}`);
  };
  await current();
  const files = await github.paginate(github.rest.pulls.listFiles, { ...args, per_page: 100 });
  const paths = new Map(files.map((file) => [file.filename, changedLines(file.patch)]));
  const comments = [];
  const rejected = [];
  for (const item of report.findings) {
    if (
      typeof item.path === "string" &&
      Number.isSafeInteger(item.line) &&
      paths.get(item.path)?.has(item.line) &&
      typeof item.body === "string" &&
      item.body.trim() &&
      (item.side === undefined || item.side === "RIGHT")
    )
      comments.push({ path: item.path, line: item.line, side: "RIGHT", body: item.body });
    else
      rejected.push(
        "Замечание не опубликовано inline: путь/строка отсутствуют в проверенном diff или формат неверен.",
      );
  }
  await current();
  await github.rest.issues.createComment({
    ...context.repo,
    issue_number: number,
    body: `Проверен head SHA: \`${sha}\`. [Запуск](${runUrl}).\n\n${report.summary}${rejected.length ? `\n\n${rejected.join("\n")}` : ""}`,
  });
  if (comments.length) {
    await current();
    await github.rest.pulls.createReview({ ...args, commit_id: sha, event: "COMMENT", comments });
  }
  return { sha, inlineComments: comments.length, rejected: rejected.length };
}

module.exports = { parseReport, changedLines, publishReview };
