# Source: unfinished work

## Title
Unfinished work

## Needs
`list_tasks`, `list_claude_tasks` (grove-buddy).

## Skip when
`Unfinished work: skipped — <reason>`.

## Gather
1. `list_tasks {status: ["progress", "claude", "blocked"]}`
2. `list_tasks {overdue: true}`
3. `list_claude_tasks`

## Write
- At most 6 lines, grouped: **Waiting on you** (worker `question`/`review`, or `complete` with a report to
  pull) / **Blocked** / **Overdue** / **In progress**.
- Suggestions: answer a question, review, pull a report, unblock a card, reschedule an overdue card.
