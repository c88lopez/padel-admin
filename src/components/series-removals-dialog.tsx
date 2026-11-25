import { useTranslation } from "react-i18next"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export interface SeriesRemovals {
  classes: number
  signUps: number
}

interface Props {
  // Open while set: what a series edit would remove.
  removals: SeriesRemovals | null
  onCancel: () => void
  onConfirm: () => void
}

/** Asks before a series edit removes classes (and their sign-ups). */
export function SeriesRemovalsDialog({ removals, onCancel, onConfirm }: Props) {
  const { t } = useTranslation()
  return (
    <AlertDialog
      open={!!removals}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("recurrence.removeConfirm.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("recurrence.removeConfirm.description", {
              classes: removals?.classes ?? 0,
              signUps: removals?.signUps ?? 0,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t("recurrence.removeConfirm.action")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
