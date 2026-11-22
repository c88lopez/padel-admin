import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { NO_LEVELS } from "@/lib/activities/levels"
import type { LevelScale } from "@/lib/activities/levels"
import {
  activityProvides,
  customerTextKey,
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
  const { t } = useTranslation()
  return useMemo(() => {
    const template = getTemplate(activity.templateKey)
    const customersKey = template?.customersKey ?? "activities.padel.customers"
    return {
      activity,
      levelScale:
        (activityProvides(activity, "levels") && template?.levels) || NO_LEVELS,
      text: (key) => t(customerTextKey({ customersKey }, key)),
    }
  }, [activity, t])
}
