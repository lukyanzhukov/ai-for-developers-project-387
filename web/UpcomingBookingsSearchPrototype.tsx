// Prototype: three search layouts on the existing /admin?view=bookings route, switchable via ?variant=.
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useCallback, useMemo, useState } from "react";
import type { Booking } from "../generated/api/types.gen.ts";
import { MonthCalendar } from "./MonthCalendar.tsx";
import { PrototypeSwitcher, type PrototypeVariant } from "./PrototypeSwitcher.tsx";
import "./search-prototype.css";

const VARIANTS = [
  { key: "a", name: "Поиск над списком" },
  { key: "b", name: "Боковая панель гостей" },
  { key: "c", name: "Отдельный режим поиска" },
] as const satisfies readonly PrototypeVariant[];

type VariantKey = (typeof VARIANTS)[number]["key"];
type Mode = "list" | "calendar";

const DEMO_TIME_ZONE = "Asia/Novokuznetsk";
const DEMO_NOW = "2026-11-15T18:00:00.000Z";

const DEMO_ITEMS: Booking[] = [
  {
    id: "demo-anna-smirnova",
    meetingTypeId: "demo-intro",
    meetingTypeTitle: "Знакомство",
    durationMinutes: 30,
    startsAt: "2026-11-16T03:00:00.000Z",
    endsAt: "2026-11-16T03:30:00.000Z",
    guestName: "Анна Смирнова",
    guestEmail: "anna.smirnova@example.com",
    note: "Обсудить запуск курса",
    createdAt: "2026-11-14T09:12:00.000Z",
  },
  {
    id: "demo-boris-lebedev",
    meetingTypeId: "demo-consultation",
    meetingTypeTitle: "Консультация",
    durationMinutes: 45,
    startsAt: "2026-11-16T07:00:00.000Z",
    endsAt: "2026-11-16T07:45:00.000Z",
    guestName: "Борис Лебедев",
    guestEmail: "boris.lebedev@example.com",
    note: "",
    createdAt: "2026-11-14T11:40:00.000Z",
  },
  {
    id: "demo-maria-orlova",
    meetingTypeId: "demo-business",
    meetingTypeTitle: "Разговор по делу",
    durationMinutes: 60,
    startsAt: "2026-11-17T04:00:00.000Z",
    endsAt: "2026-11-17T05:00:00.000Z",
    guestName: "Мария Орлова",
    guestEmail: "maria.orlova@example.com",
    note: "Подготовить вопросы по проекту",
    createdAt: "2026-11-13T16:05:00.000Z",
  },
  {
    id: "demo-anna-kovaleva",
    meetingTypeId: "demo-intro",
    meetingTypeTitle: "Знакомство",
    durationMinutes: 30,
    startsAt: "2026-11-18T02:30:00.000Z",
    endsAt: "2026-11-18T03:00:00.000Z",
    guestName: "Анна Ковалёва",
    guestEmail: "anna.kovaleva@example.com",
    note: "",
    createdAt: "2026-11-15T07:22:00.000Z",
  },
  {
    id: "demo-ivan-petrov",
    meetingTypeId: "demo-consultation",
    meetingTypeTitle: "Консультация",
    durationMinutes: 45,
    startsAt: "2026-11-19T09:00:00.000Z",
    endsAt: "2026-11-19T09:45:00.000Z",
    guestName: "Иван Петров",
    guestEmail: "ivan.petrov@example.com",
    note: "Проверить доступ к календарю",
    createdAt: "2026-11-15T12:18:00.000Z",
  },
  {
    id: "demo-anna-morozova",
    meetingTypeId: "demo-business",
    meetingTypeTitle: "Разговор по делу",
    durationMinutes: 60,
    startsAt: "2026-11-20T05:00:00.000Z",
    endsAt: "2026-11-20T06:00:00.000Z",
    guestName: "Анна Морозова",
    guestEmail: "a.morozova@example.com",
    note: "",
    createdAt: "2026-11-15T14:03:00.000Z",
  },
];

const DATE_KEY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: DEMO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const TIME_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  timeZone: DEMO_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});
const SHORT_DAY_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const DEMO_TODAY = DATE_KEY_FORMAT.format(new Date(DEMO_NOW));
const DEMO_DAYS = [...new Set(DEMO_ITEMS.map((item) => dateKey(item.startsAt)))].sort();
const DEMO_END = DEMO_DAYS.at(-1) ?? DEMO_TODAY;

function dateKey(instant: string) {
  return DATE_KEY_FORMAT.format(new Date(instant));
}

function dayLabel(day: string) {
  const label = new Intl.DateTimeFormat("ru-RU", {
    weekday: day === DEMO_TODAY ? undefined : "long",
    day: "numeric",
    month: "long",
    year: day.slice(0, 4) === DEMO_TODAY.slice(0, 4) ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
  return day === DEMO_TODAY ? `Сегодня · ${label}` : label;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function filterBookings(items: Booking[], query: string) {
  const needle = normalize(query);
  if (!needle) return items;
  return items.filter(
    (item) =>
      normalize(item.guestName).includes(needle) || normalize(item.guestEmail).includes(needle),
  );
}

function groupByDay(items: Booking[]): Array<[string, Booking[]]> {
  const groups = new Map<string, Booking[]>();
  for (const item of items) {
    const day = dateKey(item.startsAt);
    const group = groups.get(day);
    if (group) group.push(item);
    else groups.set(day, [item]);
  }
  return [...groups.entries()];
}

function itemsOnDay(items: Booking[], day: string) {
  return items.filter((item) => dateKey(item.startsAt) === day);
}

function datesWithItems(items: Booking[]) {
  return [...new Set(items.map((item) => dateKey(item.startsAt)))];
}

function isVariantKey(value: string | null): value is VariantKey {
  return VARIANTS.some((variant) => variant.key === value);
}

function requestedVariant(): VariantKey {
  if (typeof window === "undefined") return "a";
  const value = new URLSearchParams(window.location.search).get("variant");
  return isVariantKey(value) ? value : "a";
}

function SearchGlyph() {
  return (
    <svg className="search-glyph" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13.2 13.2 3.3 3.3" />
    </svg>
  );
}

function SearchInput({
  value,
  onValueChange,
  placeholder = "Имя или email гостя",
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <TextInput
      className="search-proto-input"
      aria-label="Поиск по имени или email"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange(event.currentTarget.value)}
      leftSection={<SearchGlyph />}
      rightSection={
        value ? (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            radius="xl"
            aria-label="Очистить поиск"
            onClick={() => onValueChange("")}
          >
            ×
          </ActionIcon>
        ) : undefined
      }
      rightSectionPointerEvents="all"
    />
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = normalize(query);
  if (!needle) return <>{text}</>;
  const source = text.toLocaleLowerCase("ru-RU");
  const index = source.indexOf(needle);
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  );
}

function ModeControl({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <SegmentedControl
      className="owner-view-toggle"
      radius="xl"
      color="dark"
      aria-label="Режим просмотра"
      value={mode}
      onChange={(value) => onChange(value === "calendar" ? "calendar" : "list")}
      data={[
        {
          value: "list",
          label: (
            <span className="owner-view-label">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M7 5h9M7 10h9M7 15h9M3 5h.01M3 10h.01M3 15h.01" />
              </svg>
              Список
            </span>
          ),
        },
        {
          value: "calendar",
          label: (
            <span className="owner-view-label">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <rect x="3" y="4" width="14" height="13" rx="3" />
                <path d="M6 2.5v3M14 2.5v3M3 8h14M7 11h.01M10 11h.01M13 11h.01M7 14h.01M10 14h.01" />
              </svg>
              Календарь
            </span>
          ),
        },
      ]}
    />
  );
}

function PageHeader({ onRefresh }: { onRefresh: () => void }) {
  return (
    <Group justify="space-between" align="flex-start">
      <div>
        <Title order={2}>Предстоящие встречи</Title>
        <Text size="sm" c="dimmed" mt={6}>
          Время встреч: Asia/Novokuznetsk · демо-данные
        </Text>
      </div>
      <Button variant="default" onClick={onRefresh}>
        Обновить
      </Button>
    </Group>
  );
}

function NoMatches() {
  return (
    <output className="search-empty">
      <Text fw={650} size="lg">
        Ничего не найдено
      </Text>
      <Text size="sm" c="dimmed" mt={4}>
        Проверьте имя или email. Опечатки пока не исправляются.
      </Text>
    </output>
  );
}

function BookingCard({ item, query }: { item: Booking; query: string }) {
  return (
    <Paper p="lg" radius="md" withBorder className="owner-booking-card search-booking-card">
      <Text size="sm" fw={600} className="owner-booking-time">
        <time dateTime={item.startsAt}>{TIME_FORMAT.format(new Date(item.startsAt))}</time>–
        <time dateTime={item.endsAt}>{TIME_FORMAT.format(new Date(item.endsAt))}</time>
      </Text>
      <Stack gap={6}>
        <Title order={4} size="md">
          <Highlight text={item.meetingTypeTitle} query={query} />
        </Title>
        <Text size="sm">
          <Highlight text={item.guestName} query={query} /> · {item.durationMinutes} мин
        </Text>
        <Text size="sm" c="dimmed">
          <Highlight text={item.guestEmail} query={query} />
        </Text>
        {item.note && (
          <Text size="sm" c="dimmed" style={{ whiteSpace: "pre-wrap" }}>
            {item.note}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

function GroupedList({ groups, query }: { groups: Array<[string, Booking[]]>; query: string }) {
  return (
    <div className="search-day-groups" aria-label="Найденные встречи">
      {groups.map(([day, items]) => (
        <section className="search-day-group" key={day}>
          <Group justify="space-between" className="owner-date-heading">
            <Title order={3} size="md">
              {dayLabel(day)}
            </Title>
            <Text size="xs" c="dimmed">
              Записей: {items.length}
            </Text>
          </Group>
          <Stack gap="sm">
            {items.map((item) => (
              <BookingCard key={item.id} item={item} query={query} />
            ))}
          </Stack>
        </section>
      ))}
    </div>
  );
}

type VariantProps = {
  allItems: Booking[];
  matches: Booking[];
  query: string;
  onQueryChange: (value: string) => void;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  selectedDate: string;
  onSelectedDate: (date: string) => void;
  onRefresh: () => void;
};

function VariantA(props: VariantProps) {
  const {
    allItems,
    matches,
    query,
    onQueryChange,
    mode,
    onModeChange,
    selectedDate,
    onSelectedDate,
    onRefresh,
  } = props;
  const searching = query.trim().length > 0;
  const visible = mode === "calendar" && !searching ? itemsOnDay(matches, selectedDate) : matches;
  const groups = groupByDay(visible);
  const markedDates = searching ? datesWithItems(matches) : DEMO_DAYS;
  const countLabel = searching ? `Совпадений: ${matches.length}` : `Всего: ${allItems.length}`;

  return (
    <Stack className="search-proto-variant" gap="lg">
      <PageHeader onRefresh={onRefresh} />
      <Paper p="lg" radius="lg" withBorder className="search-a-field">
        <SearchInput value={query} onValueChange={onQueryChange} />
        <Group justify="space-between" mt="sm">
          <Text size="xs" c="dimmed">
            Часть имени или email, без учёта регистра
          </Text>
          <Text size="xs" fw={600} className="search-result-count">
            {countLabel}
          </Text>
        </Group>
      </Paper>
      <Group justify="space-between" align="center">
        <ModeControl mode={mode} onChange={onModeChange} />
        <Text size="sm" c="dimmed">
          {mode === "calendar" && !searching ? `На выбранный день: ${visible.length}` : countLabel}
        </Text>
      </Group>
      {mode === "calendar" ? (
        <Paper withBorder bg="white" className="owner-calendar-layout">
          <MonthCalendar
            start={DEMO_TODAY}
            end={DEMO_END}
            markedDates={markedDates}
            date={selectedDate}
            onChange={onSelectedDate}
            legend="Есть встречи"
          />
          <section
            className="owner-agenda"
            aria-label={searching ? "Все совпадения" : "Встречи на выбранную дату"}
          >
            <Title order={3} size="h4" mb="lg">
              {searching ? "Совпадения по всем датам" : dayLabel(selectedDate)}
            </Title>
            {searching && matches.length === 0 ? (
              <NoMatches />
            ) : groups.length === 0 ? (
              <Text component="output" c="dimmed">
                {searching ? "На эту дату совпадений нет" : "На этот день встреч нет"}
              </Text>
            ) : (
              <GroupedList groups={groups} query={query} />
            )}
          </section>
        </Paper>
      ) : (
        <section aria-label="Все предстоящие встречи">
          {searching && matches.length === 0 ? (
            <NoMatches />
          ) : (
            <GroupedList groups={groups} query={query} />
          )}
        </section>
      )}
    </Stack>
  );
}

function VariantB(props: VariantProps) {
  const {
    allItems,
    matches,
    query,
    onQueryChange,
    mode,
    onModeChange,
    selectedDate,
    onSelectedDate,
    onRefresh,
  } = props;
  const searching = query.trim().length > 0;
  const visible = mode === "calendar" && !searching ? itemsOnDay(matches, selectedDate) : matches;
  const groups = groupByDay(visible);
  const markedDates = searching ? datesWithItems(matches) : DEMO_DAYS;
  const countLabel = searching ? `Совпадений: ${matches.length}` : `Всего: ${allItems.length}`;

  return (
    <Stack className="search-proto-variant" gap="lg">
      <PageHeader onRefresh={onRefresh} />
      <div className="search-b-layout">
        <Paper p="md" radius="lg" withBorder className="search-b-rail">
          <Text className="eyebrow">Поиск гостя</Text>
          <SearchInput value={query} onValueChange={onQueryChange} />
          <Group justify="space-between" mt="sm">
            <Text size="xs" fw={600} className="search-result-count">
              {countLabel}
            </Text>
            <Text size="xs" c="dimmed">
              имя / email
            </Text>
          </Group>
          {searching ? (
            matches.length === 0 ? (
              <div className="search-b-empty">
                <Text size="sm" fw={600}>
                  Ничего не найдено
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  Попробуйте другую часть имени или email.
                </Text>
              </div>
            ) : (
              <div className="search-b-match-list">
                {matches.map((item) => (
                  <article className="search-b-match" key={item.id}>
                    <Text className="search-b-match-date">
                      {dayLabel(dateKey(item.startsAt))} ·{" "}
                      {TIME_FORMAT.format(new Date(item.startsAt))}
                    </Text>
                    <Text className="search-b-match-name">
                      <Highlight text={item.guestName} query={query} />
                    </Text>
                    <Text className="search-b-match-email">
                      <Highlight text={item.guestEmail} query={query} />
                    </Text>
                    <Text className="search-b-match-meta">
                      {item.meetingTypeTitle} · {item.durationMinutes} мин
                    </Text>
                  </article>
                ))}
              </div>
            )
          ) : (
            <div className="search-b-empty">
              <Text size="sm" c="dimmed">
                Введите часть имени или email, чтобы отфильтровать список и календарь.
              </Text>
            </div>
          )}
        </Paper>
        <div className="search-b-main">
          <Group justify="space-between" align="center">
            <ModeControl mode={mode} onChange={onModeChange} />
            <Text size="sm" c="dimmed">
              {mode === "calendar" && !searching
                ? `На выбранный день: ${visible.length}`
                : countLabel}
            </Text>
          </Group>
          {mode === "calendar" ? (
            <Paper withBorder bg="white" className="owner-calendar-layout search-b-calendar">
              <MonthCalendar
                start={DEMO_TODAY}
                end={DEMO_END}
                markedDates={markedDates}
                date={selectedDate}
                onChange={onSelectedDate}
                legend="Есть встречи"
              />
              <section
                className="owner-agenda"
                aria-label={
                  searching ? "Совпадения на выбранный день" : "Встречи на выбранную дату"
                }
              >
                <Title order={3} size="h4" mb="lg">
                  {searching ? "Совпадения на выбранный день" : dayLabel(selectedDate)}
                </Title>
                {searching && matches.length === 0 ? (
                  <Text component="output" c="dimmed">
                    Ничего не найдено
                  </Text>
                ) : groups.length === 0 ? (
                  <Text component="output" c="dimmed">
                    {searching ? "На этот день совпадений нет" : "На этот день встреч нет"}
                  </Text>
                ) : (
                  <GroupedList groups={groups} query={query} />
                )}
              </section>
            </Paper>
          ) : (
            <section aria-label="Все предстоящие встречи">
              {searching && matches.length === 0 ? (
                <NoMatches />
              ) : (
                <GroupedList groups={groups} query={query} />
              )}
            </section>
          )}
        </div>
      </div>
    </Stack>
  );
}

function TimelineItem({ item, query }: { item: Booking; query: string }) {
  return (
    <article className="search-c-timeline-item">
      <div className="search-c-timeline-date">
        <Text size="xs" fw={650}>
          {SHORT_DAY_FORMAT.format(new Date(item.startsAt))}
        </Text>
        <Text size="xs" c="dimmed">
          {TIME_FORMAT.format(new Date(item.startsAt))}
        </Text>
      </div>
      <Paper p="md" radius="md" withBorder className="search-c-timeline-card">
        <Group justify="space-between" gap="sm" align="flex-start">
          <div>
            <Title order={4} size="md">
              <Highlight text={item.guestName} query={query} />
            </Title>
            <Text size="sm" c="dimmed">
              <Highlight text={item.guestEmail} query={query} />
            </Text>
          </div>
          <Badge variant="light" color="gray">
            {item.durationMinutes} мин
          </Badge>
        </Group>
        <Text size="sm" mt={8}>
          {item.meetingTypeTitle} · {dayLabel(dateKey(item.startsAt))} ·{" "}
          {TIME_FORMAT.format(new Date(item.startsAt))}–{TIME_FORMAT.format(new Date(item.endsAt))}
        </Text>
        {item.note && (
          <Text size="sm" c="dimmed" mt={4}>
            {item.note}
          </Text>
        )}
      </Paper>
    </article>
  );
}

function VariantC(props: VariantProps) {
  const {
    allItems,
    matches,
    query,
    onQueryChange,
    mode,
    onModeChange,
    selectedDate,
    onSelectedDate,
    onRefresh,
  } = props;
  const searching = query.trim().length > 0;
  const markedDates = searching ? datesWithItems(matches) : DEMO_DAYS;
  const selectedItems = itemsOnDay(allItems, selectedDate);

  return (
    <Stack className="search-proto-variant" gap="lg">
      <PageHeader onRefresh={onRefresh} />
      <Paper p="md" radius="lg" className="search-c-bar">
        <SearchInput
          value={query}
          onValueChange={onQueryChange}
          placeholder="Найти гостя по имени или email"
        />
        <Group justify="space-between" align="center" mt="md" className="search-c-mode-row">
          <ModeControl mode={mode} onChange={onModeChange} />
          <Text size="sm">
            {searching ? `Совпадений: ${matches.length}` : `Всего: ${allItems.length}`}
          </Text>
        </Group>
      </Paper>
      {searching ? (
        <section aria-label="Результаты поиска" className="search-c-search-mode">
          <Group justify="space-between" align="flex-start" mb="md">
            <div>
              <Badge color="orange" variant="light" mb={6}>
                Режим поиска
              </Badge>
              <Title order={3} size="h4">
                Совпадения: {matches.length}
              </Title>
            </div>
            <Text size="sm" c="dimmed">
              {mode === "calendar" ? "Календарь + все даты" : "Все даты списком"}
            </Text>
          </Group>
          {mode === "calendar" && (
            <Paper withBorder bg="white" radius="lg" className="search-c-calendar">
              <MonthCalendar
                start={DEMO_TODAY}
                end={DEMO_END}
                markedDates={markedDates}
                date={selectedDate}
                onChange={onSelectedDate}
                legend="Есть совпадения"
              />
            </Paper>
          )}
          {matches.length === 0 ? (
            <NoMatches />
          ) : (
            <div className="search-c-timeline">
              {matches.map((item) => (
                <TimelineItem key={item.id} item={item} query={query} />
              ))}
            </div>
          )}
        </section>
      ) : mode === "calendar" ? (
        <Paper withBorder bg="white" className="owner-calendar-layout">
          <MonthCalendar
            start={DEMO_TODAY}
            end={DEMO_END}
            markedDates={DEMO_DAYS}
            date={selectedDate}
            onChange={onSelectedDate}
            legend="Есть встречи"
          />
          <section className="owner-agenda" aria-label="Встречи на выбранную дату">
            <Title order={3} size="h4" mb="lg">
              {dayLabel(selectedDate)}
            </Title>
            {selectedItems.length === 0 ? (
              <Text component="output" c="dimmed">
                На этот день встреч нет
              </Text>
            ) : (
              <GroupedList groups={[[selectedDate, selectedItems]]} query={query} />
            )}
          </section>
        </Paper>
      ) : (
        <GroupedList groups={groupByDay(allItems)} query={query} />
      )}
    </Stack>
  );
}

export function UpcomingBookingsSearchPrototype() {
  const [variant, setVariant] = useState<VariantKey>(requestedVariant);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("list");
  const [selectedDate, setSelectedDate] = useState(DEMO_DAYS[0] ?? DEMO_TODAY);
  const [refreshes, setRefreshes] = useState(0);
  const [refreshNotice, setRefreshNotice] = useState("");
  const matches = useMemo(() => filterBookings(DEMO_ITEMS, query), [query]);

  const handleVariantChange = useCallback((next: string) => {
    const key: VariantKey = next === "b" || next === "c" ? next : "a";
    setVariant(key);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", key);
    window.history.replaceState(null, "", url);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshes((value) => value + 1);
    setRefreshNotice("Демо-список обновлён. Введённый запрос сохранён.");
  }, []);

  const shared: VariantProps = {
    allItems: DEMO_ITEMS,
    matches,
    query,
    onQueryChange: (value) => setQuery(value),
    mode,
    onModeChange: (next) => setMode(next),
    selectedDate,
    onSelectedDate: (date) => setSelectedDate(date),
    onRefresh: handleRefresh,
  };

  return (
    <Stack className="search-proto-page" gap="lg">
      <Paper p="md" radius="lg" withBorder className="prototype-banner">
        <Group justify="space-between" align="flex-start" gap="md" className="prototype-banner-top">
          <div>
            <Group gap="xs">
              <Badge color="yellow" variant="light">
                Прототип
              </Badge>
              <Text fw={650}>Поиск встреч по гостю</Text>
            </Group>
            <Text size="sm" c="dimmed" mt={4}>
              Безопасные демо-данные. API и постоянное хранение не затрагиваются.
            </Text>
          </div>
          <Group gap="xs" className="prototype-demo-actions">
            <Button
              size="xs"
              variant={query === "Анна" ? "filled" : "default"}
              onClick={() => setQuery("Анна")}
            >
              Совпадения
            </Button>
            <Button
              size="xs"
              variant={query === "Сергей" ? "filled" : "default"}
              onClick={() => setQuery("Сергей")}
            >
              Пустой результат
            </Button>
            <Button
              size="xs"
              variant={query === "" ? "filled" : "default"}
              onClick={() => setQuery("")}
            >
              Очистить
            </Button>
          </Group>
        </Group>
        <Text size="xs" c="dimmed" mt="sm" className="prototype-refresh-note" aria-live="polite">
          {refreshNotice
            ? `${refreshNotice} · обновлений: ${refreshes}`
            : "Демо-сценарии: «Анна» находит три записи, «Сергей» — пустой результат."}
        </Text>
      </Paper>
      {variant === "a" && <VariantA {...shared} />}
      {variant === "b" && <VariantB {...shared} />}
      {variant === "c" && <VariantC {...shared} />}
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={handleVariantChange} />
    </Stack>
  );
}
