import { Button } from "@/components/ui/button"
import { fullDateLabel } from "@/lib/recurrence"

interface Props {
  dates: string[]
  disabled: boolean
  onSkip: () => void
}

/** The dates a series' space is taken on, with the offer to skip them. */
export function SeriesConflictsAlert({ dates, disabled, onSkip }: Props) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
    >
      <p>El espacio está ocupado a esa hora en estas fechas:</p>
      <ul className="max-h-32 list-disc overflow-y-auto pl-5">
        {dates.map((date) => (
          <li key={date}>{fullDateLabel(date)}</li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={disabled}
        onClick={onSkip}
      >
        Omitir estas fechas
      </Button>
    </div>
  )
}
