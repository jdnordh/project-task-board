/** Shapes of the achievements API. */

export interface AchievementView {
  id: string
  hidden: boolean
  name: string | null
  desc: string | null
  clue: string | null
  points: number
  goal: number | null
  progress: number | null
  unlocked_at: string | null
  seen: boolean
}

export interface QueueEntry {
  id: string
  name: string
  points: number
  hidden: boolean
  camos: string[]
}

export interface Hint {
  id: string
  clue: string
  progress: number
  goal: number
  day: string
}

export interface AchievementsPayload {
  points: number
  total_points: number
  camos: string[]
  achievements: AchievementView[]
  queue: QueueEntry[]
  new?: string[]
  hint?: Hint | null
}
