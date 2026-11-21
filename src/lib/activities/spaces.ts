// Space types: the code-defined kinds of bookable place (court, studio, …).
// Activity templates say which types their spaces can be (`spaces.types`);
// each `space` row stores its type key. Labels come from the type, so padel
// says "Court 3" and pilates "Studio 1".

import type { TFunction } from "i18next"
import type { TranslationKey } from "@/lib/i18n"

export interface SpaceType {
  key: string
  // Singular noun, e.g. "Court" (form labels, the type picker).
  nameKey: TranslationKey
  // Numbered label with an `n` param, e.g. "Court {{n}}".
  labelKey: TranslationKey
  // English word new spaces are named with ("Court 3"). Stored names that
  // still follow this pattern are shown with the localized label instead.
  defaultName: string
}

export const SPACE_TYPES = [
  {
    key: "court",
    nameKey: "spaces.types.court.name",
    labelKey: "spaces.types.court.label",
    defaultName: "Court",
  },
  {
    key: "studio",
    nameKey: "spaces.types.studio.name",
    labelKey: "spaces.types.studio.label",
    defaultName: "Studio",
  },
] as const satisfies readonly SpaceType[]

export type SpaceTypeKey = (typeof SPACE_TYPES)[number]["key"]

// Label keys are picked at runtime, so bypass the per-key typed-params
// overload of `t` (as translateError does).
function translateLabel(t: TFunction, key: TranslationKey, n: string | number) {
  return (
    t as unknown as (key: string, params: { n: string | number }) => string
  )(key, { n })
}

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
 * type's localized label ("Pista 3"); names a club chose are left as-is.
 */
export function spaceDisplayName(
  space: { name: string; type: string },
  t: TFunction
): string {
  const n = defaultNameNumber(space)
  const type = getSpaceType(space.type)
  return n !== null && type ? translateLabel(t, type.labelKey, n) : space.name
}

/** A compact name for narrow columns: "# 3" for default names. */
export function spaceShortName(space: { name: string; type: string }): string {
  const n = defaultNameNumber(space)
  return n !== null ? `# ${n}` : space.name
}

/** The numbered label for a space by its number: "Court 3", "Studio 1". */
export function spaceNumberLabel(
  typeKey: string,
  n: number,
  t: TFunction
): string {
  const type = getSpaceType(typeKey)
  return type ? translateLabel(t, type.labelKey, n) : String(n)
}

/**
 * The noun for a list of spaces: the type's name when they all share one
 * ("Court"), else the generic "Space".
 */
export function spaceNounKey(
  spaces: readonly { type: string }[]
): TranslationKey {
  const types = new Set(spaces.map((s) => s.type))
  const only = types.size === 1 ? getSpaceType([...types][0]) : undefined
  return only?.nameKey ?? "spaces.name"
}
