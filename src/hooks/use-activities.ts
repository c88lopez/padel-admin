import { getRouteApi } from "@tanstack/react-router"
import { getTemplate, primaryActivity } from "@/lib/activities/templates"
import type { ActivitySummary } from "@/lib/activities/templates"
import type { LevelScale } from "@/lib/activities/levels"

const authenticatedRoute = getRouteApi("/_authenticated")

/** The active club's activities, loaded once by the authenticated layout. */
export function useClubActivities(): ActivitySummary[] {
  return authenticatedRoute.useLoaderData().clubContext.activities
}

/** Level scale of the club's primary "levels" activity (padel), if any. */
export function usePrimaryLevelScale(): LevelScale | undefined {
  const activity = primaryActivity(useClubActivities(), "levels")
  return activity ? getTemplate(activity.templateKey)?.levels : undefined
}
