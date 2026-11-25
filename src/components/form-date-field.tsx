import { format } from "date-fns"
import { IconCalendar } from "@tabler/icons-react"
import type { Control, FieldPath, FieldValues } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface Props<T extends FieldValues> {
  control: Control<T>
  name: FieldPath<T>
  label: React.ReactNode
  // Days that can't be picked.
  disabledDates?: (date: Date) => boolean
}

/** A form field whose Date value is picked from a calendar popover. */
export function FormDateField<T extends FieldValues>({
  control,
  name,
  label,
  disabledDates,
}: Props<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Popover>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !field.value && "text-muted-foreground"
                  )}
                >
                  <IconCalendar className="mr-2 size-4" />
                  {field.value ? format(field.value, "PPP") : "Elige una fecha"}
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={field.value}
                onSelect={field.onChange}
                disabled={disabledDates}
              />
            </PopoverContent>
          </Popover>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
