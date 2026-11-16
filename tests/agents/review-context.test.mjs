import test from "node:test";
import assert from "node:assert/strict";
import { references, extractReview, reviewContext } from "../../scripts/review-context.cjs";

const event = (type, messageID, extra = {}) => ({
  type,
  part: { id: `${messageID}-${type}`, messageID, ...extra },
});
const stream = (...events) => events.map(JSON.stringify).join("\n");

test("an unfinished review or whitespace is not a completed report", () => {
  const preamble = event("text", "intro", { text: "I'll start by reading the rules.\n" });
  assert.throws(
    () =>
      extractReview(
        stream(
          preamble,
          event("step_finish", "intro", { reason: "tool-calls" }),
          event("text", "next", { text: "\n\n" }),
        ),
      ),
    /final response/,
  );
  assert.throws(
    () =>
      extractReview(
        stream(
          preamble,
          event("step_finish", "final", { reason: "stop" }),
          event("text", "final", { text: "\n\n" }),
        ),
      ),
    /without a report/,
  );
});

test("only the completed final message is extracted; text updates are deduplicated", () => {
  const text = '{"summary":"Проверено","findings":[]}';
  const input = stream(
    event("text", "intro", { text: "Reading..." }),
    event("step_finish", "intro", { reason: "tool-calls" }),
    event("text", "final", { text: "partial" }),
    event("text", "final", { text }),
    event("step_finish", "final", { reason: "stop" }),
  );
  assert.equal(extractReview(`installer output\n${input}`), text);
});

test("source discovery stays within directly linked repository issues", () => {
  assert.deepEqual(
    references(
      "#12 https://github.com/owner/repo/issues/13#issuecomment-20 https://github.com/other/repo/issues/99",
      "owner/repo",
    ),
    [12, 13],
  );
});

test("snapshot pins code and rules to head, includes approvals and rejects stale input", async () => {
  const sha = "a".repeat(40);
  const pr = { head: { sha }, state: "open", title: "change", body: "Refs #12", html_url: "url" };
  const issues = {
    get: async () => ({ data: { title: "source", body: "approved behavior" } }),
    listComments: () => {},
  };
  const pulls = {
    get: async () => ({ data: pr }),
    listFiles: () => {},
    listReviews: () => {},
    listReviewComments: () => {},
  };
  const github = {
    rest: {
      issues,
      pulls,
      checks: { listForRef: () => {} },
      repos: {
        getCombinedStatusForRef: async () => ({ data: { statuses: [] } }),
        getContent: async (args) => {
          assert.equal(args.ref, sha);
          return { data: { encoding: "base64", content: Buffer.from("rules").toString("base64") } };
        },
      },
    },
    paginate: async (method, args) => {
      if (method === issues.listComments)
        return args.issue_number === 12
          ? [{ user: { login: "owner", type: "User" }, body: "согласовано", html_url: "approval" }]
          : [];
      if (method === pulls.listFiles)
        return [{ filename: "app.ts", status: "added", patch: "+code" }];
      return [];
    },
  };
  const input = { github, context: { repo: { owner: "owner", repo: "repo" } }, number: 1, sha };
  const result = JSON.parse(await reviewContext(input));
  assert.equal(result.sha, sha);
  assert.equal(result.sources[0].comments[0].body, "согласовано");
  assert.equal(result.files[0].patch, "+code");
  pr.head.sha = "b".repeat(40);
  await assert.rejects(reviewContext(input), /stale/);
});
