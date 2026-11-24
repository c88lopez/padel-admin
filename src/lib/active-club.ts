/**
 * Picks the club a club user acts within: the one they selected, when they
 * still belong to it, otherwise their default club (the first of `clubIds`).
 * Null when they belong to no club.
 */
export function chooseActiveClub(
  clubIds: readonly string[],
  selected: string | undefined
): string | null {
  if (selected && clubIds.includes(selected)) return selected
  return clubIds[0] ?? null
}
