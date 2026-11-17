import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "docs/design/screenshots");
const port = process.env.MOCKUP_PORT ?? "5188";
const baseUrl = `http://127.0.0.1:${port}/meeting-type-filter-mockup.html`;
const shots = [
  { name: "01-list-all", variant: "A", scenario: "all", expect: ["Всего: 6", "Все типы"] },
  {
    name: "02-multiselect",
    variant: "A",
    scenario: "multi",
    expect: ["Совпадений: 5", "Знакомство · 3", "Консультация · 2"],
  },
  {
    name: "03-disabled-types",
    variant: "B",
    scenario: "disabled",
    expect: ["НЕДОСТУПНО", "Повторный созвон · нет встреч"],
  },
  {
    name: "04-calendar-filter",
    variant: "A",
    scenario: "calendar",
    expect: ["Совпадений: 2", "Совпадения по всем датам"],
  },
  {
    name: "05-search-combined",
    variant: "C",
    scenario: "combined",
    expect: ["Совпадений: 1", "Анна Иванова"],
  },
  {
    name: "06-empty-result",
    variant: "B",
    scenario: "empty",
    expect: ["Ничего не найдено", "Совпадений: 0", "Повторный созвон · нет встреч · выбрано"],
  },
  {
    name: "07-after-refresh",
    variant: "A",
    scenario: "refreshed",
    expect: [
      "Ничего не найдено",
      "Совпадений: 0",
      "Знакомство · нет встреч · выбрано",
      "Консультация · нет встреч · выбрано",
    ],
  },
  {
    name: "08-filter-panel",
    variant: "B",
    scenario: "all",
    expect: ["Фильтр по типу", "Всего: 6"],
  },
  {
    name: "09-compact-toolbar",
    variant: "C",
    scenario: "all",
    expect: ["Всего: 6", "Тип встречи"],
  },
];

async function waitForServer(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((done) => setTimeout(done, 200));
    }
  }
  throw new Error(`Vite did not become ready at ${url} within ${timeoutMs} ms`);
}

const server = spawn("pnpm", ["exec", "vite", "--port", port, "--strictPort"], {
  cwd: root,
  env: { ...process.env, WEB_PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
server.stdout.on("data", (chunk) => {
  serverLog += String(chunk);
});
server.stderr.on("data", (chunk) => {
  serverLog += String(chunk);
});

let browser;
const watchdog = setTimeout(() => {
  server.kill("SIGKILL");
  process.stderr.write(`${serverLog}\n`);
  process.exit(1);
}, 120000);

try {
  await mkdir(outDir, { recursive: true });
  await waitForServer(baseUrl, 30000);
  browser = await chromium.launch({ timeout: 20000 });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });

  for (const shot of shots) {
    const url = `${baseUrl}?variant=${shot.variant}&scenario=${shot.scenario}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.locator("[data-mockup-ready]").waitFor({ timeout: 10000 });
    await page.waitForTimeout(250);
    const text = await page.locator("body").innerText();
    for (const fragment of shot.expect) {
      assert.ok(
        text.includes(fragment),
        `${shot.name}: missing "${fragment}" in ${JSON.stringify(text.slice(0, 1600))}`,
      );
    }
    const path = resolve(outDir, `${shot.name}.png`);
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
    console.log(`${shot.name}: ${path}`);
  }
} catch (error) {
  process.stderr.write(`${serverLog}\n`);
  throw error;
} finally {
  clearTimeout(watchdog);
  await browser?.close();
  server.kill("SIGTERM");
}
