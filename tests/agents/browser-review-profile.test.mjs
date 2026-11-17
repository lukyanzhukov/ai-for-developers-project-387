import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const checker = readFileSync(new URL("../../scripts/browser-review.mjs", import.meta.url), "utf8");
const workflow = readFileSync(
  new URL("../../.github/workflows/browser-review.yml", import.meta.url),
  "utf8",
);

test("type-filter checker covers the agreed filter, search, calendar, empty and neighboring scenarios", () => {
  for (const name of [
    "type-filter-single",
    "type-filter-multi",
    "type-filter-disabled",
    "type-filter-combined",
    "type-filter-clear-search-keeps-types",
    "type-filter-clear-types-keeps-search",
    "type-filter-all-restored",
    "type-filter-calendar",
    "type-filter-empty",
    "type-filter-refresh-retained",
    "type-filter-refresh-empty",
    "type-filter-refresh-removable",
    "type-filter-neighbor-search",
    "type-filter-neighbor-calendar",
  ])
    assert.ok(checker.includes(`"${name}"`), name);
  assert.match(checker, /profiles = \["search", "keyboard-search", "type-filter"\]/);
  assert.match(checker, /getByRole\("combobox", \{ name: "Тип встречи", exact: true \}\)/);
  assert.match(checker, /"Совпадения по всем датам"/);
  assert.match(checker, /"Ничего не найдено"/);
  assert.match(checker, /aria-disabled/);
  assert.match(checker, /if \(!typeFixture\) \{[\s\S]*?Борис Лебедев/);
  for (const number of [95, 100, 101, 102])
    assert.ok(checker.includes(`issue(${number})`), String(number));
});

test("checker report and PR comment preserve the exact verified head SHA", () => {
  assert.match(checker, /verifiedSha: sha,/);
  assert.match(checker, /assert\.equal\(report\.verifiedSha, sha\)/);
  assert.match(checker, /assert\.equal\(report\.sha, report\.expectedSha/);
  assert.ok(checker.includes("Verified head SHA:") && checker.includes("${report.verifiedSha}"));
  assert.ok(checker.includes("Expected head SHA:") && checker.includes("${report.expectedSha}"));
  assert.ok(workflow.includes("Head SHA:") && workflow.includes("process.env.REVIEW_SHA"));
});

test("workflow passes the selected profile to the independent checker and revalidates it", () => {
  assert.match(workflow, /BROWSER_PROFILE: \$\{\{ steps\.target\.outputs\.profile \}\}/);
  assert.match(workflow, /checked\.profile \|\| 'search'.*BROWSER_PROFILE/);
  assert.match(workflow, /browserProfile\(pr\.labels\) !== process\.env\.BROWSER_PROFILE/);
});
