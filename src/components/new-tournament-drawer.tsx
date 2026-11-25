import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodFormResolver } from "@/lib/form"
import { z } from "zod"
import { format } from "date-fns"
import { toast } from "sonner"
import { IconCalendar } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { DrawerSubmitButton } from "@/components/drawer-submit-button"
import { useSubmitLifecycle } from "@/hooks/use-submit-lifecycle"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { allLevels } from "@/lib/activities/levels"
import type { LevelScale } from "@/lib/activities/levels"
import { cn } from "@/lib/utils"
import { createTournament, updateTournament } from "@/lib/tournaments.functions"

const TOURNAMENT_FORMATS = [
  "round_robin",
  "elimination",
  "double_elimination",
] as const

type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number]

function makeSchema() {
  return z.object({
    name: z.string().min(1, "El nombre es obligatorio"),
    date: z.date({ error: "La fecha es obligatoria" }),
    category: z.string().min(1, "La categoría es obligatoria"),
    format: z.enum(TOURNAMENT_FORMATS, {
      error: "El formato es obligatorio",
    }),
    maxTeams: z.coerce.number().int().min(2, "Se requieren al menos 2 equipos"),
  })
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>
type FormInput = Omit<FormValues, "date" | "format"> & {
  date?: Date
  format?: TournamentFormat
}

export interface TournamentData {
  name: string
  date: Date
  category: string
  format: TournamentFormat
  maxTeams: number
}

interface Props {
  // Levels offered as tournament categories (the club's levels activity).
  levelScale: LevelScale
  trigger?: React.ReactNode
  tournament?: TournamentData & { id?: string }
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: () => void
}

function defaults(tournament?: TournamentData): FormInput {
  return {
    name: tournament?.name ?? "",
    date: tournament?.date,
    category: tournament?.category ?? "",
    format: tournament?.format,
    maxTeams: tournament?.maxTeams ?? 8,
  }
}

export function NewTournamentDrawer({
  levelScale,
  trigger,
  tournament,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onSaved,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = controlledOnOpenChange ?? setInternalOpen
  const isEditing = !!tournament

  const { status, progress, run, reset, schedule } = useSubmitLifecycle()
  const schema = useMemo(() => makeSchema(), [])

  const form = useForm<FormInput>({
    resolver: zodFormResolver<FormInput>(schema),
    defaultValues: defaults(tournament),
  })

  useEffect(() => {
    if (open) {
      form.reset(defaults(tournament))
      reset()
    }
  }, [open, tournament, form, reset])

  function onSubmit(values: FormInput) {
    const payload = {
      name: values.name,
      date: format(values.date as Date, "yyyy-MM-dd"),
      category: values.category,
      format: values.format as TournamentFormat,
      maxTeams: values.maxTeams,
    }
    run({
      action: () =>
        tournament?.id
          ? updateTournament({ data: { id: tournament.id, ...payload } })
          : createTournament({ data: payload }),
      onSuccess: () => {
        toast.success(isEditing ? "Torneo actualizado" : "Torneo creado", {
          description: `${values.name} se ha guardado correctamente.`,
        })
        onSaved?.()
        schedule(() => setOpen(false), 900)
      },
      onError: () => {
        toast.error("Algo salió mal", {
          description: "No se pudo guardar el torneo. Inténtalo de nuevo.",
        })
      },
    })
  }

  return (
    <Drawer direction="right" open={open} onOpenChange={setOpen}>
      {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            {isEditing ? "Editar torneo" : "Nuevo torneo"}
          </DrawerTitle>
        </DrawerHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-2"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del torneo</FormLabel>
                  <FormControl>
                    <Input placeholder="p. ej. Summer Open 2026" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha</FormLabel>
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
                          {field.value
                            ? format(field.value, "PPP")
                            : "Elige una fecha"}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date < new Date(new Date().setHours(0, 0, 0, 0))
                        }
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona la categoría" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {[...allLevels(levelScale), "Mixed"].map((c) => (
                        <SelectItem key={c} value={c}>
                          {c === "Mixed" ? "Mixto" : c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="format"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Formato</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona el formato" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="round_robin">
                        Todos contra todos
                      </SelectItem>
                      <SelectItem value="elimination">
                        Eliminación simple
                      </SelectItem>
                      <SelectItem value="double_elimination">
                        Eliminación doble
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maxTeams"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Máx. de equipos</FormLabel>
                  <FormControl>
                    <Input type="number" min="2" placeholder="8" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DrawerFooter className="px-0 pt-4">
              <DrawerSubmitButton
                status={status}
                progress={progress}
                label={isEditing ? "Guardar cambios" : "Crear torneo"}
              />
              <DrawerClose asChild>
                <Button variant="outline" disabled={status === "submitting"}>
                  Cancelar
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </form>
        </Form>
      </DrawerContent>
    </Drawer>
  )
}
