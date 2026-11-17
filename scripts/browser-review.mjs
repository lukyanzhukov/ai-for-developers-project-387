import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const output = resolve(process.env.EVIDENCE_DIR || "artifacts/browser");
await mkdir(output, { recursive: true });
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const profile = process.env.BROWSER_PROFILE || "search";
const report = {
  sha,
  profile,
  expectedSha: process.env.REVIEW_SHA || sha,
  checkerSha: process.env.CHECKER_SHA || null,
  checkerDigest: createHash("sha256")
    .update(await readFile(import.meta.filename))
    .digest("hex"),
  pr: process.env.PR_NUMBER || null,
  runUrl: process.env.RUN_URL || null,
  sources: [
    "https://github.com/lukyanzhukov/ai-for-developers-project-387/issues/84",
    ...(profile === "keyboard-search"
      ? ["https://github.com/lukyanzhukov/ai-for-developers-project-387/issues/91"]
      : []),
  ],
  startedAt: new Date().toISOString(),
  steps: [],
  status: "failed",
};
let app;
let browser;
let page;

async function step(name, expected, inspect) {
  let actual;
  try {
    actual = await inspect();
    assert.deepEqual(actual, expected);
    report.steps.push({ name, expected, actual, status: "passed" });
  } catch (error) {
    report.steps.push({
      name,
      expected,
      actual: actual ?? null,
      status: "failed",
      error: error.message,
    });
    throw error;
  } finally {
    if (page) await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
  }
}

try {
  assert.ok(["search", "keyboard-search"].includes(profile), "Unknown browser profile");
  assert.match(report.sha, /^[a-f0-9]{40}$/);
  assert.equal(report.sha, report.expectedSha, "Checkout differs from the requested PR head");
  execFileSync("git", ["diff", "--quiet", "HEAD", "--", "web", "server", "api", "generated"]);
  // The application and dependencies come from the checked head. This checker can
  // be copied from the base branch and run without importing the author's tests.
  const { chromium } = createRequire(resolve(root, "package.json"))("playwright");
  process.env.NODE_ENV = "production";
  const { createApp } = await import(pathToFileURL(resolve(root, "dist/server/app.js")).href);
  const make = (id, guestName, guestEmail, startsAt) => ({
    id: `00000000-0000-4000-8000-00000000000${id}`,
    meetingTypeId: "intro",
    meetingTypeTitle: "Знакомство",
    durationMinutes: 30,
    guestName,
    guestEmail,
    note: "",
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 1800000).toISOString(),
    createdAt: "2026-11-01T00:00:00Z",
  });
  app = await createApp({
    now: () => new Date("2026-11-09T01:00:00Z"),
    bookings: [
      make(1, "Анна Смирнова", "anna@example.com", "2026-11-09T02:00:00Z"),
      make(2, "Анна Орлова", "orlova@example.com", "2026-11-10T02:00:00Z"),
      make(3, "Борис Лебедев", "boris@example.com", "2026-11-11T02:00:00Z"),
    ],
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  browser = await chromium.launch({ timeout: 10000 });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(10000);
  await page.goto(`${app.listeningOrigin}/admin?view=bookings`);
  const search = page.getByLabel("Поиск по имени или email", { exact: true });
  const cards = () =>
    page.getByRole("list", { name: "Предстоящие встречи", exact: true }).getByRole("listitem");
  await search.waitFor();
  await page.getByText("Борис Лебедев · 30 мин", { exact: true }).waitFor();
  for (const mode of ["list", "calendar"]) {
    if (mode === "calendar") {
      await page.locator("label").filter({ hasText: "Календарь" }).click();
      await step("calendar-neighbor-date", { count: 1, found: true }, async () => {
        await page.getByRole("button", { name: "2026-11-11", exact: true }).click();
        await page.getByText("Борис Лебедев · 30 мин", { exact: true }).waitFor();
        return {
          count: await cards().count(),
          found: (await cards().allTextContents()).some((s) => s.includes("Борис")),
        };
      });
    }
    await step(`${mode}-name`, { count: 2, anna: true, boris: false }, async () => {
      await search.fill("аНнА");
      await page.getByText("Анна Орлова · 30 мин", { exact: true }).waitFor();
      const text = await cards().allTextContents();
      return {
        count: text.length,
        anna: text.every((s) => s.includes("Анна")),
        boris: text.some((s) => s.includes("Борис")),
      };
    });
    await step(`${mode}-email`, { count: 1, found: true }, async () => {
      await search.fill("BORIS@");
      await page.getByText("Борис Лебедев · 30 мин", { exact: true }).waitFor();
      return {
        count: await cards().count(),
        found: (await cards().allTextContents()).some((s) => s.includes("Борис")),
      };
    });
    await step(`${mode}-missing`, { empty: true, count: 0 }, async () => {
      await search.fill("несуществующий гость");
      await page.getByText("Ничего не найдено", { exact: true }).waitFor();
      return {
        empty: await page.getByText("Ничего не найдено", { exact: true }).isVisible(),
        count: await cards().count(),
      };
    });
    await step(`${mode}-clear`, { query: "", count: mode === "list" ? 3 : 1 }, async () => {
      await page.getByRole("button", { name: "Очистить поиск", exact: true }).click();
      await page
        .getByText(mode === "list" ? "Анна Смирнова · 30 мин" : "Борис Лебедев · 30 мин", {
          exact: true,
        })
        .waitFor();
      return { query: await search.inputValue(), count: await cards().count() };
    });
  }
  if (profile === "keyboard-search") {
    await page.locator("label").filter({ hasText: "Список" }).click();
    await step("keyboard-list-clear", { query: "", focused: true, count: 3 }, async () => {
      await search.fill("Анна");
      await search.press("Escape");
      return {
        query: await search.inputValue(),
        focused: await search.evaluate((el) => document.activeElement === el),
        count: await cards().count(),
      };
    });
    await page.locator("label").filter({ hasText: "Календарь" }).click();
    await step(
      "keyboard-list-retains-date",
      { selected: "true", count: 1, boris: true },
      async () => ({
        selected: await page
          .getByRole("button", { name: "2026-11-11", exact: true })
          .getAttribute("aria-pressed"),
        count: await cards().count(),
        boris: (await cards().allTextContents()).some((text) => text.includes("Борис")),
      }),
    );
    await step(
      "keyboard-calendar-clear",
      { query: "", focused: true, count: 1, selected: "true", boris: true },
      async () => {
        await search.fill("Анна");
        await search.press("Escape");
        return {
          query: await search.inputValue(),
          focused: await search.evaluate((el) => document.activeElement === el),
          count: await cards().count(),
          selected: await page
            .getByRole("button", { name: "2026-11-11", exact: true })
            .getAttribute("aria-pressed"),
          boris: (await cards().allTextContents()).some((text) => text.includes("Борис")),
        };
      },
    );
    await step(
      "keyboard-empty-repeat",
      { query: "", focused: true, count: 1, selected: "true" },
      async () => {
        await search.press("Escape");
        await search.press("Escape");
        return {
          query: await search.inputValue(),
          focused: await search.evaluate((el) => document.activeElement === el),
          count: await cards().count(),
          selected: await page
            .getByRole("button", { name: "2026-11-11", exact: true })
            .getAttribute("aria-pressed"),
        };
      },
    );
    const refresh = page.getByRole("button", { name: "Обновить", exact: true });
    await step("keyboard-outside-field", { query: "Анна", count: 2 }, async () => {
      await search.fill("Анна");
      await refresh.focus();
      await page.keyboard.press("Escape");
      return { query: await search.inputValue(), count: await cards().count() };
    });
    await step("keyboard-refresh-neighbor", { query: "Анна", count: 2 }, async () => {
      await Promise.all([
        page.waitForResponse((r) => r.url().endsWith("/api/bookings")).then((r) => r.finished()),
        refresh.click(),
      ]);
      await refresh.waitFor({ state: "visible" });
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Обновить")
            ?.disabled,
      );
      return { query: await search.inputValue(), count: await cards().count() };
    });
    await step("keyboard-cross-neighbor", { query: "", count: 1, selected: "true" }, async () => {
      await page.getByRole("button", { name: "Очистить поиск", exact: true }).click();
      return {
        query: await search.inputValue(),
        count: await cards().count(),
        selected: await page
          .getByRole("button", { name: "2026-11-11", exact: true })
          .getAttribute("aria-pressed"),
      };
    });
  }
  report.status = "passed";
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  for (const close of [() => browser?.close(), () => app?.close()]) {
    try {
      await close();
    } catch (error) {
      report.cleanupError = error.message;
      report.status = "failed";
      process.exitCode = 1;
    }
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  await writeFile(
    resolve(output, "report.md"),
    [
      `# Browser review: ${report.status}`,
      `Profile: ${profile}`,
      `Head SHA: \`${sha}\``,
      `Checker SHA: \`${report.checkerSha}\``,
      `PR: ${report.pr}`,
      `Run: ${report.runUrl}`,
      ...report.sources,
      ...report.steps.map(
        (s) =>
          `- ${s.status}: ${s.name}; expected ${JSON.stringify(s.expected)}; actual ${JSON.stringify(s.actual)}`,
      ),
      ...(report.error ? [`Error: ${report.error}`] : []),
    ].join("\n\n"),
  );
  console.log(`Browser review ${report.status}; SHA ${sha}; report ${output}`);
}
