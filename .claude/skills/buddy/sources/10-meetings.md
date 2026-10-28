# Source: meetings

## Title
Meetings

## Needs
`search_meeting_notes`, `get_meeting_note` (grove-buddy).

## Skip when
`Meetings: skipped — <reason>` (for example "Grove is not running" or "no notes in the last 14 days").

## Gather
1. `search_meeting_notes {}` — the last 14 days by meeting date.
2. `get_meeting_note` for up to 4 notes that have open action items (newest first).
3. Collect up to 8 open `[ ]` items. Remember each note's feature tag, and any feature names mentioned in
   the note text: the Features source uses them.

## Write
- At most 5 lines: `<date> · <title> [Feature] — open: "<item>"`.
- Suggestion **"Make a task: <item>"** for an open item that no open task already covers (compare with the
  Unfinished-work source's task lines). Several items in one note on one topic → one suggestion.
