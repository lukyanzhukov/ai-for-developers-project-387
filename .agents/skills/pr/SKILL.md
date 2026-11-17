---
name: pr
description: "Use when writing a PR body."
metadata:
  credits:
    skill: show-me
    author: Dex Horthy
    organisation: Humanlayer
    url: "https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md"
---

Use the repository's [.github/pull_request_template.md](../../../.github/pull_request_template.md) as the canonical PR body template. Write briefly in Russian and use the project's domain terms.

1. Lead with the user's problem and resulting behavior. Link the source request, approved specification, implementation tickets, design when applicable, and the actual human scope-approval comment. For infrastructure, use the authorized infrastructure issue; do not invent a product specification or human approval.
2. State exact commands and Actions URLs for the current head SHA, their actual results and unavailable checks. For behavior changes, link evidence of the regression test failing on base and passing on head when available. Link the independent browser artifact and its full SHA. A previous SHA's result is not current evidence.
3. Explain why that depth of testing fits the consequences of error. Name concrete risks to behavior/data/contracts and a usable rollback procedure, including additional data or configuration actions where necessary.
4. Keep user acceptance separate from automated checks. Mark it passed only after the user reports that result. Address review comments by fixing the same branch or explaining why a requested change is unnecessary; do not rewrite published history.

Keep each section proportionate to the change. Simple documentation changes may need only text/link/format checks, but still explain their risk and rollback. A small diff/tree/diagram is useful only when it makes the change clearer.
