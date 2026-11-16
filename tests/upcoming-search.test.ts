import { chromium, type Browser } from "playwright";
import { expect, test } from "vitest";
import type { Booking } from "../generated/api/types.gen.ts";
import { startServer } from "./server.ts";

const booking = (
  id: string,
  meetingTypeTitle: string,
  startsAt: string,
  guestName: string,
  guestEmail: string,
  note = "",
): Booking => ({
  id,
  meetingTypeId: "intro",
  meetingTypeTitle,
  startsAt,
  endsAt: new Date(Date.parse(startsAt) + 30 * 60 * 1000).toISOString(),
  durationMinutes: 30,
  guestName,
  guestEmail,
  note,
  createdAt: "2026-11-01T00:00:00Z",
});

const bookings = [
  booking(
    "00000000-0000-4000-8000-000000000001",
    "Знакомство",
    "2026-11-09T02:00:00Z",
    "Анна Смирнова",
    "anna.smirnova@example.com",
    "Обсудить запуск",
  ),
  booking(
    "00000000-0000-4000-8000-000000000002",
    "Консультация",
    "2026-11-10T02:00:00Z",
    "Борис Лебедев",
    "boris.lebedev@example.com",
  ),
  booking(
    "00000000-0000-4000-8000-000000000003",
    "Разговор по делу",
    "2026-11-12T02:00:00Z",
    "Анна Ковалёва",
    "anna.kovaleva@example.com",
  ),
  booking(
    "00000000-0000-4000-8000-000000000004",
    "Знакомство",
    "2026-11-13T02:00:00Z",
    "Мария Орлова",
    "a.morozova@example.com",
    "Подготовить вопросы",
  ),
  booking(
    "00000000-0000-4000-8000-000000000005",
    "Прошлая встреча",
    "2026-11-08T02:00:00Z",
    "Анна Прошлая",
    "past@example.com",
  ),
  booking(
    "00000000-0000-4000-8000-000000000006",
    "Консультация",
    "2026-11-14T02:00:00Z",
    "Сергей Петров",
    "sergey@example.com",
  ),
];

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`owner searches upcoming bookings by guest name or email in list mode at ${viewport.width}px`, async () => {
    const server = await startServer([], {
      now: ["2026-11-09T02:15:00Z"],
      bookings,
    });
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ timeout: 5000 });
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(3000);
      page.setDefaultNavigationTimeout(3000);
      await page.goto(`${server.address}/admin?view=bookings`);
      const list = page.getByRole("list", { name: "Предстоящие встречи", exact: true });
      await list.getByText("Анна Смирнова · 30 мин", { exact: true }).waitFor();
      expect(await list.getByRole("listitem").count()).toBe(5);
      expect(await list.getByText("Анна Прошлая", { exact: true }).count()).toBe(0);

      const search = page.getByLabel("Поиск по имени или email", { exact: true });
      await search.fill("анна");
      expect(await list.getByRole("listitem").count()).toBe(2);
      const matches = await list.textContent();
      expect(matches).toContain("Анна Смирнова");
      expect(matches).toContain("Анна Ковалёва");
      expect(matches).toContain("anna.kovaleva@example.com");
      expect(matches).toContain("Обсудить запуск");
      expect(matches).not.toContain("Борис Лебедев");
      expect(matches).not.toContain("Анна Прошлая");
      expect(await list.getByRole("heading", { level: 3 }).count()).toBe(2);

      await search.fill("MOROZOVA");
      expect(await list.getByRole("listitem").count()).toBe(1);
      expect(await list.textContent()).toContain("Мария Орлова");

      await search.fill("  анна  ");
      expect(await list.getByRole("listitem").count()).toBe(2);

      await search.fill("нет такого гостя");
      await page.getByText("Ничего не найдено", { exact: true }).waitFor();
      expect(await list.count()).toBe(0);

      await page.getByRole("button", { name: "Очистить поиск", exact: true }).click();
      await list.getByText("Борис Лебедев · 30 мин", { exact: true }).waitFor();
      expect(await list.getByRole("listitem").count()).toBe(5);
      expect(await search.inputValue()).toBe("");

      await search.fill("Анна");
      expect(await list.getByRole("listitem").count()).toBe(2);
      await page.getByRole("button", { name: "Обновить", exact: true }).click();
      await list.getByText("Анна Ковалёва · 30 мин", { exact: true }).waitFor();
      expect(await search.inputValue()).toBe("Анна");
      expect(await list.getByRole("listitem").count()).toBe(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewport.width,
      );
    } finally {
      try {
        await browser?.close();
      } finally {
        await server.close();
      }
    }
  });
}

test("owner searches in calendar mode, marks only matching dates and shows all matches", async () => {
  const server = await startServer([], {
    now: ["2026-11-09T02:15:00Z"],
    bookings,
  });
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ timeout: 5000 });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(3000);
    page.setDefaultNavigationTimeout(3000);
    await page.goto(`${server.address}/admin?view=bookings`);
    await page.locator("label").filter({ hasText: "Календарь" }).click();
    const calendar = page.getByRole("region", { name: "Календарь", exact: true });
    const list = page.getByRole("list", { name: "Предстоящие встречи", exact: true });
    await list.getByText("Анна Смирнова · 30 мин", { exact: true }).waitFor();
    expect(await calendar.locator(".calendar-day[data-available]").count()).toBe(5);

    const search = page.getByLabel("Поиск по имени или email", { exact: true });
    await search.fill("анна");
    expect(await calendar.locator(".calendar-day[data-available]").count()).toBe(2);
    expect(
      await page
        .getByRole("button", { name: "2026-11-09", exact: true })
        .getAttribute("data-available"),
    ).not.toBeNull();
    expect(
      await page
        .getByRole("button", { name: "2026-11-12", exact: true })
        .getAttribute("data-available"),
    ).not.toBeNull();
    expect(
      await page
        .getByRole("button", { name: "2026-11-10", exact: true })
        .getAttribute("data-available"),
    ).toBeNull();
    await list.getByText("Анна Ковалёва · 30 мин", { exact: true }).waitFor();
    expect(await list.getByRole("listitem").count()).toBe(2);
    expect(
      await page.getByRole("heading", { name: "Совпадения по всем датам", exact: true }).count(),
    ).toBe(1);

    await page.getByRole("button", { name: "2026-11-10", exact: true }).click();
    expect(await list.getByRole("listitem").count()).toBe(2);

    await search.fill("Сергей Нет");
    await page.getByText("Ничего не найдено", { exact: true }).waitFor();
    expect(await calendar.locator(".calendar-day[data-available]").count()).toBe(0);

    await page.getByRole("button", { name: "Очистить поиск", exact: true }).click();
    await list.getByText("Борис Лебедев · 30 мин", { exact: true }).waitFor();
    expect(await list.getByRole("listitem").count()).toBe(1);
    expect(await calendar.locator(".calendar-day[data-available]").count()).toBe(5);

    await search.fill("анна");
    await page.getByRole("button", { name: "Обновить", exact: true }).click();
    await list.getByText("Анна Смирнова · 30 мин", { exact: true }).waitFor();
    expect(await search.inputValue()).toBe("анна");
    expect(await list.getByRole("listitem").count()).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1280,
    );
  } finally {
    try {
      await browser?.close();
    } finally {
      await server.close();
    }
  }
});
