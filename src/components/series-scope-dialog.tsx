import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

/** Calendar's "This event / This and following / All events" choice. */
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
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
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("common.cancel")}</Button>
          </DialogClose>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              onOpenChange(false)
              onConfirm(scope)
            }}
          >
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
