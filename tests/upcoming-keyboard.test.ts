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
    "Консультация",
    "2026-11-14T02:00:00Z",
    "Сергей Петров",
    "sergey@example.com",
  ),
];

const viewport = { width: 1280, height: 900 };

async function openBookings() {
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
    return { server, browser, page, list };
  } catch (error) {
    if (browser) await browser.close();
    await server.close();
    throw error;
  }
}

test("Escape clears the upcoming search in list mode and keeps focus", async () => {
  const { server, browser, page, list } = await openBookings();
  try {
    const search = page.getByLabel("Поиск по имени или email", { exact: true });
    await search.fill("анна");
    expect(await list.getByRole("listitem").count()).toBe(2);

    await search.press("Escape");
    expect(await search.inputValue()).toBe("");
    expect(await search.evaluate((element) => document.activeElement === element)).toBe(true);
    expect(await page.getByRole("region", { name: "Календарь", exact: true }).count()).toBe(0);
    await list.getByText("Борис Лебедев · 30 мин", { exact: true }).waitFor();
    expect(await list.getByRole("listitem").count()).toBe(5);
  } finally {
    try {
      await browser.close();
    } finally {
      await server.close();
    }
  }
});

test("Escape clears the upcoming search in calendar mode and keeps the selected date", async () => {
  const { server, browser, page, list } = await openBookings();
  try {
    await page.locator("label").filter({ hasText: "Календарь" }).click();
    const calendar = page.getByRole("region", { name: "Календарь", exact: true });
    const selectedDate = page.getByRole("button", { name: "2026-11-10", exact: true });
    await selectedDate.click();
    await list.getByText("Борис Лебедев · 30 мин", { exact: true }).waitFor();
    expect(await list.getByRole("listitem").count()).toBe(1);

    const search = page.getByLabel("Поиск по имени или email", { exact: true });
    await search.fill("анна");
    expect(await list.getByRole("listitem").count()).toBe(2);
    expect(
      await page.getByRole("heading", { name: "Совпадения по всем датам", exact: true }).count(),
    ).toBe(1);

    await search.press("Escape");
    expect(await search.inputValue()).toBe("");
    expect(await search.evaluate((element) => document.activeElement === element)).toBe(true);
    expect(await calendar.count()).toBe(1);
    expect(await selectedDate.getAttribute("aria-pressed")).toBe("true");
    await list.getByText("Борис Лебедев · 30 мин", { exact: true }).waitFor();
    expect(await list.getByRole("listitem").count()).toBe(1);
  } finally {
    try {
      await browser.close();
    } finally {
      await server.close();
    }
  }
});

test("Escape in an empty or repeated press leaves the upcoming search unchanged", async () => {
  const { server, browser, page, list } = await openBookings();
  try {
    const search = page.getByLabel("Поиск по имени или email", { exact: true });

    await search.press("Escape");
    expect(await search.inputValue()).toBe("");
    expect(await search.evaluate((element) => document.activeElement === element)).toBe(true);
    expect(await list.getByRole("listitem").count()).toBe(5);

    await search.fill("Анна");
    expect(await list.getByRole("listitem").count()).toBe(2);
    await search.press("Escape");
    expect(await search.inputValue()).toBe("");
    await search.press("Escape");
    expect(await search.inputValue()).toBe("");
    expect(await search.evaluate((element) => document.activeElement === element)).toBe(true);
    expect(await page.getByRole("region", { name: "Календарь", exact: true }).count()).toBe(0);
    expect(await list.getByRole("listitem").count()).toBe(5);
  } finally {
    try {
      await browser.close();
    } finally {
      await server.close();
    }
  }
});

test("Escape outside the search field does not clear the upcoming search", async () => {
  const { server, browser, page, list } = await openBookings();
  try {
    await page.locator("label").filter({ hasText: "Календарь" }).click();
    const selectedDate = page.getByRole("button", { name: "2026-11-10", exact: true });
    await selectedDate.click();
    await list.getByText("Борис Лебедев · 30 мин", { exact: true }).waitFor();

    const search = page.getByLabel("Поиск по имени или email", { exact: true });
    await search.fill("Анна");
    expect(await list.getByRole("listitem").count()).toBe(2);

    const refresh = page.getByRole("button", { name: "Обновить", exact: true });
    await refresh.focus();
    await page.keyboard.press("Escape");
    expect(await search.inputValue()).toBe("Анна");
    expect(await selectedDate.getAttribute("aria-pressed")).toBe("true");
    expect(await list.getByRole("listitem").count()).toBe(2);
  } finally {
    try {
      await browser.close();
    } finally {
      await server.close();
    }
  }
});

test("neighboring search actions keep working alongside Escape clearing", async () => {
  const { server, browser, page, list } = await openBookings();
  try {
    const search = page.getByLabel("Поиск по имени или email", { exact: true });
    await search.fill("MOROZOVA");
    expect(await list.getByRole("listitem").count()).toBe(1);
    expect(await list.textContent()).toContain("Мария Орлова");

    await search.fill("Анна");
    await search.press("Escape");
    expect(await search.inputValue()).toBe("");

    await search.fill("Анна");
    await page.getByRole("button", { name: "Очистить поиск", exact: true }).click();
    expect(await search.inputValue()).toBe("");
    expect(await list.getByRole("listitem").count()).toBe(5);

    await search.fill("нет такого гостя");
    await page.getByText("Ничего не найдено", { exact: true }).waitFor();
    expect(await list.count()).toBe(0);
    await page.getByRole("button", { name: "Очистить поиск", exact: true }).click();
    expect(await search.inputValue()).toBe("");

    await search.fill("Анна");
    expect(await list.getByRole("listitem").count()).toBe(2);
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/api/bookings")),
      page.getByRole("button", { name: "Обновить", exact: true }).click(),
    ]);
    expect(await search.inputValue()).toBe("Анна");
    expect(await list.getByRole("listitem").count()).toBe(2);
  } finally {
    try {
      await browser.close();
    } finally {
      await server.close();
    }
  }
});
