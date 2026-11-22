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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  describeRule,
  isoWeekday,
  monthlyOptionLabel,
  monthlyOptions,
} from "@/lib/recurrence"
import type {
  Frequency,
  MonthlyBy,
  RecurrenceRule,
  Weekday,
} from "@/lib/recurrence"

const FREQUENCIES: Frequency[] = ["daily", "weekly", "monthly", "yearly"]
const WEEKDAYS = [
  [1, "mon"],
  [2, "tue"],
  [3, "wed"],
  [4, "thu"],
  [5, "fri"],
  [6, "sat"],
  [7, "sun"],
] as const

type Ends = "never" | "until" | "count"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  startDate: string
  // The rule to start from (the current choice), if any.
  initial: RecurrenceRule | null
  onSave: (rule: RecurrenceRule) => void
}

/** Calendar's "Custom recurrence" dialog. */
export function RecurrenceDialog({
  open,
  onOpenChange,
  startDate,
  initial,
  onSave,
}: Props) {
  const { t } = useTranslation()
  const [frequency, setFrequency] = useState<Frequency>("weekly")
  const [intervalText, setIntervalText] = useState("1")
  const [weekdays, setWeekdays] = useState<Weekday[]>([])
  const [monthlyBy, setMonthlyBy] = useState<MonthlyBy>("day_of_month")
  const [ends, setEnds] = useState<Ends>("never")
  const [until, setUntil] = useState("")
  const [count, setCount] = useState("10")

  useEffect(() => {
    if (!open) return
    setFrequency(initial?.frequency ?? "weekly")
    setIntervalText(String(initial?.interval ?? 1))
    setWeekdays(
      initial?.weekdays.length ? initial.weekdays : [isoWeekday(startDate)]
    )
    setMonthlyBy(initial?.monthlyBy ?? "day_of_month")
    setEnds(initial?.until ? "until" : initial?.count ? "count" : "never")
    setUntil(initial?.until ?? "")
    setCount(String(initial?.count ?? 10))
  }, [open, initial, startDate])

  const intervalN = Number(intervalText)
  const countN = Number(count)
  const valid =
    Number.isInteger(intervalN) &&
    intervalN >= 1 &&
    intervalN <= 99 &&
    (ends !== "until" || until >= startDate) &&
    (ends !== "count" ||
      (Number.isInteger(countN) && countN >= 1 && countN <= 1000))

  const rule: RecurrenceRule | null = valid
    ? {
        frequency,
        interval: intervalN,
        weekdays: frequency === "weekly" ? weekdays : [],
        monthlyBy: frequency === "monthly" ? monthlyBy : null,
        startDate,
        until: ends === "until" ? until : null,
        count: ends === "count" ? countN : null,
        exdates: initial?.exdates ?? [],
      }
    : null

  // At least one weekday stays on, as in Calendar.
  function toggleWeekday(day: Weekday) {
    setWeekdays((current) =>
      current.includes(day)
        ? current.length > 1
          ? current.filter((d) => d !== day)
          : current
        : [...current, day]
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("recurrence.customDialog.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="recurrence-interval">
              {t("recurrence.customDialog.repeatEvery")}
            </Label>
            <div className="flex gap-2">
              <Input
                id="recurrence-interval"
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                className="w-20"
                value={intervalText}
                onChange={(e) => setIntervalText(e.target.value)}
              />
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as Frequency)}
              >
                <SelectTrigger
                  className="flex-1"
                  aria-label={t("recurrence.repeat")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {t(`recurrence.units.${f}`, {
                        count: intervalN || 1,
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {frequency === "weekly" && (
            <div className="flex flex-col gap-2">
              <Label>{t("recurrence.customDialog.repeatOn")}</Label>
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.map(([day, key]) => (
                  <Button
                    key={day}
                    type="button"
                    size="sm"
                    variant={weekdays.includes(day) ? "default" : "outline"}
                    aria-pressed={weekdays.includes(day)}
                    aria-label={t(`recurrence.weekdays.${key}`)}
                    className="min-w-11"
                    onClick={() => toggleWeekday(day)}
                  >
                    {t(`recurrence.weekdaysShort.${key}`)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {frequency === "monthly" && (
            <Select
              value={monthlyBy}
              onValueChange={(v) => setMonthlyBy(v as MonthlyBy)}
            >
              <SelectTrigger aria-label={t("recurrence.customDialog.repeatOn")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthlyOptions(startDate).map((by) => (
                  <SelectItem key={by} value={by}>
                    {monthlyOptionLabel(by, startDate, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex flex-col gap-2">
            <Label>{t("recurrence.customDialog.ends")}</Label>
            <RadioGroup
              value={ends}
              onValueChange={(v) => setEnds(v as Ends)}
              className="gap-2"
            >
              <div className="flex h-9 items-center gap-3">
                <RadioGroupItem value="never" id="recurrence-ends-never" />
                <Label htmlFor="recurrence-ends-never" className="font-normal">
                  {t("recurrence.customDialog.never")}
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <RadioGroupItem value="until" id="recurrence-ends-until" />
                <Label
                  htmlFor="recurrence-ends-until"
                  className="w-20 font-normal"
                >
                  {t("recurrence.customDialog.onDate")}
                </Label>
                <Input
                  type="date"
                  aria-label={t("recurrence.customDialog.onDate")}
                  min={startDate}
                  className="flex-1"
                  disabled={ends !== "until"}
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <RadioGroupItem value="count" id="recurrence-ends-count" />
                <Label
                  htmlFor="recurrence-ends-count"
                  className="w-20 font-normal"
                >
                  {t("recurrence.customDialog.after")}
                </Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  aria-label={t("recurrence.customDialog.after")}
                  min={1}
                  max={1000}
                  className="w-20"
                  disabled={ends !== "count"}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
                <span
                  className={cn(
                    "text-sm",
                    ends !== "count" && "text-muted-foreground"
                  )}
                >
                  {t("recurrence.customDialog.occurrences", {
                    count: countN || 0,
                  })}
                </span>
              </div>
            </RadioGroup>
          </div>

          {rule && (
            <p className="text-sm text-muted-foreground">
              {describeRule(rule, t)}
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("common.cancel")}</Button>
          </DialogClose>
          <Button
            disabled={!rule}
            onClick={() => {
              if (!rule) return
              onSave(rule)
              onOpenChange(false)
            }}
          >
            {t("recurrence.customDialog.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
