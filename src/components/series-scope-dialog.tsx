import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { SeriesScope } from "@/lib/classes.functions"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  actionLabel: string
  destructive?: boolean
  // Off when the repeat itself changed, which one class can't take.
  allowThis?: boolean
  onConfirm: (scope: SeriesScope) => void
}

/**
 * Calendar's "This event / This and following / All events" choice. An alert
 * dialog, which nothing outside dismisses: opened from a row's menu, a plain
 * dialog can close itself as the menu hands focus back to its trigger.
 */
export function SeriesScopeDialog({
  open,
  onOpenChange,
  title,
  actionLabel,
  destructive = false,
  allowThis = true,
  onConfirm,
}: Props) {
  const { t } = useTranslation()
  const [scope, setScope] = useState<SeriesScope>("this")

  useEffect(() => {
    if (open) setScope(allowThis ? "this" : "following")
  }, [open, allowThis])

  const options = (["this", "following", "all"] as const).filter(
    (s) => allowThis || s !== "this"
  )

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent aria-describedby={undefined}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
        </AlertDialogHeader>
        <RadioGroup
          value={scope}
          onValueChange={(v) => setScope(v as SeriesScope)}
        >
          {options.map((option) => (
            <div key={option} className="flex items-start gap-3">
              <RadioGroupItem
                value={option}
                id={`series-scope-${option}`}
                className="mt-0.5"
              />
              <div className="flex flex-col gap-0.5">
                <Label
                  htmlFor={`series-scope-${option}`}
                  className="font-normal"
                >
                  {t(`recurrence.scope.${option}`)}
                </Label>
                {option === "all" && (
                  <p className="text-xs text-muted-foreground">
                    {t("recurrence.scope.allHint")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </RadioGroup>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={
              destructive
                ? "text-destructive-foreground bg-destructive hover:bg-destructive/90"
                : undefined
            }
            onClick={() => onConfirm(scope)}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
