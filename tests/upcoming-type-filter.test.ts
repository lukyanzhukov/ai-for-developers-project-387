import { chromium, type Browser, type Page } from "playwright";
import { expect, test } from "vitest";
import type { Booking, MeetingType } from "../generated/api/types.gen.ts";
import { startServer } from "./server.ts";

const meetingType = (id: string, title: string): MeetingType => ({
  id,
  title,
  description: "",
  durationMinutes: 30,
  createdAt: "2026-01-01T00:00:00Z",
});

const booking = (
  id: string,
  meetingTypeId: string,
  meetingTypeTitle: string,
  startsAt: string,
  guestName: string,
  guestEmail: string,
): Booking => ({
  id,
  meetingTypeId,
  meetingTypeTitle,
  startsAt,
  endsAt: new Date(Date.parse(startsAt) + 30 * 60 * 1000).toISOString(),
  durationMinutes: 30,
  guestName,
  guestEmail,
  note: "",
  createdAt: "2026-11-01T00:00:00Z",
});

const meetingTypes = [
  meetingType("intro", "Знакомство"),
  meetingType("consult", "Консультация"),
  meetingType("strategy", "Стратегическая сессия"),
  meetingType("followup", "Повторный созвон"),
];

const bookings = [
  booking(
    "00000000-0000-4000-8000-000000000001",
    "intro",
    "Знакомство",
    "2026-11-09T02:00:00Z",
    "Анна Иванова",
    "anna@example.com",
  ),
  booking(
    "00000000-0000-4000-8000-000000000002",
    "consult",
    "Консультация",
    "2026-11-09T04:00:00Z",
    "Борис Петров",
    "boris@example.com",
  ),
  booking(
    "00000000-0000-4000-8000-000000000003",
    "intro",
    "Знакомство",
    "2026-11-10T03:00:00Z",
    "Галина Орлова",
    "galina@example.com",
  ),
  booking(
    "00000000-0000-4000-8000-000000000004",
    "consult",
    "Консультация",
    "2026-11-11T03:00:00Z",
    "Дина Соколова",
    "dina@example.com",
  ),
  booking(
    "00000000-0000-4000-8000-000000000005",
    "strategy",
    "Стратегическая сессия",
    "2026-11-12T03:00:00Z",
    "Елена Ким",
    "elena@example.com",
  ),
  booking(
    "00000000-0000-4000-8000-000000000006",
    "intro",
    "Знакомство",
    "2026-11-13T03:00:00Z",
    "Виктор Попов",
    "viktor@example.com",
  ),
];

const viewports = [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
];

const errorTexts = {
  load: "Не удалось загрузить типы встреч. Попробуйте ещё раз.",
  refresh: "Не удалось обновить типы встреч. Показан ранее загруженный список",
};

type Viewport = (typeof viewports)[number];
type Server = Awaited<ReturnType<typeof startServer>>;

const typeCombobox = (page: Page) =>
  page.getByRole("combobox", { name: "Тип встречи", exact: true });

async function chooseType(page: Page, title: string, index = 0) {
  const combobox = typeCombobox(page);
  await combobox.click();
  await page
    .getByRole("option", { name: new RegExp(title) })
    .nth(index)
    .click();
  await page.keyboard.press("Escape");
}

async function clearTypes(page: Page, count: number) {
  await typeCombobox(page).focus();
  for (let i = 0; i < count; i += 1) await page.keyboard.press("Backspace");
}

async function countText(page: Page) {
  return (await page.locator(".owner-search-count").first().textContent())?.trim();
}

async function withPage(
  types: MeetingType[],
  options: Parameters<typeof startServer>[1],
  run: (page: Page, server: Server) => Promise<void>,
  viewport: Viewport,
) {
  const server = await startServer(types, options);
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ timeout: 5000 });
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(3000);
    page.setDefaultNavigationTimeout(3000);
    await run(page, server);
  } finally {
    try {
      await browser?.close();
    } finally {
      await server.close();
    }
  }
}

async function fieldIsPresent(viewport: Viewport) {
  await withPage(
    meetingTypes,
    { now: ["2026-11-09T01:00:00Z"], bookings },
    async (page, server) => {
      await page.goto(`${server.address}/admin?view=bookings`);
      await page.getByLabel("Поиск по имени или email", { exact: true }).waitFor();
      expect(await typeCombobox(page).count()).toBe(1);
    },
    viewport,
  );
}

async function filtersTogetherWithSearch(viewport: Viewport) {
  await withPage(
    meetingTypes,
    { now: ["2026-11-09T01:00:00Z"], bookings },
    async (page, server) => {
      await page.goto(`${server.address}/admin?view=bookings`);
      await page.getByLabel("Поиск по имени или email", { exact: true }).waitFor();
      expect(await typeCombobox(page).count()).toBe(1);
      await page.getByText("Анна Иванова").first().waitFor();
      const search = page.getByLabel("Поиск по имени или email", { exact: true });

      await chooseType(page, "Знакомство");
      expect(await page.getByText("Анна Иванова").count()).toBe(1);
      expect(await page.getByText("Борис Петров").count()).toBe(0);
      expect(await countText(page)).toBe("Совпадений: 3");

      await chooseType(page, "Консультация");
      expect(await countText(page)).toBe("Совпадений: 5");

      await search.fill("анна");
      await page.getByText("Анна Иванова").first().waitFor();
      expect(await countText(page)).toBe("Совпадений: 1");

      await page.getByLabel("Очистить поиск", { exact: true }).click();
      expect(await countText(page)).toBe("Совпадений: 5");

      await search.fill("виктор");
      expect(await countText(page)).toBe("Совпадений: 1");
      await clearTypes(page, 2);
      expect(await search.inputValue()).toBe("виктор");
      expect(await countText(page)).toBe("Совпадений: 1");
      await page.getByLabel("Очистить поиск", { exact: true }).click();
      expect(await countText(page)).toBe("Всего: 6");

      await typeCombobox(page).click();
      const inactive = page.getByRole("option", { name: /Повторный созвон/ });
      expect(await inactive.getAttribute("aria-disabled")).toBe("true");
      expect(await inactive.getByText("недоступно").count()).toBe(1);
      const strategy = page.getByRole("option", { name: /Стратегическая сессия/ });
      expect(await strategy.getAttribute("aria-disabled")).toBeNull();
      await page.keyboard.press("Escape");

      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
    },
    viewport,
  );
}

async function survivesRefresh(viewport: Viewport) {
  await withPage(
    meetingTypes,
    { now: ["2026-11-09T01:00:00Z"], bookings },
    async (page, server) => {
      await page.goto(`${server.address}/admin?view=bookings`);
      await page.getByText("Анна Иванова").first().waitFor();
      await chooseType(page, "Знакомство");
      expect(await countText(page)).toBe("Совпадений: 3");

      await page.getByRole("button", { name: "Обновить", exact: true }).click();
      await page.waitForFunction(() =>
        document.querySelector(".owner-search-count")?.textContent?.includes("Совпадений: 3"),
      );
      expect(await typeCombobox(page).count()).toBe(1);

      await page.reload();
      await page.getByText("Анна Иванова").first().waitFor();
      expect(await countText(page)).toBe("Всего: 6");
      expect(await page.locator(".mantine-MultiSelect-pill").count()).toBe(0);
    },
    viewport,
  );
}

async function calendarAndStaleType(viewport: Viewport) {
  await withPage(
    meetingTypes,
    { now: ["2026-11-09T01:00:00Z"], bookings },
    async (page, server) => {
      await page.goto(`${server.address}/admin?view=bookings`);
      await page.locator("label").filter({ hasText: "Календарь" }).click();
      await chooseType(page, "Консультация");
      expect(await page.getByText("Совпадения по всем датам", { exact: true }).count()).toBe(1);
      expect(await countText(page)).toBe("Совпадений: 2");
      expect(
        await page
          .getByRole("button", { name: "2026-11-10", exact: true })
          .getAttribute("aria-pressed"),
      ).toBe("false");

      await page.getByLabel("Поиск по имени или email", { exact: true }).fill("нет такого");
      expect(await page.getByText("Ничего не найдено", { exact: true }).count()).toBe(1);
      expect(await countText(page)).toBe("Совпадений: 0");

      await page.getByLabel("Очистить поиск", { exact: true }).click();
      await clearTypes(page, 1);
      await chooseType(page, "Знакомство");
      await page.route("**/api/bookings", async (route) => {
        const response = await route.fetch();
        const payload = (await response.json()) as { items: Booking[]; serverNow: string };
        await route.fulfill({
          json: {
            ...payload,
            items: payload.items.filter((item) => item.meetingTypeId !== "intro"),
          },
        });
      });
      await page.getByRole("button", { name: "Обновить", exact: true }).click();
      await page.getByText("Ничего не найдено", { exact: true }).first().waitFor();
      expect(await page.locator(".mantine-MultiSelect-pill").count()).toBe(1);

      await clearTypes(page, 1);
      expect(await countText(page)).toBe("На выбранный день: 1");
      expect(await page.getByText("Борис Петров").count()).toBe(1);
    },
    viewport,
  );
}

async function duplicateTitles(viewport: Viewport) {
  const duplicateTypes = [
    meetingType("intro", "Знакомство"),
    meetingType("intro-copy", "Знакомство"),
  ];
  const duplicateBookings = [
    booking(
      "00000000-0000-4000-8000-000000000001",
      "intro",
      "Знакомство",
      "2026-11-09T02:00:00Z",
      "Анна Иванова",
      "anna@example.com",
    ),
    booking(
      "00000000-0000-4000-8000-000000000002",
      "intro-copy",
      "Знакомство",
      "2026-11-09T04:00:00Z",
      "Борис Петров",
      "boris@example.com",
    ),
  ];
  await withPage(
    duplicateTypes,
    { now: ["2026-11-09T01:00:00Z"], bookings: duplicateBookings },
    async (page, server) => {
      await page.goto(`${server.address}/admin?view=bookings`);
      await page.getByText("Анна Иванова").first().waitFor();
      await chooseType(page, "Знакомство", 1);
      expect(await page.getByText("Борис Петров").count()).toBe(1);
      expect(await page.getByText("Анна Иванова").count()).toBe(0);
    },
    viewport,
  );
}

async function neighborBehaviour(viewport: Viewport) {
  await withPage(
    meetingTypes,
    { now: ["2026-11-09T01:00:00Z"], bookings },
    async (page, server) => {
      await page.goto(`${server.address}/admin?view=bookings`);
      await page.getByText("Анна Иванова").first().waitFor();
      await page.getByLabel("Поиск по имени или email", { exact: true }).fill("boris");
      expect(await page.getByText("Борис Петров").count()).toBe(1);
      expect(await countText(page)).toBe("Совпадений: 1");
      await page.getByLabel("Очистить поиск", { exact: true }).click();

      await page.locator("label").filter({ hasText: "Календарь" }).click();
      expect(await countText(page)).toBe("На выбранный день: 2");
      expect(
        await page
          .getByRole("button", { name: "2026-11-09", exact: true })
          .getAttribute("aria-pressed"),
      ).toBe("true");
      expect(await countText(page)).not.toBe("Всего: 2");
    },
    viewport,
  );
}

async function retriesFirstLoad(viewport: Viewport) {
  await withPage(
    meetingTypes,
    { now: ["2026-11-09T01:00:00Z"], bookings },
    async (page, server) => {
      let bookingRequests = 0;
      page.on("request", (request) => {
        if (request.url().includes("/api/bookings")) bookingRequests += 1;
      });
      const blockTypes = (route: { abort: () => Promise<void> }) => route.abort();
      await page.route("**/api/meeting-types", blockTypes);
      await page.goto(`${server.address}/admin?view=bookings`);
      await page.getByText("Анна Иванова").first().waitFor();
      expect(bookingRequests).toBe(1);

      expect(await typeCombobox(page).isDisabled()).toBe(true);
      expect(await page.getByText(errorTexts.load, { exact: true }).count()).toBe(1);
      const retry = page.getByRole("button", { name: "Повторить", exact: true });
      expect(await retry.count()).toBe(1);

      const search = page.getByLabel("Поиск по имени или email", { exact: true });
      await search.fill("boris");
      expect(await page.getByText("Борис Петров").count()).toBe(1);
      expect(await countText(page)).toBe("Совпадений: 1");

      await page.unroute("**/api/meeting-types", blockTypes);
      await retry.click();
      await page.waitForFunction(
        () => !document.querySelector('[aria-label="Тип встречи"]')?.hasAttribute("disabled"),
      );
      expect(await typeCombobox(page).isEnabled()).toBe(true);
      expect(await page.getByText(errorTexts.load, { exact: true }).count()).toBe(0);
      expect(await search.inputValue()).toBe("boris");
      await chooseType(page, "Консультация");
      expect(await countText(page)).toBe("Совпадений: 1");
      expect(bookingRequests).toBe(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
    },
    viewport,
  );
}

async function keepsFilterOnRefreshFailure(viewport: Viewport) {
  await withPage(
    meetingTypes,
    { now: ["2026-11-09T01:00:00Z"], bookings },
    async (page, server) => {
      let bookingRequests = 0;
      page.on("request", (request) => {
        if (request.url().includes("/api/bookings")) bookingRequests += 1;
      });
      await page.goto(`${server.address}/admin?view=bookings`);
      await page.getByText("Анна Иванова").first().waitFor();
      await chooseType(page, "Знакомство");
      const search = page.getByLabel("Поиск по имени или email", { exact: true });
      await search.fill("анна");
      expect(await countText(page)).toBe("Совпадений: 1");
      expect(bookingRequests).toBe(1);

      const blockTypes = (route: { abort: () => Promise<void> }) => route.abort();
      await page.route("**/api/meeting-types", blockTypes);
      await page.getByRole("button", { name: "Обновить", exact: true }).click();
      await page.getByText(errorTexts.refresh, { exact: true }).first().waitFor();
      expect(bookingRequests).toBe(2);
      expect(await typeCombobox(page).isEnabled()).toBe(true);
      expect(await page.locator(".mantine-MultiSelect-pill").count()).toBe(1);
      expect(await search.inputValue()).toBe("анна");
      expect(await countText(page)).toBe("Совпадений: 1");
      expect(await page.getByText("Анна Иванова").count()).toBe(1);

      await page.unroute("**/api/meeting-types", blockTypes);
      await page.getByRole("button", { name: "Повторить", exact: true }).click();
      await page.getByText(errorTexts.refresh, { exact: true }).waitFor({ state: "hidden" });
      expect(await typeCombobox(page).isEnabled()).toBe(true);
      expect(await page.locator(".mantine-MultiSelect-pill").count()).toBe(1);
      expect(await search.inputValue()).toBe("анна");
      expect(await countText(page)).toBe("Совпадений: 1");
      expect(bookingRequests).toBe(2);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
    },
    viewport,
  );
}

for (const viewport of viewports) {
  test(`owner sees the meeting type filter at ${viewport.width}px`, () => fieldIsPresent(viewport));
  test(`owner filters by meeting type together with the guest search at ${viewport.width}px`, () =>
    filtersTogetherWithSearch(viewport));
  test(`filter state survives refresh at ${viewport.width}px`, () => survivesRefresh(viewport));
  test(`calendar shows filtered matches and keeps a stale type removable at ${viewport.width}px`, () =>
    calendarAndStaleType(viewport));
  test(`meeting types with the same title are filtered by identity at ${viewport.width}px`, () =>
    duplicateTitles(viewport));
  test(`without a type filter search and calendar behave as before at ${viewport.width}px`, () =>
    neighborBehaviour(viewport));
  test(`owner retries a failed first meeting type load at ${viewport.width}px`, () =>
    retriesFirstLoad(viewport));
  test(`owner keeps the filter when a meeting type refresh fails at ${viewport.width}px`, () =>
    keepsFilterOnRefreshFailure(viewport));
}
