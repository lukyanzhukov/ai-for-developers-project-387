function references(text, repository) {
  const result = new Set();
  for (const match of text.matchAll(/(?:^|[\s(])#([1-9]\d*)\b/g)) result.add(Number(match[1]));
  const escaped = repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const match of text.matchAll(
    new RegExp(`https://github\\.com/${escaped}/(?:issues|pull)/([1-9]\\d*)`, "g"),
  ))
    result.add(Number(match[1]));
  return [...result].filter(Number.isSafeInteger);
}

async function reviewContext({ github, context, number, sha }) {
  const repo = context.repo;
  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: number });
  if (pr.head.sha !== sha || pr.state !== "open") throw new Error("Review context is stale");
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...repo,
    issue_number: number,
    per_page: 100,
  });
  const files = await github.paginate(github.rest.pulls.listFiles, {
    ...repo,
    pull_number: number,
    per_page: 100,
  });
  const reviews = await github.paginate(github.rest.pulls.listReviews, {
    ...repo,
    pull_number: number,
    per_page: 100,
  });
  const inline = await github.paginate(github.rest.pulls.listReviewComments, {
    ...repo,
    pull_number: number,
    per_page: 100,
  });
  const limitations = [];
  const clip = (value, length, label) => {
    const text = String(value ?? "");
    if (text.length <= length) return text;
    limitations.push(`${label}: truncated at ${length} characters`);
    return text.slice(0, length) + "\n[TRUNCATED]";
  };
  const body = clip(pr.body, 30000, "PR body");
  const human = comments
    .filter((c) => c.user?.type === "User")
    .map((c) => c.body)
    .join("\n");
  const linked = references(`${body}\n${human}`, `${repo.owner}/${repo.repo}`).filter(
    (n) => n !== number,
  );
  if (linked.length > 8) limitations.push("Only the first eight directly linked issues were read");
  const sources = [];
  for (const issue_number of linked.slice(0, 8)) {
    try {
      const { data: issue } = await github.rest.issues.get({ ...repo, issue_number });
      const discussion = await github.paginate(github.rest.issues.listComments, {
        ...repo,
        issue_number,
        per_page: 100,
      });
      sources.push({
        number: issue_number,
        title: issue.title,
        body: clip(issue.body, 25000, `issue ${issue_number}`),
        comments: discussion.slice(-60).map((c) => ({
          author: c.user?.login,
          url: c.html_url,
          createdAt: c.created_at,
          body: clip(c.body, 12000, `comment ${c.id}`),
        })),
      });
      if (discussion.length > 60)
        limitations.push(`Issue ${issue_number}: only the last 60 comments included`);
    } catch (error) {
      if (error.status !== 404) throw error;
      limitations.push(`Linked issue ${issue_number} is unavailable`);
    }
  }
  const rules = {};
  for (const path of ["AGENTS.md", "REVIEW.md"]) {
    const { data: file } = await github.rest.repos.getContent({ ...repo, path, ref: sha });
    if (file.encoding !== "base64") throw new Error(`Cannot read ${path}`);
    rules[path] = Buffer.from(file.content, "base64").toString("utf8");
  }
  const checkedFiles = [];
  for (const file of files) {
    const item = {
      path: file.filename,
      status: file.status,
      patch: clip(file.patch || "[Binary or unavailable patch]", 80000, `diff ${file.filename}`),
    };
    if (
      file.status === "modified" &&
      /\.(?:[cm]?js|tsx?|json|ya?ml|md|css|pkl|toml)$/.test(file.filename) &&
      !rules[file.filename]
    ) {
      const { data: content } = await github.rest.repos.getContent({
        ...repo,
        path: file.filename,
        ref: sha,
      });
      if (content.encoding === "base64")
        item.currentFile = clip(
          Buffer.from(content.content, "base64").toString("utf8"),
          40000,
          `current ${file.filename}`,
        );
      else limitations.push(`Current text of ${file.filename} is unavailable`);
    }
    checkedFiles.push(item);
  }
  const checks = await github.paginate(github.rest.checks.listForRef, {
    ...repo,
    ref: sha,
    per_page: 100,
  });
  const { data: combined } = await github.rest.repos.getCombinedStatusForRef({ ...repo, ref: sha });
  const snapshot = {
    sha,
    collectedAt: new Date().toISOString(),
    checks: checks.map((c) => ({
      name: c.name,
      status: c.status,
      conclusion: c.conclusion,
      url: c.details_url,
    })),
    statuses: combined.statuses.map((s) => ({
      context: s.context,
      state: s.state,
      url: s.target_url,
    })),
    pr: { number, title: pr.title, body, url: pr.html_url },
    rules,
    sources,
    previousComments: comments.slice(-60).map((c) => ({
      author: c.user?.login,
      url: c.html_url,
      body: clip(c.body, 12000, `PR comment ${c.id}`),
    })),
    previousReviews: reviews.map((r) => ({
      author: r.user?.login,
      state: r.state,
      body: clip(r.body, 12000, `review ${r.id}`),
    })),
    inlineComments: inline.map((c) => ({
      path: c.path,
      line: c.line,
      commitId: c.commit_id,
      body: clip(c.body, 12000, `inline ${c.id}`),
    })),
    files: checkedFiles,
    limitations,
  };
  const text = JSON.stringify(snapshot, null, 2);
  if (Buffer.byteLength(text) > 700000)
    throw new Error("Review context exceeds the explicit input budget; split the PR");
  const { data: latest } = await github.rest.pulls.get({ ...repo, pull_number: number });
  if (latest.head.sha !== sha) throw new Error("PR changed while preparing context");
  return text;
}

function extractReview(jsonl) {
  const events = [];
  for (const line of jsonl.split("\n")) {
    try {
      events.push(JSON.parse(line));
    } catch {
      /* Installer output is not a model event. */
    }
  }
  const finish = events.findLast((e) => e.type === "step_finish");
  if (finish?.part?.reason !== "stop")
    throw new Error("Reviewer did not complete a final response");
  const message = finish.part.messageID;
  if (!message) throw new Error("Final response has no message identity");
  const parts = new Map();
  for (const e of events) {
    if (e.type === "text" && e.part?.messageID === message && typeof e.part.text === "string")
      parts.set(e.part.id, e.part.text);
  }
  const text = [...parts.values()].join("").trim();
  if (!text) throw new Error("Reviewer completed without a report");
  return text;
}

module.exports = { references, reviewContext, extractReview };
