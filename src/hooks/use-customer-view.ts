import { useMemo } from "react"
import { NO_LEVELS } from "@/lib/activities/levels"
import type { LevelScale } from "@/lib/activities/levels"
import {
  ACTIVITY_TEMPLATES,
  activityProvides,
  getTemplate,
} from "@/lib/activities/templates"
import type {
  ActivitySummary,
  CustomerTextKey,
} from "@/lib/activities/templates"

// How the customers page and its drawer talk about one activity's customers:
// its words for them and, for activities with levels, the level scale.
export interface CustomerView {
  activity: ActivitySummary
  // NO_LEVELS when the activity has no levels.
  levelScale: LevelScale
  text: (key: CustomerTextKey) => string
}

export function useCustomerView(activity: ActivitySummary): CustomerView {
  return useMemo(() => {
    const template = getTemplate(activity.templateKey)
    const customers = (template ?? ACTIVITY_TEMPLATES[0]).customers
    return {
      activity,
      levelScale:
        (activityProvides(activity, "levels") && template?.levels) || NO_LEVELS,
      text: (key) => customers[key],
    }
  }, [activity])
}
