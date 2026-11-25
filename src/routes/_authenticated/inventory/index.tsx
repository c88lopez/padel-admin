import { useMemo, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { DataTable } from "@/components/data-table"
import { NewStockItemDrawer } from "@/components/new-stock-item-drawer"
import { RowActions } from "@/components/row-actions"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/app-settings"
import { stockCategoryLabel } from "@/lib/inventory"
import {
  deleteStockItem,
  listStockItems,
  setStockLevel,
} from "@/lib/inventory.functions"
import { useCan } from "@/hooks/use-permissions"
import type { StockItem } from "@/db/schema"

export const Route = createFileRoute("/_authenticated/inventory/")({
  loader: async () => ({ stockItems: await listStockItems() }),
  component: StockPage,
})

function EditableStockCell({
  item,
  canManage,
}: {
  item: StockItem
  canManage: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  // Draft value is only used while editing; the displayed count always comes
  // from `item.stock` (the loader) so it stays correct as rows are added/sorted.
  const [draft, setDraft] = useState(item.stock)
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setDraft(item.stock)
    setEditing(true)
  }

  async function save() {
    setEditing(false)
    if (draft === item.stock) return
    setSaving(true)
    try {
      await setStockLevel({ data: { id: item.id, stock: draft } })
      toast.success("Stock actualizado", {
        description:
          draft === 1
            ? `${item.name} establecido en ${draft} unidad.`
            : `${item.name} establecido en ${draft} unidades.`,
      })
      router.invalidate()
    } catch {
      toast.error("No se pudo actualizar el stock", {
        description: "Inténtalo de nuevo.",
      })
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <Input
        type="number"
        value={draft}
        min={0}
        onChange={(e) => setDraft(Number(e.target.value))}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key === "Escape") setEditing(false)
        }}
        autoFocus
        className="h-7 w-20"
      />
    )
  }

  const className = cn(
    "rounded px-1 py-0.5 text-sm",
    item.stock <= item.lowStockThreshold && "font-medium text-destructive"
  )

  const unitsLabel =
    item.stock === 1 ? `${item.stock} unidad` : `${item.stock} unidades`

  if (!canManage) {
    return <span className={className}>{unitsLabel}</span>
  }

  return (
    <button
      onClick={startEdit}
      disabled={saving}
      title="Haz clic para editar"
      className={cn("cursor-pointer hover:bg-muted", className)}
    >
      {unitsLabel}
    </button>
  )
}

function StockActions({ item }: { item: StockItem }) {
  const router = useRouter()
  const canManage = useCan("inventory:manage")
  const [editOpen, setEditOpen] = useState(false)

  async function handleDelete() {
    try {
      await deleteStockItem({ data: { id: item.id } })
      toast.success("Artículo eliminado", { description: item.name })
      router.invalidate()
    } catch {
      toast.error("No se pudo eliminar el artículo", {
        description: "Inténtalo de nuevo.",
      })
    }
  }

  if (!canManage) return null

  return (
    <>
      <NewStockItemDrawer
        item={item}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => router.invalidate()}
      />
      <RowActions onEdit={() => setEditOpen(true)} onDelete={handleDelete} />
    </>
  )
}

function buildStockColumns(canManage: boolean): ColumnDef<StockItem>[] {
  const columns: ColumnDef<StockItem>[] = [
    {
      accessorKey: "name",
      header: "Producto",
    },
    {
      accessorKey: "category",
      header: "Categoría",
      meta: { className: "w-[448px] text-center" },
      cell: ({ row }) => (
        <div className="flex justify-center">
          <Badge variant="outline">
            {stockCategoryLabel(row.getValue<string>("category"))}
          </Badge>
        </div>
      ),
    },
    {
      accessorKey: "price",
      header: "Precio",
      cell: ({ row }) => formatCurrency(row.getValue<number>("price")),
    },
    {
      accessorKey: "stock",
      header: "Stock",
      cell: ({ row }) => (
        <EditableStockCell item={row.original} canManage={canManage} />
      ),
    },
  ]

  if (canManage) {
    columns.push({
      id: "actions",
      enableSorting: false,
      meta: { className: "text-right" },
      cell: ({ row }) => <StockActions item={row.original} />,
    })
  }

  return columns
}

function StockPage() {
  const router = useRouter()
  const canManage = useCan("inventory:manage")
  const { stockItems } = Route.useLoaderData()
  const stockColumns = useMemo(() => buildStockColumns(canManage), [canManage])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Stock</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {"Administra los niveles de stock."}{" "}
          {canManage ? `${"Haz clic en una cantidad para editarla."} ` : ""}
          {"Se resaltan los artículos con stock igual o menor a su umbral."}
        </p>
      </div>

      <DataTable
        columns={stockColumns}
        data={stockItems}
        searchPlaceholder="Buscar productos..."
        exportFileName="stock"
        action={
          canManage ? (
            <NewStockItemDrawer
              onSaved={() => router.invalidate()}
              trigger={
                <Button size="sm">
                  <IconPlus className="size-4" />
                  {"Nuevo artículo"}
                </Button>
              }
            />
          ) : undefined
        }
      />
    </div>
  )
}
