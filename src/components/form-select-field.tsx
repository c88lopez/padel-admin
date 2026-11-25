import type { Control, FieldPath, FieldValues } from "react-hook-form"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Props<T extends FieldValues> {
  control: Control<T>
  name: FieldPath<T>
  label: React.ReactNode
  placeholder: string
  options: { value: string; label: React.ReactNode }[]
  disabled?: boolean
  // Replaces the field's own onChange, e.g. to update related fields too.
  onValueChange?: (value: string) => void
}

/** A form field whose value is picked from a Select. */
export function FormSelectField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  options,
  disabled,
  onValueChange,
}: Props<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select
            onValueChange={onValueChange ?? field.onChange}
            value={field.value}
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
