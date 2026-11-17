import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  MultiSelect,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { MonthCalendar } from "./MonthCalendar.tsx";
import { useEffect, useState } from "react";
import { listBookings, listMeetingTypes } from "../generated/api/sdk.gen.ts";
import type { BookingList, MeetingType } from "../generated/api/types.gen.ts";

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function SearchGlyph() {
  return (
    <svg className="owner-search-glyph" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13.2 13.2 3.3 3.3" />
    </svg>
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

export function UpcomingBookings() {
  const [data, setData] = useState<BookingList>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [date, setDate] = useState("");
  const [mode, setMode] = useState("list");
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [types, setTypes] = useState<MeetingType[]>();
  const [typesError, setTypesError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void listBookings({
      throwOnError: true,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    })
      .then(({ data }) => {
        if (!controller.signal.aborted) setData(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    const controller = new AbortController();
    void listMeetingTypes({
      throwOnError: true,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    })
      .then(({ data }) => {
        if (!controller.signal.aborted) {
          setTypes(data.items);
          setTypesError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setTypesError(true);
      });
    return () => controller.abort();
  }, []);

  const dateKey = (instant: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: data?.timeZone ?? "Asia/Novokuznetsk",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(instant));
  const today = data ? dateKey(data.serverNow) : "";
  const allItems = data?.items ?? [];
  const typeCounts = new Map<string, number>();
  for (const item of allItems) {
    typeCounts.set(item.meetingTypeId, (typeCounts.get(item.meetingTypeId) ?? 0) + 1);
  }
  const typeOptions = [...(types ?? [])]
    .sort((a, b) => {
      const aActive = (typeCounts.get(a.id) ?? 0) > 0 || selectedTypeIds.includes(a.id);
      const bActive = (typeCounts.get(b.id) ?? 0) > 0 || selectedTypeIds.includes(b.id);
      return Number(bActive) - Number(aActive) || a.title.localeCompare(b.title, "ru");
    })
    .map((type) => {
      const count = typeCounts.get(type.id) ?? 0;
      const selected = selectedTypeIds.includes(type.id);
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
  const allDates = allItems.map((item) => dateKey(item.startsAt));
  const lastDate = allDates.at(-1) ?? today;
  const endOfMonth = data ? new Date(`${lastDate.slice(0, 7)}-01T12:00:00Z`) : undefined;
  endOfMonth?.setUTCMonth(endOfMonth.getUTCMonth() + 1);
  endOfMonth?.setUTCDate(0);
  const end = endOfMonth?.toISOString().slice(0, 10) ?? "";
  const selectedDate = date >= today && date <= end ? date : (allDates[0] ?? today);
  const needle = normalize(query);
  const searching = needle.length > 0;
  const filtering = selectedTypeIds.length > 0;
  const hasCondition = searching || filtering;
  const matches = allItems.filter(
    (item) =>
      (!filtering || selectedTypeIds.includes(item.meetingTypeId)) &&
      (!searching ||
        normalize(item.guestName).includes(needle) ||
        normalize(item.guestEmail).includes(needle)),
  );
  const meetings =
    mode === "calendar" && !hasCondition
      ? matches.filter((item) => dateKey(item.startsAt) === selectedDate)
      : matches;
  const markedDates = hasCondition
    ? [...new Set(matches.map((item) => dateKey(item.startsAt)))]
    : allDates;
  const counts = new Map<string, number>();
  for (const item of meetings) {
    const day = dateKey(item.startsAt);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const countLabel = hasCondition
    ? `Совпадений: ${matches.length}`
    : mode === "list"
      ? `Всего: ${meetings.length}`
      : `На выбранный день: ${meetings.length}`;
  const dayLabel = (day: string) => {
    const label = new Intl.DateTimeFormat("ru-RU", {
      weekday: day === today ? undefined : "long",
      day: "numeric",
      month: "long",
      year: day.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
      timeZone: "UTC",
    }).format(new Date(`${day}T12:00:00Z`));
    return day === today ? `Сегодня · ${label}` : label;
  };

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
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setError(false);
            setAttempt((value) => value + 1);
          }}
        >
          {error ? "Повторить" : "Обновить"}
        </Button>
      </Group>
      <Paper withBorder p="lg" radius="lg" className="owner-search-field">
        <TextInput
          aria-label="Поиск по имени или email"
          placeholder="Имя или email гостя"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              setQuery("");
            }
          }}
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
          data={typeOptions}
          value={selectedTypeIds}
          onChange={setSelectedTypeIds}
          clearable
          searchable
          disabled={typesError && !types}
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
          {data && (
            <Text size="xs" fw={600} className="owner-search-count">
              {countLabel}
            </Text>
          )}
        </Group>
      </Paper>
      <Group justify="space-between">
        <SegmentedControl
          className="owner-view-toggle"
          radius="xl"
          color="dark"
          aria-label="Режим просмотра"
          value={mode}
          onChange={setMode}
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
        {data && (
          <Text size="sm" c="dimmed">
            {countLabel}
          </Text>
        )}
      </Group>
      {loading && <Text component="output">Загрузка встреч…</Text>}
      {error && (
        <Alert role="alert" color="red">
          {data
            ? "Не удалось обновить встречи. Показан ранее загруженный список; данные могли устареть."
            : "Не удалось загрузить встречи. Попробуйте ещё раз."}
        </Alert>
      )}
      {data && (
        <Paper
          withBorder={mode === "calendar"}
          bg={mode === "calendar" ? "white" : "transparent"}
          className={mode === "calendar" ? "owner-calendar-layout" : undefined}
        >
          {mode === "calendar" && (
            <MonthCalendar
              start={today}
              end={end}
              markedDates={markedDates}
              date={selectedDate}
              onChange={setDate}
              legend="Есть встречи"
            />
          )}
          <section
            className={mode === "calendar" ? "owner-agenda" : "owner-list"}
            aria-label={
              mode === "calendar"
                ? hasCondition
                  ? "Все совпадения"
                  : "Встречи на выбранную дату"
                : "Все предстоящие встречи"
            }
          >
            {mode === "calendar" && (
              <Title order={3} size="h4" mb="lg">
                {hasCondition ? "Совпадения по всем датам" : dayLabel(selectedDate)}
              </Title>
            )}
            {meetings.length === 0 ? (
              hasCondition ? (
                <Text component="output" c="dimmed" className="owner-search-empty">
                  Ничего не найдено
                </Text>
              ) : (
                <Text component="output" c="dimmed">
                  {data.items.length ? "На этот день встреч нет" : "Предстоящих встреч пока нет"}
                </Text>
              )
            ) : (
              <Stack
                component="ul"
                aria-label="Предстоящие встречи"
                p={0}
                m={0}
                style={{ listStyle: "none" }}
              >
                {meetings.map((item, index) => {
                  const start = new Date(item.startsAt);
                  const end = new Date(item.endsAt);
                  const serverNow = Date.parse(data.serverNow);
                  const time = new Intl.DateTimeFormat("ru-RU", {
                    timeZone: data.timeZone,
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <li key={item.id}>
                      {(mode === "list" || hasCondition) &&
                        (index === 0 ||
                          dateKey(meetings[index - 1].startsAt) !== dateKey(item.startsAt)) && (
                          <Group justify="space-between" className="owner-date-heading">
                            <Title order={3} size="md">
                              {dayLabel(dateKey(item.startsAt))}
                            </Title>
                            <Text size="xs" c="dimmed">
                              Записей: {counts.get(dateKey(item.startsAt))}
                            </Text>
                          </Group>
                        )}
                      <Paper p="lg" radius="md" withBorder className="owner-booking-card">
                        <Text size="sm" fw={600} className="owner-booking-time">
                          <time dateTime={item.startsAt}>{time.format(start)}</time>–
                          <time dateTime={item.endsAt}>{time.format(end)}</time>
                        </Text>
                        <Stack gap={6}>
                          <Group gap="xs">
                            <Title order={4} size="md">
                              {item.meetingTypeTitle}
                            </Title>
                            {start.getTime() <= serverNow && serverNow < end.getTime() && (
                              <Badge color="teal" size="sm">
                                Идёт сейчас
                              </Badge>
                            )}
                          </Group>
                          <Text size="sm">
                            <Highlight text={item.guestName} query={query} /> ·{" "}
                            {item.durationMinutes} мин
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
                    </li>
                  );
                })}
              </Stack>
            )}
          </section>
        </Paper>
      )}
    </Stack>
  );
}
