import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runReview } from "../../scripts/review-runner.mjs";

test(
  "fatal provider stderr stops a hanging reviewer and saves redacted diagnostics",
  { timeout: 5000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "review-quota-"));
    try {
      const binary = join(root, "fake-opencode");
      await writeFile(
        binary,
        `#!/usr/bin/env node
process.stdin.resume();
process.stderr.write('stream error: Free usage ');
setTimeout(() => process.stderr.write('limit reached. secret-value'), 20);
setInterval(() => {}, 1000);
`,
      );
      await chmod(binary, 0o755);
      const started = Date.now();
      await assert.rejects(
        runReview({
          binary,
          prompt: "review",
          input: "data",
          directory: root,
          env: { ...process.env, OPENCODE_API_KEY: "secret-value" },
          timeout: 4000,
        }),
        /Provider rejected/,
      );
      assert.ok(Date.now() - started < 2500);
      const log = await readFile(join(root, "opencode-review.stderr"), "utf8");
      assert.match(log, /Free usage limit reached/);
      assert.ok(!log.includes("secret-value"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  "reviewer keeps gated tools visible, rejects auto approvals, and accepts a completed report",
  { timeout: 5000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "review-success-"));
    try {
      const binary = join(root, "fake-opencode");
      await writeFile(
        binary,
        `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(join(root, "invocation.json"))}, JSON.stringify({ args: process.argv.slice(2), permissions: JSON.parse(process.env.OPENCODE_PERMISSION) }));
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({ type:'text', part:{ id:'p', messageID:'m', text:'{"summary":"OK","findings":[]}' } }));
  console.log(JSON.stringify({ type:'step_finish', part:{ messageID:'m', reason:'stop' } }));
});
`,
      );
      await chmod(binary, 0o755);
      const result = await runReview({ binary, prompt: "review", input: "data", directory: root });
      assert.equal(JSON.parse(result).summary, "OK");
      const call = JSON.parse(await readFile(join(root, "invocation.json"), "utf8"));
      for (const flag of ["--no-auto", "--no-yolo", "--no-dangerously-skip-permissions"])
        assert.ok(call.args.includes(flag));
      assert.deepEqual(call.permissions, { "*": "deny", bash: "ask", read: "ask" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
