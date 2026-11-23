# Source: projects

## Title
Projects

## Needs
`list_projects` (grove-buddy), plus what the Meetings source found.

## Skip when
`Projects: skipped — <reason>`.

## Gather
1. `list_projects`. Ignore completed projects. No more calls.

## Write
- Flag projects with **0 open tasks** (ignore ones that look like tests or experiments).
- Flag projects **talked about in a recent note with no task for that talk** (from the Meetings source).
- At most 4 flags. Each flag can become a suggestion: "Plan work for <Project>".
