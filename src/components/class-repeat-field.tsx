import { useTranslation } from "react-i18next"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RecurrenceDialog } from "@/components/recurrence-dialog"
import { CUSTOMIZE } from "@/hooks/use-class-recurrence"
import type { ClassRecurrence } from "@/hooks/use-class-recurrence"
import { describeRule, presetLabel } from "@/lib/recurrence"

interface Props {
  recurrence: ClassRecurrence
  startDate: string | null
}

/** The class drawer's Repeat select, with its Custom… dialog. */
export function ClassRepeatField({ recurrence, startDate }: Props) {
  const { t } = useTranslation()
  const { series, presets, customForDate, preview, rule } = recurrence
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="class-repeat">{t("recurrence.repeat")}</Label>
      <Select
        value={recurrence.repeat}
        onValueChange={recurrence.changeRepeat}
        disabled={!startDate}
      >
        <SelectTrigger id="class-repeat">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presets
            .filter((preset) => !series || preset.rule)
            .map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {presetLabel(preset, t)}
              </SelectItem>
            ))}
          {customForDate && (
            <SelectItem value="custom">
              {describeRule(customForDate, t)}
            </SelectItem>
          )}
          <SelectItem value={CUSTOMIZE}>{t("recurrence.custom")}</SelectItem>
        </SelectContent>
      </Select>
      {/* The select already shows the rule; this says what it creates. */}
      {preview && (
        <p className="text-sm text-muted-foreground">
          {preview.capped
            ? t("recurrence.firstYearCount", { count: preview.count })
            : t("recurrence.classCount", { count: preview.count })}
        </p>
      )}
      {startDate && (
        <RecurrenceDialog
          open={recurrence.customOpen}
          onOpenChange={recurrence.setCustomOpen}
          startDate={startDate}
          initial={rule}
          onSave={recurrence.saveCustom}
        />
      )}
    </div>
  )
}
