# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the "Label in our tracker" column to match whatever vocabulary you actually use.

## Categories and workflow artifacts

Categories: `bug` for broken behavior; `enhancement` for new behavior.

| Label              | Artifact                                         | Automatic triage                    |
| ------------------ | ------------------------------------------------ | ----------------------------------- |
| `workflow:request` | Incoming user need and its discussion            | Yes, for trusted authors            |
| `workflow:spec`    | Specification published by `/to-spec`            | Skip                                |
| `workflow:ticket`  | Implementation ticket published by `/to-tickets` | Skip, even when blocked or reopened |

Unlabelled incoming issues are eligible too. `ready-for-agent` is also excluded
for compatibility with existing tickets. Artifact labels complement category/state
labels; they do not replace them. Apply artifact labels **when creating** an issue,
so the `issues.opened` event already carries the exclusion.

Trusted incoming authors: GitHub author associations `OWNER`, `MEMBER`,
`COLLABORATOR`, with account type `User`. Account age alone does not grant trust.
