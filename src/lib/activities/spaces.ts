// Space types: the code-defined kinds of bookable place (court, studio, …).
// Activity templates say which types their spaces can be (`spaces.types`);
// each `space` row stores its type key. Labels come from the type, so padel
// says "Court 3" and pilates "Studio 1".

export interface SpaceType {
  key: string
  // Singular noun, e.g. "Pista" (form labels, the type picker).
  name: string
  // English word new spaces are named with ("Court 3"). Stored names that
  // still follow this pattern are shown as "<name> <n>" instead.
  defaultName: string
}

export const SPACE_TYPES = [
  {
    key: "court",
    name: "Pista",
    defaultName: "Court",
  },
  {
    key: "studio",
    name: "Sala",
    defaultName: "Studio",
  },
] as const satisfies readonly SpaceType[]

export type SpaceTypeKey = (typeof SPACE_TYPES)[number]["key"]

export function getSpaceType(key: string): SpaceType | undefined {
  return SPACE_TYPES.find((type) => type.key === key)
}

/** The stored name for a new space: "Court 3", "Studio 1", … */
export function defaultSpaceName(typeKey: string, n: number): string {
  return `${getSpaceType(typeKey)?.defaultName ?? "Space"} ${n}`
}

// The number in a default name ("Court 3" → "3"), or null for names a club
// chose.
function defaultNameNumber(space: {
  name: string
  type: string
}): string | null {
  const type = getSpaceType(space.type)
  if (!type) return null
  const match = new RegExp(`^${type.defaultName}\\s+(\\d+)$`, "i").exec(
    space.name
  )
  return match ? match[1] : null
}

/**
 * The name to show for a space. Default names ("Court 3") are shown with the
 * type's Spanish label ("Pista 3"); names a club chose are left as-is.
 */
export function spaceDisplayName(space: {
  name: string
  type: string
}): string {
  const n = defaultNameNumber(space)
  const type = getSpaceType(space.type)
  return n !== null && type ? `${type.name} ${n}` : space.name
}

/** A compact name for narrow columns: "# 3" for default names. */
export function spaceShortName(space: { name: string; type: string }): string {
  const n = defaultNameNumber(space)
  return n !== null ? `# ${n}` : space.name
}

/** The numbered label for a space by its number: "Pista 3", "Sala 1". */
export function spaceNumberLabel(typeKey: string, n: number): string {
  const type = getSpaceType(typeKey)
  return type ? `${type.name} ${n}` : String(n)
}

/**
 * The noun for a list of spaces: the type's name when they all share one
 * ("Pista"), else the generic "Espacio".
 */
export function spaceNoun(spaces: readonly { type: string }[]): string {
  const types = new Set(spaces.map((s) => s.type))
  const only = types.size === 1 ? getSpaceType([...types][0]) : undefined
  return only?.name ?? "Espacio"
}
