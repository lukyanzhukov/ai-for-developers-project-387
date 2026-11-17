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
import { useEffect, useState } from "react";
import type { Booking, BookingList, MeetingType } from "../generated/api/types.gen.ts";
import { MonthCalendar } from "./MonthCalendar.tsx";
import "./app.css";

type VariantKey = "A" | "B" | "C";
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

const variants: Array<{ key: VariantKey; name: string }> = [
  { key: "A", name: "Фильтр в поиске" },
  { key: "B", name: "Панель фильтров" },
  { key: "C", name: "Компактный тулбар" },
];

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

function readView(): { variant: VariantKey; scenario: ScenarioKey } {
  const params = new URLSearchParams(window.location.search);
  const rawVariant = params.get("variant");
  const rawScenario = params.get("scenario");
  const variant = variants.find((item) => item.key === rawVariant)?.key ?? "A";
  const scenario = scenarios.find((item) => item.key === rawScenario)?.key ?? "all";
  return { variant, scenario };
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
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00.000Z`));
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
      <mark className="owner-highlight">{text.slice(start, start + needle.length)}</mark>
      {text.slice(start + needle.length)}
    </>
  );
}

function BookingRow({ booking, query }: { booking: Booking; query: string }) {
  const [hours, minutes] = timeLabel(booking.startsAt).split(":");
  return (
    <Paper withBorder radius="md" p="sm" className="owner-booking">
      <Group wrap="nowrap" gap="sm" align="flex-start">
        <div className="owner-booking-time">
          <span className="owner-time-hour">{hours}</span>
          <span className="owner-time-mins">{minutes}</span>
        </div>
        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
          <Text fw={600} size="sm">
            <Highlight text={booking.guestName} query={query} />
          </Text>
          <Text size="xs" c="dimmed">
            <Highlight text={booking.guestEmail} query={query} />
          </Text>
          <Group gap={6} mt={4}>
            <Badge size="xs" variant="light" color="orange">
              {booking.meetingTypeTitle}
            </Badge>
            <Badge size="xs" variant="default">
              {booking.durationMinutes} мин
            </Badge>
          </Group>
        </Stack>
      </Group>
    </Paper>
  );
}

function Results({
  items,
  mode,
  date,
  onDateChange,
  query,
  filtering,
  countLabel,
}: {
  items: Booking[];
  mode: Mode;
  date: string;
  onDateChange: (value: string) => void;
  query: string;
  filtering: boolean;
  countLabel: string;
}) {
  return (
    <Stack gap="md">
      <Group justify="space-between" gap="sm" wrap="wrap">
        <Text fw={600}>{countLabel}</Text>
        <Text size="xs" c="dimmed">
          {filtering
            ? "Фильтр действует на все даты; выбранный день в календаре не ограничивает результат"
            : "Показаны все предстоящие встречи"}
        </Text>
      </Group>

      {items.length === 0 ? (
        <Paper withBorder radius="md" p="xl" className="owner-empty-list">
          <Text fw={600}>Ничего не найдено</Text>
          <Text size="sm" c="dimmed" mt={4}>
            Попробуйте сбросить тип или поисковый запрос
          </Text>
        </Paper>
      ) : mode === "list" ? (
        <Stack gap="xs">
          {items.map((booking) => (
            <BookingRow key={booking.id} booking={booking} query={query} />
          ))}
        </Stack>
      ) : (
        <Paper withBorder radius="md" p="md">
          <MonthCalendar
            start={dateKey(data.serverNow)}
            end={new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0))
              .toISOString()
              .slice(0, 10)}
            markedDates={[...new Set(items.map((booking) => dateKey(booking.startsAt)))]}
            legend={filtering ? "Совпадения" : "Встречи"}
            date={date}
            onChange={onDateChange}
          />
          <Text fw={600} mt="lg" mb="xs">
            {filtering ? "Совпадения по всем датам" : dayLabel(date)}
          </Text>
          <Stack gap="xs">
            {items.map((booking) => (
              <BookingRow key={booking.id} booking={booking} query={query} />
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

function MockupScreen({ variant, scenario }: { variant: VariantKey; scenario: Scenario }) {
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

  const typeSelect = (
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
      styles={{ dropdown: { zIndex: 1200 } }}
    />
  );

  const allTypesButton = (
    <Button
      variant={selectedTypes.length === 0 ? "light" : "default"}
      size="sm"
      onClick={() => setSelectedTypes([])}
    >
      Все типы
    </Button>
  );

  const searchField = (
    <TextInput
      aria-label="Поиск по гостям"
      placeholder="Имя или email гостя"
      value={query}
      onChange={(event) => setQuery(event.currentTarget.value)}
      leftSection={<SearchGlyph />}
      rightSection={
        query ? (
          <ActionIcon variant="subtle" aria-label="Очистить поиск" onClick={() => setQuery("")}>
            ×
          </ActionIcon>
        ) : null
      }
    />
  );

  const refreshButton = (
    <Button
      variant="default"
      size="sm"
      onClick={() =>
        setVisibleItems((current) =>
          current.filter((item) => !selectedTypes.includes(item.meetingTypeId)),
        )
      }
    >
      Обновить
    </Button>
  );

  const viewToggle = (
    <SegmentedControl
      size="sm"
      value={mode}
      onChange={(value) => setMode(value as Mode)}
      data={[
        { value: "list", label: "Список" },
        { value: "calendar", label: "Календарь" },
      ]}
    />
  );

  const results = (
    <Results
      items={items}
      mode={mode}
      date={effectiveDate}
      onDateChange={setDate}
      query={query}
      filtering={filtering}
      countLabel={countLabel}
    />
  );

  return (
    <Container size="xl" py="xl" data-mockup-ready>
      <Group justify="space-between" gap="md" wrap="wrap" mb="lg">
        <Group gap="md">
          <Title order={2}>Предстоящие встречи</Title>
          <Badge color="orange" variant="light">
            МАКЕТ · вымышленные данные
          </Badge>
        </Group>
        <Group gap="xs">
          {refreshButton}
          {viewToggle}
        </Group>
      </Group>

      {variant === "A" ? (
        <Stack gap="lg" pb={110}>
          <Paper withBorder radius="md" p="md" className="owner-search-field">
            <Text fw={600} mb="xs">
              Поиск и фильтр
            </Text>
            {searchField}
            <Group align="flex-end" gap="sm" wrap="wrap" mt="sm">
              <div style={{ flex: "1 1 260px" }}>{typeSelect}</div>
              {allTypesButton}
            </Group>
            <Text size="xs" c="dimmed" mt="xs">
              Пустой выбор означает «Все типы»; кнопка сбрасывает только тип
            </Text>
          </Paper>
          {results}
        </Stack>
      ) : null}

      {variant === "B" ? (
        <Stack gap="lg" pb={110}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(240px, 300px) minmax(0, 1fr)",
              gap: 20,
              alignItems: "start",
            }}
          >
            <Paper withBorder radius="md" p="md">
              <Text fw={600} mb="sm">
                Фильтр по типу
              </Text>
              <Stack gap="sm">
                {typeSelect}
                {allTypesButton}
                <Text size="xs" c="dimmed">
                  Типы без встреч недоступны, но уже выбранный тип остаётся удаляемым
                </Text>
              </Stack>
            </Paper>
            <Stack gap="md">
              {searchField}
              {results}
            </Stack>
          </div>
        </Stack>
      ) : null}

      {variant === "C" ? (
        <Stack gap="lg" pb={110}>
          <Paper withBorder radius="md" p="md" className="owner-search-field">
            <Group align="flex-end" gap="sm" wrap="wrap">
              <div style={{ flex: "1 1 260px" }}>{searchField}</div>
              <div style={{ width: 280 }}>{typeSelect}</div>
              {allTypesButton}
            </Group>
          </Paper>
          {results}
        </Stack>
      ) : null}
    </Container>
  );
}

function PrototypeBar({
  variant,
  scenarioKey,
  previousVariant,
  nextVariant,
  onVariant,
  onScenario,
}: {
  variant: VariantKey;
  scenarioKey: ScenarioKey;
  previousVariant: VariantKey;
  nextVariant: VariantKey;
  onVariant: (key: VariantKey) => void;
  onScenario: (key: ScenarioKey) => void;
}) {
  const name = variants.find((item) => item.key === variant)?.name ?? "";
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
      <Stack gap={6}>
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
        {import.meta.env.DEV ? (
          <Group gap="sm" wrap="nowrap" justify="center">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              aria-label="Предыдущий вариант"
              onClick={() => onVariant(previousVariant)}
            >
              ‹
            </ActionIcon>
            <Text size="xs" fw={600} c="white">
              {variant} · {name}
            </Text>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              aria-label="Следующий вариант"
              onClick={() => onVariant(nextVariant)}
            >
              ›
            </ActionIcon>
          </Group>
        ) : null}
      </Stack>
    </Paper>
  );
}

export function MeetingTypeFilterMockup() {
  const [view, setView] = useState(readView);
  const variantIndex = variants.findIndex((item) => item.key === view.variant);
  const previousVariant = variants[(variantIndex - 1 + variants.length) % variants.length].key;
  const nextVariant = variants[(variantIndex + 1) % variants.length].key;
  const scenario = scenarios.find((item) => item.key === view.scenario) ?? scenarios[0];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const nextIndex =
        (variantIndex + (event.key === "ArrowRight" ? 1 : -1) + variants.length) % variants.length;
      setView((current) => ({ ...current, variant: variants[nextIndex].key }));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [variantIndex]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", view.variant);
    url.searchParams.set("scenario", view.scenario);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [view]);

  return (
    <>
      <MockupScreen
        key={`${view.variant}-${view.scenario}`}
        variant={view.variant}
        scenario={scenario}
      />
      <PrototypeBar
        variant={view.variant}
        scenarioKey={view.scenario}
        previousVariant={previousVariant}
        nextVariant={nextVariant}
        onVariant={(key) => setView((current) => ({ ...current, variant: key }))}
        onScenario={(key) => setView((current) => ({ ...current, scenario: key }))}
      />
    </>
  );
}
