# Календарь звонков

[![hexlet-check](https://github.com/lukyanzhukov/ai-for-developers-project-387/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/lukyanzhukov/ai-for-developers-project-387/actions)

Сервис записи на встречи с одним владельцем календаря. Учебный проект
[Хекслета](https://ru.hexlet.io/programs/ai-for-developers). [Исходное задание](https://files.hexlet.app/a/2ipc5m) · [Демо](https://call-calendar-386-o6lw.onrender.com)

## Сценарий записи на звонок

Владелец создаёт тип встречи в `/admin`. Гость в `/booking` выбирает тип и свободное время, вводит имя и email. Подтверждённая запись занимает время для всех типов встреч. Будущие встречи доступны владельцу в `/admin?view=bookings` со списком, календарём, поиском и фильтром по типу.

Записаться можно на ближайшие 14 календарных дней. Слоты начинаются каждые 15 минут по будням с 09:00 до 18:00 по Новокузнецку. Подробности модели описаны в [решении о доступности](docs/adr/0001-single-owner-and-shared-availability.md).

**Данные хранятся в памяти и теряются при перезапуске. Авторизации нет, админка и контакты гостей доступны всем. Используйте вымышленные данные и один экземпляр сервера.**

## Локальный запуск

Установите [mise](https://mise.jdx.dev/getting-started.html) и выполните:

```bash
git clone https://github.com/lukyanzhukov/ai-for-developers-project-387.git
cd ai-for-developers-project-387
mise trust
mise install
mise run dev
```

`mise install` установит инструменты, зависимости, Chromium для тестов и Git-хуки. После обновления зависимостей выполните `mise run install`. Интерфейс откроется на <http://127.0.0.1:5173>, API — на <http://127.0.0.1:3000>. Команды `mise run status`, `mise run logs` и `mise run stop` управляют фоновыми процессами. Локальные настройки храните в `mise.local.toml`. При смене порта обновите `ready_port` процесса.

## Разработка

- `mise run check` — полный набор проверок перед push и в CI.
- `mise run test` — сборка и тесты, включая Chromium.
- `mise run build` и `mise run start` — собранное приложение на порту 3000.
- `mise run generate` — обновление OpenAPI и SDK после правки [контракта TypeSpec](api/main.tsp). Изменения в [generated](generated/) входят в коммит.

Сервер на Fastify находится в [server](server/), интерфейс на React и Mantine — в [web](web/). Процесс работы, правила ревью и термины описаны в [AGENTS.md](AGENTS.md), [REVIEW.md](REVIEW.md) и [глоссарии](GLOSSARY.md).

## Агент в GitHub Actions

Владелец репозитория вызывает OpenCode App командой `/oc <задача>` или `/opencode <задача>` в комментарии к issue, PR или строке diff. Например, `/oc разбери обращение по скиллу triage, код пока не меняй`. Обе команды заданы в `mentions`. Публичные ссылки на сессии отключены. Параметр `share` в используемой версии OpenCode устарел, ответы остаются в обсуждениях GitHub.

| Workflow                    | Когда запускается                              | Модель по умолчанию             | Пример прогона                                                                                                    |
| --------------------------- | ---------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| OpenCode                    | Новый комментарий с командой                   | `opencode/big-pickle`           | [Реализация из issue #95](https://github.com/lukyanzhukov/ai-for-developers-project-387/actions/runs/44147650335) |
| Issue Triage                | Открытие issue                                 | `opencode/big-pickle`           | [Разбор #95](https://github.com/lukyanzhukov/ai-for-developers-project-387/actions/runs/44028389857)              |
| OpenCode PR Review          | Открытие, обновление или готовность PR к ревью | `opencode/mimo-v2.6-flash-free` | [Ревью #104](https://github.com/lukyanzhukov/ai-for-developers-project-387/actions/runs/44156156491)              |
| Service accessibility audit | Раз в сутки и вручную                          | `opencode/big-pickle`           | [Ручной запуск из main](https://github.com/lukyanzhukov/ai-for-developers-project-387/actions/runs/44168754068)   |

### Самооценка по #95 → #104

В #95 агент задал вопросы о фильтре встреч, подготовил спецификацию и разбил работу на два тикета. Я согласовал объём и запустил реализацию. В #104 агент восстановил текст подсказки по построчному комментарию, но на снимках я заметил, что она всё ещё стояла после фильтра. По общему комментарию агент перенёс её и добавил тест порядка элементов. Перед слиянием я посмотрел снимки и сверил проверки с финальным коммитом `50f50ed`. Для меня это показало, что в критериях приёмки стоит отдельно описывать, какие соседние элементы должны сохранить текст и положение. [Обращение #95](https://github.com/lukyanzhukov/ai-for-developers-project-387/issues/95) · [PR #104](https://github.com/lukyanzhukov/ai-for-developers-project-387/pull/104) · [Браузерная проверка](https://github.com/lukyanzhukov/ai-for-developers-project-387/actions/runs/44156156335) · [Проверка на базе и финальном коммите](https://github.com/lukyanzhukov/ai-for-developers-project-387/actions/runs/44157962979)

## Плановый аудит доступности

[Workflow](.github/workflows/service-audit.yml) запускается ежедневно в **09:47 по Новокузнецку** и вручную. Он собирает приложение из проверяемого коммита и запускает Lighthouse на локальном сервере GitHub runner. OpenCode анализирует результаты по `PROMPT` из workflow. Отдельный job публикует новые находки в Issues. Исходный отчёт и вывод агента доступны в `service-audit-report`, решения публикатора — в `service-audit-publication`.

```bash
gh workflow run service-audit.yml --ref main
```

- [Ручной запуск из main](https://github.com/lukyanzhukov/ai-for-developers-project-387/actions/runs/44168754068) выявил недостаточный контраст у 15 элементов и создал [#111](https://github.com/lukyanzhukov/ai-for-developers-project-387/issues/111).
- [Повтор на том же коммите](https://github.com/lukyanzhukov/ai-for-developers-project-387/actions/runs/44169260767) сохранил решение `skip` и ссылку на тот же issue.
- [Контрольный запуск после исправления](https://github.com/lukyanzhukov/ai-for-developers-project-387/actions/runs/44178421644) подтвердил `color-contrast = 1` и 0 нарушений.

Вывод владельца проекта. Я выбрал сборку на GitHub runner, потому что бесплатный Render может засыпать и задерживать ответ. Первый ручной прогон выявил расхождение портов. После исправления сервер и аудит используют порт из одного окружения mise.

## Справка

- [GitHub Actions и OpenCode](docs/agents/github-actions.md) — команды `/oc`, проверки PR, лимиты и релизы.
- [Эксплуатация и плановые аудиты](docs/operations.md) — Docker, Render, настройки Lighthouse, учебный режим и проверки TODO/FIXME и зависимостей.
- [История переноса репозитория](docs/migration/386-to-387.md).
