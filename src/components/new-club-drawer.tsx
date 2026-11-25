import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodFormResolver } from "@/lib/form"
import { errorMessage } from "@/lib/errors"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

function makeSchema() {
  return z.object({
    name: z.string().min(1, "El nombre es obligatorio"),
    status: z.enum(["active", "inactive"]),
  })
}

type FormInput = z.infer<ReturnType<typeof makeSchema>>

export interface ClubFormData {
  name: string
  status: "active" | "inactive"
}

interface Props {
  trigger?: React.ReactNode
  club?: ClubFormData
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSave?: (data: ClubFormData) => Promise<void>
}

export function NewClubDrawer({
  trigger,
  club,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onSave,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = controlledOnOpenChange ?? setInternalOpen
  const isEditing = !!club

  const { status, progress, run, reset, schedule } = useSubmitLifecycle()
  const schema = useMemo(() => makeSchema(), [])

  const blankClub: FormInput = { name: "", status: "active" }
  const form = useForm<FormInput>({
    resolver: zodFormResolver<FormInput>(schema),
    defaultValues: club ?? blankClub,
  })

  useEffect(() => {
    if (open) {
      form.reset(club ?? blankClub)
      reset()
    }
  }, [open, club])

  function onSubmit(values: FormInput) {
    run({
      action: () => onSave?.(values) ?? Promise.resolve(),
      onSuccess: () => {
        toast.success(isEditing ? "Club actualizado" : "Club creado", {
          description: `${values.name} se ha guardado correctamente.`,
        })
        schedule(() => setOpen(false), 900)
      },
      onError: (error) => {
        toast.error("No se pudo guardar el club", {
          description: errorMessage(
            error,
            "No se pudo guardar el club. Inténtalo de nuevo."
          ),
        })
      },
    })
  }

  return (
    <Drawer direction="right" open={open} onOpenChange={setOpen}>
      {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{isEditing ? "Editar club" : "Nuevo club"}</DrawerTitle>
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
                  <FormLabel>Nombre del club</FormLabel>
                  <FormControl>
                    <Input placeholder="p. ej. Riverside Padel" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona el estado" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="active">Activo</SelectItem>
                      <SelectItem value="inactive">Inactivo</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DrawerFooter className="px-0 pt-4">
              <DrawerSubmitButton
                status={status}
                progress={progress}
                label={isEditing ? "Guardar cambios" : "Agregar club"}
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
