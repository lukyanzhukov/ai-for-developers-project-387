import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const workflow = readFileSync(
  new URL("../../.github/workflows/opencode-triage.yml", import.meta.url),
  "utf8",
);
function allowed(association, labels = [], type = "User") {
  const expression = workflow.match(/  triage:\n    if: >-\n([\s\S]*?)    runs-on:/)?.[1];
  assert.ok(expression, "Triage must authorize before checkout or model secrets");
  return runInNewContext(
    `(${expression.replaceAll("github.event.issue.labels.*.name", "labels")})`,
    {
      github: { event: { issue: { user: { type }, author_association: association } } },
      labels,
      fromJSON: JSON.parse,
      contains: (items, value) => items.some((item) => item.toLowerCase() === value.toLowerCase()),
    },
    { timeout: 100 },
  );
}

test("only trusted human incoming issues can start triage", { timeout: 1000 }, () => {
  for (const association of ["OWNER", "MEMBER", "COLLABORATOR"])
    assert.equal(allowed(association), true, association);
  for (const association of ["NONE", "CONTRIBUTOR", "FIRST_TIMER", "FIRST_TIME_CONTRIBUTOR"])
    assert.equal(allowed(association), false, association);
  assert.equal(allowed("OWNER", [], "Bot"), false);
});

test("prepared artifacts skip triage even with other labels", { timeout: 1000 }, () => {
  for (const association of ["OWNER", "MEMBER", "COLLABORATOR"]) {
    assert.equal(allowed(association, ["enhancement", "workflow:request"]), true);
    for (const marker of ["workflow:spec", "workflow:ticket", "ready-for-agent"])
      assert.equal(allowed(association, ["enhancement", marker, "needs-triage"]), false, marker);
  }
});
