import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function serviceUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.href !== `${url.origin}/`)
    throw new Error("Service audit requires a loopback HTTP origin");
  return url.href;
}

export function collectService(directory) {
  const url = serviceUrl(process.env.APP_URL);
  const exercise = process.env.SERVICE_AUDIT_EXERCISE === "true";
  const reportPath = join(directory, "lighthouse.json");
  if (exercise) {
    writeFileSync(
      reportPath,
      JSON.stringify({
        exercise: true,
        requestedUrl: url,
        finalDisplayedUrl: url,
        categories: {
          accessibility: { score: 0, auditRefs: [{ id: "html-has-lang", weight: 1 }] },
        },
        audits: {
          "html-has-lang": {
            score: 0,
            scoreDisplayMode: "binary",
            details: { items: [{ node: { selector: "html" } }] },
          },
        },
      }),
    );
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const accessibility = report.categories?.accessibility;
  const refs = accessibility?.auditRefs?.filter(({ weight }) => weight > 0);
  if (
    report.runtimeError ||
    report.requestedUrl !== url ||
    report.finalDisplayedUrl !== url ||
    !Number.isFinite(accessibility?.score) ||
    !refs?.length ||
    Boolean(report.exercise) !== exercise
  )
    throw new Error("Lighthouse did not complete an accessibility audit of the expected URL");
  const candidates = [];
  for (const { id } of refs) {
    const audit = report.audits?.[id];
    if (!audit || audit.scoreDisplayMode === "error")
      throw new Error(`Lighthouse did not complete accessibility check ${id}`);
    if (audit.score === 0 && audit.scoreDisplayMode === "binary") {
      const items = audit.details?.items ?? [];
      const selectors = items
        .map((item) => item.node?.selector)
        .filter((selector) => typeof selector === "string" && selector.length > 0)
        .slice(0, 3)
        .map((selector) => selector.slice(0, 250));
      candidates.push({ id, affectedNodes: items.length, selectors });
    }
  }
  return { url, exercise, candidates };
}

export function serviceReport(input, findings, runUrl, decisions = []) {
  const lines = [
    "# Аудит Call Calendar",
    "",
    input.exercise
      ? "Учебный отчёт Call Calendar с подготовленной находкой."
      : `Проверена главная страница сборки Call Calendar. Коммит \`${input.sha}\`.`,
    "",
    findings.some(({ confirmed }) => confirmed)
      ? "Подтверждённые находки перечислены ниже."
      : "Подтверждённых находок нет.",
    "",
    ...findings.flatMap(({ id, confirmed, reason, evidence, action }) => [
      `- \`${id}\` — ${confirmed ? "подтверждено" : "отклонено"}`,
      "",
      quote([reason, evidence, action].filter(Boolean).join("\n\n")),
      "",
    ]),
  ];
  if (runUrl) {
    lines.push("## Публикация", "", `[Прогон и отчёт Lighthouse](${runUrl})`, "");
    for (const { id, decision, issue } of decisions)
      lines.push(`- \`${id}\` — ${decision}${issue ? ` ([issue](${issue}))` : ""}`);
  }
  return `${lines.join("\n")}\n`;
}

const quote = (value) =>
  value
    .slice(0, 1500)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("@", "&#64;")
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");

export async function publishService(input, findings, issues, create, runUrl, record) {
  for (const finding of findings) {
    const key = createHash("sha256")
      .update(JSON.stringify([input.exercise, new URL(input.url).pathname, finding.id]))
      .digest("hex");
    const marker = `<!-- service-audit:${key} -->`;
    const existing = issues.find(
      (issue) => issue.body?.includes(marker) || issue.number === finding.duplicateOf,
    );
    if (!finding.confirmed || existing) {
      record({
        id: finding.id,
        decision: "skip",
        reason: existing ? "Находка уже зарегистрирована" : finding.reason,
        issue: existing?.html_url,
      });
      continue;
    }
    const candidate = input.candidates.find(({ id }) => id === finding.id);
    const prefix = input.exercise ? "[Учебный аудит]" : "[Аудит сервиса]";
    const issue = await create({
      title: `${prefix} ${finding.title}`.replace(/\s+/g, " ").slice(0, 256),
      labels: ["workflow:request", "needs-triage"],
      body: [
        input.exercise
          ? "Учебный отчёт Call Calendar с подготовленной находкой."
          : `Проверена главная страница сборки Call Calendar. Коммит \`${input.sha}\`.`,
        `Маршрут \`/\`. Проверка Lighthouse \`${candidate.id}\`. Найдено элементов: ${candidate.affectedNodes}.`,
        ...(candidate.selectors.length
          ? [`Примеры CSS-селекторов\n\n${quote(candidate.selectors.join("\n"))}`]
          : []),
        `### Проблема\n\n${quote(finding.evidence)}\n\n${quote(finding.reason)}`,
        `### Предлагаемое действие\n\n${quote(finding.action)}`,
        `[Прогон и исходный Lighthouse-отчёт в артефакте service-audit-report](${runUrl})`,
        marker,
      ].join("\n\n"),
    });
    record({
      id: finding.id,
      decision: "create",
      reason: "Новая подтверждённая находка",
      issue: issue.html_url,
    });
  }
}
