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
  const { series, presets, customForDate, preview, rule } = recurrence
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="class-repeat">Repetir</Label>
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
                {presetLabel(preset)}
              </SelectItem>
            ))}
          {customForDate && (
            <SelectItem value="custom">
              {describeRule(customForDate)}
            </SelectItem>
          )}
          <SelectItem value={CUSTOMIZE}>Personalizar…</SelectItem>
        </SelectContent>
      </Select>
      {/* The select already shows the rule; this says what it creates. */}
      {preview && (
        <p className="text-sm text-muted-foreground">
          {preview.capped
            ? preview.count === 1
              ? `Primeros 12 meses: ${preview.count} clase`
              : `Primeros 12 meses: ${preview.count} clases`
            : preview.count === 1
              ? `Se creará ${preview.count} clase`
              : `Se crearán ${preview.count} clases`}
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
