import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Group,
  MultiSelect,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";
import type { Booking, BookingList, MeetingType } from "../generated/api/types.gen.ts";
import { MonthCalendar } from "./MonthCalendar.tsx";
import "./app.css";

type ScenarioKey = "all" | "multi" | "disabled" | "calendar" | "combined" | "empty" | "refreshed";
type Mode = "list" | "calendar";

interface Scenario {
  key: ScenarioKey;
  label: string;
  mode: Mode;
  selected: string[];
  query: string;
  openDropdown?: boolean;
  refreshed?: boolean;
}

const meetingTypes: MeetingType[] = [
  {
    id: "t-intro",
    title: "Знакомство",
    description: "Короткое знакомство перед основной встречей",
    durationMinutes: 30,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "t-consult",
    title: "Консультация",
    description: "Разбор вопроса и рекомендации",
    durationMinutes: 60,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "t-strategy",
    title: "Стратегическая сессия",
    description: "Долгосрочное планирование",
    durationMinutes: 90,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "t-followup",
    title: "Повторный созвон",
    description: "Тип без предстоящих встреч",
    durationMinutes: 30,
    createdAt: "2026-01-01T00:00:00Z",
  },
];

const data: BookingList = {
  serverNow: "2026-11-17T00:00:00Z",
  timeZone: "Asia/Novokuznetsk",
  items: [
    {
      id: "b-1",
      meetingTypeId: "t-intro",
      meetingTypeTitle: "Знакомство",
      durationMinutes: 30,
      startsAt: "2026-11-17T02:00:00Z",
      endsAt: "2026-11-17T02:30:00Z",
      guestName: "Анна Иванова",
      guestEmail: "anna@example.com",
      note: "Уточнить формат",
      createdAt: "2026-11-10T00:00:00Z",
    },
    {
      id: "b-2",
      meetingTypeId: "t-consult",
      meetingTypeTitle: "Консультация",
      durationMinutes: 60,
      startsAt: "2026-11-17T04:00:00Z",
      endsAt: "2026-11-17T05:00:00Z",
      guestName: "Борис Петров",
      guestEmail: "boris@example.com",
      note: "",
      createdAt: "2026-11-10T01:00:00Z",
    },
    {
      id: "b-3",
      meetingTypeId: "t-strategy",
      meetingTypeTitle: "Стратегическая сессия",
      durationMinutes: 90,
      startsAt: "2026-11-18T03:00:00Z",
      endsAt: "2026-11-18T04:30:00Z",
      guestName: "Виктор Сидоров",
      guestEmail: "victor@example.com",
      note: "Подготовить материалы",
      createdAt: "2026-11-11T00:00:00Z",
    },
    {
      id: "b-4",
      meetingTypeId: "t-intro",
      meetingTypeTitle: "Знакомство",
      durationMinutes: 30,
      startsAt: "2026-11-18T07:00:00Z",
      endsAt: "2026-11-18T07:30:00Z",
      guestName: "Галина Орлова",
      guestEmail: "galina@example.com",
      note: "",
      createdAt: "2026-11-11T02:00:00Z",
    },
    {
      id: "b-5",
      meetingTypeId: "t-consult",
      meetingTypeTitle: "Консультация",
      durationMinutes: 60,
      startsAt: "2026-11-20T02:30:00Z",
      endsAt: "2026-11-20T03:30:00Z",
      guestName: "Дмитрий Соколов",
      guestEmail: "dmitry@example.com",
      note: "",
      createdAt: "2026-11-12T00:00:00Z",
    },
    {
      id: "b-6",
      meetingTypeId: "t-intro",
      meetingTypeTitle: "Знакомство",
      durationMinutes: 30,
      startsAt: "2026-11-20T05:00:00Z",
      endsAt: "2026-11-20T05:30:00Z",
      guestName: "Елена Фролова",
      guestEmail: "elena@example.com",
      note: "Перенос с пятницы",
      createdAt: "2026-11-12T04:00:00Z",
    },
  ],
};

const scenarios: Scenario[] = [
  { key: "all", label: "Все типы", mode: "list", selected: [], query: "" },
  {
    key: "multi",
    label: "Мультивыбор",
    mode: "list",
    selected: ["t-intro", "t-consult"],
    query: "",
  },
  {
    key: "disabled",
    label: "Недоступные",
    mode: "list",
    selected: [],
    query: "",
    openDropdown: true,
  },
  { key: "calendar", label: "Календарь", mode: "calendar", selected: ["t-consult"], query: "" },
  {
    key: "combined",
    label: "Тип + поиск",
    mode: "list",
    selected: ["t-intro", "t-consult"],
    query: "анна",
  },
  { key: "empty", label: "Пустой результат", mode: "list", selected: ["t-followup"], query: "" },
  {
    key: "refreshed",
    label: "После обновления",
    mode: "list",
    selected: ["t-intro", "t-consult"],
    query: "",
    refreshed: true,
  },
];

function readScenario(): ScenarioKey {
  const raw = new URLSearchParams(window.location.search).get("scenario");
  return scenarios.find((item) => item.key === raw)?.key ?? "all";
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function dateKey(utcIso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: data.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utcIso));
}

function dayLabel(date: string): string {
  const label = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "UTC",
    weekday: date === dateKey(data.serverNow) ? undefined : "long",
    day: "numeric",
    month: "long",
    year: date.slice(0, 4) === dateKey(data.serverNow).slice(0, 4) ? undefined : "numeric",
  }).format(new Date(`${date}T12:00:00.000Z`));
  return date === dateKey(data.serverNow) ? `Сегодня · ${label}` : label;
}

function timeLabel(utcIso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: data.timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(utcIso));
}

function SearchGlyph() {
  return (
    <svg className="owner-search-glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" strokeWidth="1.8" />
      <path d="m15.5 15.5 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = normalize(query);
  if (!needle) return <>{text}</>;

  const start = normalize(text).indexOf(needle);
  if (start < 0) return <>{text}</>;

  return (
    <>
      {text.slice(0, start)}
      <mark>{text.slice(start, start + needle.length)}</mark>
      {text.slice(start + needle.length)}
    </>
  );
}

function BookingRow({ booking, query }: { booking: Booking; query: string }) {
  const [hours, minutes] = timeLabel(booking.startsAt).split(":");
  return (
    <Paper p="lg" radius="md" withBorder className="owner-booking-card">
      <div className="owner-booking-time">
        <Text size="sm" fw={600} className="owner-time-hour">
          {hours}
        </Text>
        <Text size="xs" c="dimmed" className="owner-time-mins">
          {minutes}
        </Text>
      </div>
      <div>
        <Text size="sm" fw={600}>
          <Highlight text={booking.guestName} query={query} />
        </Text>
        <Text size="sm" c="dimmed" mt={4}>
          <Highlight text={booking.guestEmail} query={query} />
        </Text>
        <Group gap={8} mt={10}>
          <Badge size="sm" variant="light" color="orange">
            {booking.meetingTypeTitle}
          </Badge>
          <Badge size="sm" variant="default">
            {booking.durationMinutes} мин
          </Badge>
        </Group>
      </div>
    </Paper>
  );
}

function MeetingList({
  items,
  query,
  emptyLabel,
}: {
  items: Booking[];
  query: string;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return (
      <Text component="output" c="dimmed" className="owner-search-empty">
        {emptyLabel}
      </Text>
    );
  }

  return (
    <Stack
      component="ul"
      aria-label="Предстоящие встречи"
      p={0}
      m={0}
      style={{ listStyle: "none" }}
    >
      {items.map((booking) => (
        <li key={booking.id}>
          <BookingRow booking={booking} query={query} />
        </li>
      ))}
    </Stack>
  );
}

function MockupScreen({ scenario }: { scenario: Scenario }) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>(scenario.selected);
  const [query, setQuery] = useState(scenario.query);
  const [mode, setMode] = useState<Mode>(scenario.mode);
  const [date, setDate] = useState("");
  const [visibleItems, setVisibleItems] = useState<Booking[]>(() =>
    scenario.refreshed
      ? data.items.filter((item) => !scenario.selected.includes(item.meetingTypeId))
      : data.items,
  );

  const counts = new Map<string, number>();
  for (const item of visibleItems) {
    counts.set(item.meetingTypeId, (counts.get(item.meetingTypeId) ?? 0) + 1);
  }

  const options = [...meetingTypes]
    .sort((a, b) => {
      const aActive = (counts.get(a.id) ?? 0) > 0 || selectedTypes.includes(a.id);
      const bActive = (counts.get(b.id) ?? 0) > 0 || selectedTypes.includes(b.id);
      return Number(bActive) - Number(aActive) || a.title.localeCompare(b.title, "ru");
    })
    .map((type) => {
      const count = counts.get(type.id) ?? 0;
      const selected = selectedTypes.includes(type.id);
      return {
        value: type.id,
        label:
          count > 0
            ? `${type.title} · ${count}`
            : selected
              ? `${type.title} · нет встреч · выбрано`
              : `${type.title} · нет встреч`,
        disabled: count === 0 && !selected,
      };
    });

  const needle = normalize(query);
  const filtering = selectedTypes.length > 0 || needle.length > 0;
  const matches = visibleItems.filter((item) => {
    const byType = selectedTypes.length === 0 || selectedTypes.includes(item.meetingTypeId);
    const byQuery =
      needle.length === 0 ||
      normalize(item.guestName).includes(needle) ||
      normalize(item.guestEmail).includes(needle);
    return byType && byQuery;
  });

  const today = dateKey(data.serverNow);
  const allDates = visibleItems.map((item) => dateKey(item.startsAt));
  const lastDate = allDates.at(-1) ?? today;
  const monthEnd = new Date(Date.UTC(Number(lastDate.slice(0, 4)), Number(lastDate.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
  const effectiveDate = date >= today && date <= monthEnd ? date : (allDates[0] ?? today);
  const items =
    mode === "calendar" && !filtering
      ? matches.filter((item) => dateKey(item.startsAt) === effectiveDate)
      : matches;
  const countLabel = filtering
    ? `Совпадений: ${matches.length}`
    : mode === "list"
      ? `Всего: ${items.length}`
      : `На выбранный день: ${items.length}`;

  return (
    <Stack className="upcoming-page" gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Предстоящие встречи</Title>
          <Text size="sm" c="dimmed" mt={6}>
            Время встреч: Asia/Novokuznetsk
          </Text>
        </div>
        <Button
          variant="default"
          onClick={() =>
            setVisibleItems((current) =>
              current.filter((item) => !selectedTypes.includes(item.meetingTypeId)),
            )
          }
        >
          Обновить
        </Button>
      </Group>

      <Paper withBorder p="lg" radius="lg" className="owner-search-field">
        <TextInput
          aria-label="Поиск по имени или email"
          placeholder="Имя или email гостя"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          leftSection={<SearchGlyph />}
          rightSection={
            query ? (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                radius="xl"
                aria-label="Очистить поиск"
                onClick={() => setQuery("")}
              >
                ×
              </ActionIcon>
            ) : undefined
          }
          rightSectionPointerEvents="all"
        />
        <MultiSelect
          label="Тип встречи"
          placeholder="Все типы"
          aria-label="Тип встречи"
          data={options}
          value={selectedTypes}
          onChange={setSelectedTypes}
          clearable
          searchable
          defaultDropdownOpened={scenario.openDropdown}
          styles={{ dropdown: { zIndex: 1200 } }}
          renderOption={({ option }) => (
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <span>{option.label}</span>
              {option.disabled ? (
                <Badge size="xs" variant="default">
                  недоступно
                </Badge>
              ) : null}
            </Group>
          )}
        />
        <Group justify="space-between" mt="sm" gap="xs">
          <Text size="xs" c="dimmed">
            Часть имени или email, без учёта регистра; пустой выбор типов означает «Все типы»
          </Text>
          <Text size="xs" fw={600} className="owner-search-count">
            {countLabel}
          </Text>
        </Group>
      </Paper>

      <Group justify="space-between">
        <SegmentedControl
          className="owner-view-toggle"
          radius="xl"
          color="dark"
          aria-label="Режим просмотра"
          value={mode}
          onChange={(value) => setMode(value as Mode)}
          data={[
            { value: "list", label: "Список" },
            { value: "calendar", label: "Календарь" },
          ]}
        />
        <Text size="sm" c="dimmed">
          {countLabel}
        </Text>
      </Group>

      <Paper
        withBorder={mode === "calendar"}
        bg={mode === "calendar" ? "white" : "transparent"}
        className={mode === "calendar" ? "owner-calendar-layout" : undefined}
      >
        {mode === "calendar" && (
          <MonthCalendar
            start={today}
            end={monthEnd}
            markedDates={[...new Set(matches.map((item) => dateKey(item.startsAt)))]}
            date={effectiveDate}
            onChange={setDate}
            legend="Есть встречи"
          />
        )}
        <section
          className={mode === "calendar" ? "owner-agenda" : "owner-list"}
          aria-label={
            mode === "calendar"
              ? filtering
                ? "Все совпадения"
                : "Встречи на выбранную дату"
              : "Все предстоящие встречи"
          }
        >
          {mode === "calendar" && (
            <Title order={3} size="h4" mb="lg">
              {filtering ? "Совпадения по всем датам" : dayLabel(effectiveDate)}
            </Title>
          )}
          <MeetingList
            items={items}
            query={query}
            emptyLabel={
              filtering
                ? "Ничего не найдено"
                : items.length === 0 && visibleItems.length > 0
                  ? "На этот день встреч нет"
                  : "Предстоящих встреч пока нет"
            }
          />
        </section>
      </Paper>
    </Stack>
  );
}

function PrototypeBar({
  scenarioKey,
  onScenario,
}: {
  scenarioKey: ScenarioKey;
  onScenario: (key: ScenarioKey) => void;
}) {
  return (
    <Paper
      shadow="lg"
      radius="lg"
      p="xs"
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2000,
        background: "#242321",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <Group gap={4} justify="center" wrap="wrap">
        {scenarios.map((item) => (
          <Button
            key={item.key}
            size="compact-xs"
            radius="md"
            variant={item.key === scenarioKey ? "filled" : "subtle"}
            color={item.key === scenarioKey ? "orange" : "gray"}
            onClick={() => onScenario(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </Group>
    </Paper>
  );
}

export function MeetingTypeFilterMockup() {
  const [scenarioKey, setScenarioKey] = useState(readScenario);
  const scenario = scenarios.find((item) => item.key === scenarioKey) ?? scenarios[0];

  return (
    <Container size="xl" py="xl" data-mockup-ready>
      <MockupScreen key={scenario.key} scenario={scenario} />
      <PrototypeBar scenarioKey={scenario.key} onScenario={setScenarioKey} />
    </Container>
  );
}
