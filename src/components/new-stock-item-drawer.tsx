import { useCallback, useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodFormResolver } from "@/lib/form"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DrawerSubmitButton } from "@/components/drawer-submit-button"
import { useSubmitLifecycle } from "@/hooks/use-submit-lifecycle"
import { createStockItem, updateStockItem } from "@/lib/inventory.functions"
import { getCurrencySymbol } from "@/lib/app-settings"
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
  FormDescription,
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
    category: z.string().min(1, "La categoría es obligatoria"),
    price: z.coerce.number().positive("El precio debe ser mayor que 0"),
    stock: z.coerce.number().int().min(0, "El stock no puede ser negativo"),
    // Required: an empty field becomes `undefined` (not 0) so it fails as
    // "required" instead of silently defaulting to zero.
    lowStockThreshold: z.preprocess(
      (v) => (v === "" || v === null ? undefined : v),
      z.coerce
        .number({ message: "El umbral de stock bajo es obligatorio" })
        .int()
        .min(0, "El umbral no puede ser negativo")
    ),
  })
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>
// While editing, the threshold may be empty until the user types a value.
type FormInput = Omit<FormValues, "lowStockThreshold"> & {
  lowStockThreshold?: number
}

export interface StockItemData {
  name: string
  category: string
  price: number
  stock: number
  lowStockThreshold: number
}

interface Props {
  trigger?: React.ReactNode
  item?: StockItemData & { id?: string }
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: () => void
}

export function NewStockItemDrawer({
  trigger,
  item,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onSaved,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = controlledOnOpenChange ?? setInternalOpen
  const isEditing = !!item
  const currencySymbol = getCurrencySymbol()

  const { status, progress, run, reset, schedule } = useSubmitLifecycle()
  const schema = useMemo(() => makeSchema(), [])

  const toValues = useCallback(
    (it?: StockItemData): FormInput => ({
      name: it?.name ?? "",
      category: it?.category ?? "",
      price: it?.price ?? 0,
      stock: it?.stock ?? 0,
      // No default — the user must enter a threshold for every new item.
      lowStockThreshold: it?.lowStockThreshold,
    }),
    []
  )

  const form = useForm<FormInput>({
    resolver: zodFormResolver<FormInput>(schema),
    defaultValues: toValues(item),
  })

  useEffect(() => {
    if (open) {
      form.reset(toValues(item))
      reset()
    }
  }, [open, item, form, reset, toValues])

  function onSubmit(values: FormInput) {
    run({
      action: () =>
        item?.id
          ? updateStockItem({ data: { id: item.id, ...values } })
          : createStockItem({ data: values }),
      onSuccess: () => {
        toast.success(isEditing ? "Artículo actualizado" : "Artículo creado", {
          description: `${values.name} se ha guardado correctamente.`,
        })
        onSaved?.()
        schedule(() => setOpen(false), 900)
      },
      onError: () => {
        toast.error("Algo salió mal", {
          description: "No se pudo guardar el artículo. Inténtalo de nuevo.",
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
            {isEditing ? "Editar artículo" : "Nuevo artículo"}
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
                  <FormLabel>Nombre del producto</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="p. ej. Botella de agua (500ml)"
                      {...field}
                    />
                  </FormControl>
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
                        <SelectValue placeholder="Selecciona una categoría" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Drinks">Bebidas</SelectItem>
                      <SelectItem value="Equipment">Equipamiento</SelectItem>
                      <SelectItem value="Accessories">Accesorios</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{`Precio (${currencySymbol})`}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="stock"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stock</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lowStockThreshold"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Umbral de stock bajo</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      placeholder="e.g. 10"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Marca este artículo como bajo cuando el stock llegue a este
                    número.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DrawerFooter className="px-0 pt-4">
              <DrawerSubmitButton
                status={status}
                progress={progress}
                label={isEditing ? "Guardar cambios" : "Agregar artículo"}
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
