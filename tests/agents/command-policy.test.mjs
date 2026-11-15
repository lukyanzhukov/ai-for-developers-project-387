import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import authorizeCommand from "../../scripts/opencode-command-policy.cjs";

const repository = "lukyanzhukov/ai-for-developers-project-387";
function fixture(eventName = "issue_comment", head = repository, base = repository) {
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
              base: { repo: { full_name: base } },
              head: { repo: head && { full_name: head } },
            },
          };
        },
      },
    },
  };
  return { github, context, calls };
}

test("workflow rejects fork review events before checkout", { timeout: 1000 }, () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/opencode.yml", import.meta.url),
    "utf8",
  );
  const match = workflow.match(/  opencode:\n    if: \|\n([\s\S]*?)    runs-on:/);
  assert.ok(match, "The job must have an explicit authorization condition before steps run");
  // The actual job condition uses the common JS/GitHub expression subset.
  // Evaluate it with event fixtures instead of checking for a particular string.
  const allowed = (github) =>
    runInNewContext(
      `(${match[1]})`,
      {
        github,
        contains: (body, mention) => body.toLowerCase().includes(mention.toLowerCase()),
      },
      { timeout: 100 },
    );
  for (const [head, expected] of [
    [repository, true],
    ["outsider/fork", false],
  ]) {
    const { context } = fixture("pull_request_review_comment");
    context.payload.pull_request.head = { repo: { full_name: head } };
    const github = {
      event: context.payload,
      event_name: context.eventName,
      repository_owner: context.repo.owner,
      repository,
    };
    assert.equal(allowed(github), expected, `Review event from ${head}`);
    github.event.comment.user.type = "Bot";
    assert.equal(allowed(github), false);
  }
  const { context } = fixture();
  assert.equal(
    allowed({
      event: context.payload,
      event_name: context.eventName,
      repository_owner: context.repo.owner,
      repository,
    }),
    true,
  );
});

test(
  "workflow gates installation and the model secret on target authorization",
  { timeout: 1000 },
  async () => {
    const workflow = readFileSync(
      new URL("../../.github/workflows/opencode.yml", import.meta.url),
      "utf8",
    );
    for (const name of ["Install pinned OpenCode", "Run OpenCode"]) {
      const block = workflow.split(`      - name: ${name}\n`)[1]?.split("      - name:")[0];
      assert.ok(block, `${name} step must exist`);
      const condition = block.match(/^        if: (.+)$/m)?.[1];
      assert.ok(condition, `${name} must require successful target authorization`);
      for (const head of [repository, "outsider/fork"]) {
        const input = fixture("issue_comment", head);
        input.context.payload.issue.pull_request = {};
        const result = String(await authorizeCommand(input));
        const allowed = runInNewContext(
          `(${condition})`,
          {
            steps: { target: { outputs: { result } } },
          },
          { timeout: 100 },
        );
        assert.equal(allowed, head === repository, `${name} for ${head}`);
      }
      // A failed authorization step produces no success output.
      assert.equal(
        runInNewContext(
          `(${condition})`,
          {
            steps: { target: { outputs: {} } },
          },
          { timeout: 100 },
        ),
        false,
      );
    }
  },
);

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

  test(`${event}: a foreign base repository is rejected`, { timeout: 1000 }, async () => {
    const input = fixture(event, repository, "outsider/other-base");
    if (event === "issue_comment") input.context.payload.issue.pull_request = {};
    assert.equal(await authorizeCommand(input), false);
    assert.equal(input.calls.length, 1);
  });
}
