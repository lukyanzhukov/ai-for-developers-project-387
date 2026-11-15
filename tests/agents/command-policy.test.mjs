import test from "node:test";
import assert from "node:assert/strict";
import authorizeCommand from "../../scripts/opencode-command-policy.cjs";

const repository = "lukyanzhukov/ai-for-developers-project-387";
function fixture(eventName = "issue_comment", head = repository) {
  const calls = [];
  const context = {
    eventName,
    repo: { owner: "lukyanzhukov", repo: "ai-for-developers-project-387" },
    payload: {
      action: "created",
      comment: { user: { login: "lukyanzhukov", type: "User" }, body: "/oc explain this issue" },
      ...(eventName === "issue_comment"
        ? { issue: { number: 73 } }
        : { pull_request: { number: 74 } }),
    },
  };
  const github = {
    rest: {
      pulls: {
        get: async (args) => {
          calls.push(args);
          return {
            data: {
              base: { repo: { full_name: repository } },
              head: { repo: head && { full_name: head } },
            },
          };
        },
      },
    },
  };
  return { github, context, calls };
}

test("owner commands in an issue need no PR API call", { timeout: 1000 }, async () => {
  for (const command of [
    "/oc explain this issue",
    "/opencode explain this issue",
    "/OC explain this issue",
  ]) {
    const input = fixture();
    input.context.payload.comment.body = command;
    assert.equal(await authorizeCommand(input), true);
    assert.deepEqual(input.calls, []);
  }
});

test(
  "bots, other users, edits, unrelated events and non-commands cannot start the agent",
  { timeout: 1000 },
  async () => {
    const mutations = [
      (ctx) => {
        ctx.payload.comment.user.type = "Bot";
      },
      (ctx) => {
        ctx.payload.comment.user.login = "outsider";
      },
      (ctx) => {
        ctx.payload.action = "edited";
      },
      (ctx) => {
        ctx.eventName = "issues";
      },
      (ctx) => {
        ctx.payload.comment.body = "/octopus";
      },
      (ctx) => {
        ctx.payload.comment.body = "https://example.com/oc";
      },
      (ctx) => {
        delete ctx.payload.comment;
      },
    ];
    for (const mutate of mutations) {
      const input = fixture();
      mutate(input.context);
      assert.equal(await authorizeCommand(input), false);
      assert.deepEqual(input.calls, []);
    }
  },
);

for (const event of ["issue_comment", "pull_request_review_comment"]) {
  test(`${event}: the API must confirm a same-repository PR`, { timeout: 1000 }, async () => {
    for (const [head, expected] of [
      [repository, true],
      ["outsider/fork", false],
      [null, false],
    ]) {
      const input = fixture(event, head);
      if (event === "issue_comment")
        input.context.payload.issue.pull_request = {
          url: "https://api.github.com/repos/example/pulls/74",
        };
      assert.equal(await authorizeCommand(input), expected);
      assert.deepEqual(input.calls, [
        { ...input.context.repo, pull_number: event === "issue_comment" ? 73 : 74 },
      ]);
    }
  });

  test(`${event}: API failure stops authorization`, { timeout: 1000 }, async () => {
    const input = fixture(event);
    if (event === "issue_comment") input.context.payload.issue.pull_request = {};
    input.github.rest.pulls.get = async () => {
      throw new Error("GitHub unavailable");
    };
    await assert.rejects(authorizeCommand(input), /GitHub unavailable/);
  });
}
