// Skill levels for activities with the "levels" block (e.g. padel C4–C8 for
// men, D4–D8 for women). Pure helpers shared by forms, charts and the server.

export type LevelGender = "Male" | "Female"

export interface LevelGroup {
  // Customers of this gender pick from this group; null = everyone.
  gender: LevelGender | null
  // Ordered from the most to the least advanced level.
  levels: readonly string[]
}

export interface LevelScale {
  groups: readonly LevelGroup[]
}

/** Levels a customer can hold, given their gender. */
export function levelsFor(
  scale: LevelScale,
  gender: LevelGender | null | undefined
): readonly string[] {
  return scale.groups
    .filter((group) => group.gender === null || group.gender === gender)
    .flatMap((group) => group.levels)
}

/** Every level of the scale, group by group. */
export function allLevels(scale: LevelScale): string[] {
  return scale.groups.flatMap((group) => group.levels)
}

/**
 * Position of a level within its group (0 = most advanced), or -1 when the
 * level isn't on the scale. Used to give matching levels across groups the
 * same chart color.
 */
export function levelRank(scale: LevelScale, level: string): number {
  for (const group of scale.groups) {
    const rank = group.levels.indexOf(level)
    if (rank !== -1) return rank
  }
  return -1
}

// For clubs whose activities have no levels.
export const NO_LEVELS: LevelScale = { groups: [] }

export const PADEL_LEVELS: LevelScale = {
  groups: [
    { gender: "Male", levels: ["C4", "C5", "C6", "C7", "C8"] },
    { gender: "Female", levels: ["D4", "D5", "D6", "D7", "D8"] },
  ],
}
