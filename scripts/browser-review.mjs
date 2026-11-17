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
const profiles = ["search", "keyboard-search", "type-filter"];
const issue = (number) =>
  `https://github.com/lukyanzhukov/ai-for-developers-project-387/issues/${number}`;
const report = {
  sha,
  verifiedSha: sha,
  profile,
  expectedSha: process.env.REVIEW_SHA || sha,
  checkerSha: process.env.CHECKER_SHA || null,
  checkerDigest: createHash("sha256")
    .update(await readFile(import.meta.filename))
    .digest("hex"),
  pr: process.env.PR_NUMBER || null,
  runUrl: process.env.RUN_URL || null,
  sources: [
    issue(84),
    ...(profile === "keyboard-search" ? [issue(91)] : []),
    ...(profile === "type-filter" ? [issue(95), issue(100), issue(101), issue(102)] : []),
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
  assert.ok(profiles.includes(profile), "Unknown browser profile");
  assert.match(report.verifiedSha, /^[a-f0-9]{40}$/);
  assert.equal(report.verifiedSha, sha);
  assert.equal(report.sha, report.expectedSha, "Checkout differs from the requested PR head");
  execFileSync("git", ["diff", "--quiet", "HEAD", "--", "web", "server", "api", "generated"]);
  // The application and dependencies come from the checked head. This checker can
  // be copied from the base branch and run without importing the author's tests.
  const { chromium } = createRequire(resolve(root, "package.json"))("playwright");
  process.env.NODE_ENV = "production";
  const { createApp } = await import(pathToFileURL(resolve(root, "dist/server/app.js")).href);
  const make = (
    id,
    guestName,
    guestEmail,
    startsAt,
    meetingTypeId = "intro",
    meetingTypeTitle = "Знакомство",
  ) => ({
    id: `00000000-0000-4000-8000-00000000000${id}`,
    meetingTypeId,
    meetingTypeTitle,
    durationMinutes: 30,
    guestName,
    guestEmail,
    note: "",
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 1800000).toISOString(),
    createdAt: "2026-11-01T00:00:00Z",
  });
  const typeFixture = profile === "type-filter";
  const meetingTypes = typeFixture
    ? [
        ["intro", "Знакомство"],
        ["consult", "Консультация"],
        ["strategy", "Стратегическая сессия"],
        ["followup", "Повторный созвон"],
      ].map(([id, title]) => ({
        id,
        title,
        description: "",
        durationMinutes: 30,
        createdAt: "2026-01-01T00:00:00Z",
      }))
    : [];
  const bookings = typeFixture
    ? [
        make(1, "Анна Иванова", "anna@example.com", "2026-11-17T02:00:00Z", "intro", "Знакомство"),
        make(
          2,
          "Борис Петров",
          "boris@example.com",
          "2026-11-17T04:00:00Z",
          "consult",
          "Консультация",
        ),
        make(
          3,
          "Виктор Сидоров",
          "victor@example.com",
          "2026-11-18T03:00:00Z",
          "strategy",
          "Стратегическая сессия",
        ),
        make(
          4,
          "Галина Орлова",
          "galina@example.com",
          "2026-11-18T07:00:00Z",
          "intro",
          "Знакомство",
        ),
        make(
          5,
          "Дмитрий Соколов",
          "dmitry@example.com",
          "2026-11-20T02:30:00Z",
          "consult",
          "Консультация",
        ),
        make(
          6,
          "Елена Фролова",
          "elena@example.com",
          "2026-11-20T05:00:00Z",
          "intro",
          "Знакомство",
        ),
      ]
    : [
        make(1, "Анна Смирнова", "anna@example.com", "2026-11-09T02:00:00Z"),
        make(2, "Анна Орлова", "orlova@example.com", "2026-11-10T02:00:00Z"),
        make(3, "Борис Лебедев", "boris@example.com", "2026-11-11T02:00:00Z"),
      ];
  app = await createApp({
    now: () => new Date(typeFixture ? "2026-11-17T00:00:00Z" : "2026-11-09T01:00:00Z"),
    meetingTypes,
    bookings,
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
  if (!typeFixture) {
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
  if (typeFixture) {
    const types = page.getByRole("combobox", { name: "Тип встречи", exact: true });
    const cardsText = async () => (await cards().allTextContents()).map((text) => text.trim());
    const countLabel = async () =>
      (await page.locator(".owner-search-count").first().textContent()).trim();
    const openTypes = async () => {
      if ((await types.getAttribute("aria-expanded")) !== "true") await types.click();
    };
    const closeTypes = async () => {
      if ((await types.getAttribute("aria-expanded")) === "true")
        await page.keyboard.press("Escape");
    };
    const choose = async (title) => {
      await openTypes();
      await page.getByRole("option", { name: new RegExp(title) }).click();
      await closeTypes();
    };
    const dropTypes = async (count) => {
      await types.focus();
      for (let index = 0; index < count; index += 1) await types.press("Backspace");
      await closeTypes();
    };
    const refresh = page.getByRole("button", { name: "Обновить", exact: true });
    const refreshed = async (action) => {
      await Promise.all([
        page
          .waitForResponse((response) => response.url().endsWith("/api/bookings"))
          .then((response) => response.finished()),
        action(),
      ]);
      await refresh.waitFor({ state: "visible" });
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Обновить")
            ?.disabled,
      );
    };

    await step(
      "type-filter-single",
      { count: 3, intro: 3, other: 0, label: "Совпадений: 3" },
      async () => {
        await choose("Знакомство");
        const text = await cardsText();
        return {
          count: text.length,
          intro: text.filter((item) => item.includes("Знакомство")).length,
          other: text.filter(
            (item) => item.includes("Консультация") || item.includes("Стратегическая сессия"),
          ).length,
          label: await countLabel(),
        };
      },
    );
    await step(
      "type-filter-multi",
      { count: 5, intro: 3, consult: 2, strategy: 0, label: "Совпадений: 5" },
      async () => {
        await choose("Консультация");
        const text = await cardsText();
        return {
          count: text.length,
          intro: text.filter((item) => item.includes("Знакомство")).length,
          consult: text.filter((item) => item.includes("Консультация")).length,
          strategy: text.filter((item) => item.includes("Стратегическая сессия")).length,
          label: await countLabel(),
        };
      },
    );
    await step(
      "type-filter-disabled",
      { inactive: "true", active: null, selected: "true" },
      async () => {
        await openTypes();
        const inactive = await page
          .getByRole("option", { name: /Повторный созвон/ })
          .getAttribute("aria-disabled");
        const active = await page
          .getByRole("option", { name: /Стратегическая сессия/ })
          .getAttribute("aria-disabled");
        const selected = await page
          .getByRole("option", { name: /Знакомство/ })
          .getAttribute("aria-selected");
        await closeTypes();
        return { inactive, active, selected };
      },
    );
    await step(
      "type-filter-combined",
      { count: 1, guest: true, label: "Совпадений: 1" },
      async () => {
        await search.fill("анна");
        await page.getByText("Анна Иванова · 30 мин", { exact: true }).waitFor();
        const text = await cardsText();
        return {
          count: text.length,
          guest: text.some((item) => item.includes("Анна Иванова")),
          label: await countLabel(),
        };
      },
    );
    await step(
      "type-filter-clear-search-keeps-types",
      { query: "", count: 5, label: "Совпадений: 5" },
      async () => {
        await page.getByRole("button", { name: "Очистить поиск", exact: true }).click();
        return {
          query: await search.inputValue(),
          count: (await cardsText()).length,
          label: await countLabel(),
        };
      },
    );
    await step(
      "type-filter-clear-types-keeps-search",
      { query: "галина", count: 1, label: "Совпадений: 1" },
      async () => {
        await search.fill("галина");
        await dropTypes(2);
        return {
          query: await search.inputValue(),
          count: (await cardsText()).length,
          label: await countLabel(),
        };
      },
    );
    await step("type-filter-all-restored", { query: "", count: 6, label: "Всего: 6" }, async () => {
      await page.getByRole("button", { name: "Очистить поиск", exact: true }).click();
      return {
        query: await search.inputValue(),
        count: (await cardsText()).length,
        label: await countLabel(),
      };
    });
    await step(
      "type-filter-calendar",
      {
        heading: true,
        count: 2,
        consult: 2,
        marked17: "true",
        marked18: null,
        marked20: "true",
        range18: false,
        label: "Совпадений: 2",
      },
      async () => {
        await choose("Консультация");
        await page.locator("label").filter({ hasText: "Календарь" }).click();
        const heading = page.getByRole("heading", {
          name: "Совпадения по всем датам",
          exact: true,
        });
        await heading.waitFor();
        const text = await cardsText();
        const day = (date) => page.getByRole("button", { name: date, exact: true });
        return {
          heading: await heading.isVisible(),
          count: text.length,
          consult: text.filter((item) => item.includes("Консультация")).length,
          marked17: await day("2026-11-17").getAttribute("data-available"),
          marked18: await day("2026-11-18").getAttribute("data-available"),
          marked20: await day("2026-11-20").getAttribute("data-available"),
          range18: await day("2026-11-18").isDisabled(),
          label: await countLabel(),
        };
      },
    );
    await page.locator("label").filter({ hasText: "Список" }).click();
    await step("type-filter-empty", { empty: true, count: 0, label: "Совпадений: 0" }, async () => {
      await dropTypes(1);
      await choose("Знакомство");
      await search.fill("Виктор");
      await page.getByText("Ничего не найдено", { exact: true }).waitFor();
      return {
        empty: await page.getByText("Ничего не найдено", { exact: true }).isVisible(),
        count: await cards().count(),
        label: await countLabel(),
      };
    });
    await page.locator("label").filter({ hasText: "Календарь" }).click();
    await search.fill("анна");
    await step(
      "type-filter-refresh-retained",
      { count: 1, query: "анна", heading: true, label: "Совпадений: 1" },
      async () => {
        await refreshed(() => refresh.click());
        return {
          count: (await cardsText()).length,
          query: await search.inputValue(),
          heading: await page
            .getByRole("heading", { name: "Совпадения по всем датам", exact: true })
            .isVisible(),
          label: await countLabel(),
        };
      },
    );
    await page.locator("label").filter({ hasText: "Список" }).click();
    await page.getByRole("button", { name: "Очистить поиск", exact: true }).click();
    await step(
      "type-filter-refresh-empty",
      { empty: true, count: 0, label: "Совпадений: 0" },
      async () => {
        await page.route("**/api/bookings", async (route) => {
          const response = await route.fetch();
          const body = await response.json();
          await route.fulfill({
            response,
            body: JSON.stringify({
              ...body,
              items: body.items.filter((item) => item.meetingTypeId !== "intro"),
            }),
          });
        });
        await refreshed(() => refresh.click());
        await page.getByText("Ничего не найдено", { exact: true }).waitFor();
        return {
          empty: await page.getByText("Ничего не найдено", { exact: true }).isVisible(),
          count: await cards().count(),
          label: await countLabel(),
        };
      },
    );
    await step("type-filter-refresh-removable", { count: 3, label: "Всего: 3" }, async () => {
      await dropTypes(1);
      await page.unroute("**/api/bookings");
      return { count: (await cardsText()).length, label: await countLabel() };
    });
    await refreshed(() => refresh.click());
    await step(
      "type-filter-neighbor-search",
      { query: "", email: 1, cleared: 6, label: "Всего: 6" },
      async () => {
        await search.fill("BORIS@");
        const email = (await cardsText()).length;
        await page.getByRole("button", { name: "Очистить поиск", exact: true }).click();
        return {
          query: await search.inputValue(),
          email,
          cleared: (await cardsText()).length,
          label: await countLabel(),
        };
      },
    );
    await step(
      "type-filter-neighbor-calendar",
      { count: 2, ordinaryHeading: true, selected17: "true", label: "На выбранный день: 2" },
      async () => {
        await page.locator("label").filter({ hasText: "Календарь" }).click();
        const day = page.getByRole("button", { name: "2026-11-17", exact: true });
        await day.click();
        return {
          count: (await cardsText()).length,
          ordinaryHeading:
            (await page
              .getByRole("heading", { name: "Совпадения по всем датам", exact: true })
              .count()) === 0,
          selected17: await day.getAttribute("aria-pressed"),
          label: await countLabel(),
        };
      },
    );
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
      `Verified head SHA: \`${report.verifiedSha}\``,
      `Expected head SHA: \`${report.expectedSha}\``,
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
