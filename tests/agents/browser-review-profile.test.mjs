import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const checkerPath = new URL("../../scripts/browser-review.mjs", import.meta.url);
const checker = readFileSync(checkerPath, "utf8");
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
  assert.match(checker, /const readHead = \(\) => execFileSync\("git", \["rev-parse", "HEAD"\]/);
  assert.match(checker, /const sha = readHead\(\);/);
  assert.match(checker, /report\.verifiedSha = readHead\(\);/);
  assert.match(checker, /assert\.equal\(report\.verifiedSha, sha, "HEAD changed during review"\)/);
  assert.ok(!checker.includes("assert.equal(report.verifiedSha, sha);"));
  assert.match(checker, /assert\.equal\(report\.sha, report\.expectedSha/);
  assert.ok(checker.includes("Verified head SHA:") && checker.includes("${report.verifiedSha}"));
  assert.ok(checker.includes("Expected head SHA:") && checker.includes("${report.expectedSha}"));
  assert.ok(workflow.includes("Head SHA:") && workflow.includes("process.env.REVIEW_SHA"));
});

test("checker rejects a head that changed after startup", () => {
  const dir = mkdtempSync(join(tmpdir(), "browser-review-head-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const counter = join(dir, "counter");
  writeFileSync(counter, "0");
  writeFileSync(
    join(bin, "git"),
    [
      "#!/bin/sh",
      `count=$(cat "${counter}")`,
      `printf '%s\\n' "$((count + 1))" > "${counter}"`,
      'if [ "$1" = rev-parse ] && [ "$2" = HEAD ]; then',
      '  if [ "$count" = 0 ]; then',
      '    echo "1111111111111111111111111111111111111111"',
      "  else",
      '    echo "2222222222222222222222222222222222222222"',
      "  fi",
      "fi",
    ].join("\n"),
    { mode: 0o755 },
  );
  const evidence = join(dir, "evidence");
  const result = spawnSync(process.execPath, [fileURLToPath(checkerPath)], {
    cwd: dir,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, EVIDENCE_DIR: evidence },
    encoding: "utf8",
  });
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(readFileSync(join(evidence, "report.json"), "utf8"));
  assert.equal(report.sha, "1111111111111111111111111111111111111111");
  assert.equal(report.verifiedSha, "2222222222222222222222222222222222222222");
  assert.equal(report.status, "failed");
  assert.match(report.error, /HEAD changed during review/);
});

test("workflow passes the selected profile to the independent checker and revalidates it", () => {
  assert.match(workflow, /BROWSER_PROFILE: \$\{\{ steps\.target\.outputs\.profile \}\}/);
  assert.match(workflow, /checked\.profile \|\| 'search'.*BROWSER_PROFILE/);
  assert.match(workflow, /browserProfile\(pr\.labels\) !== process\.env\.BROWSER_PROFILE/);
});
