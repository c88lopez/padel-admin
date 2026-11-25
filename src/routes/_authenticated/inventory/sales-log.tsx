import { Fragment, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import {
  IconChevronDown,
  IconChevronRight,
  IconDownload,
  IconPlus,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { NewSaleDrawer } from "@/components/new-sale-drawer"
import { saleTotal } from "@/lib/sales"
import { listSales } from "@/lib/sales.functions"
import { listStockItems } from "@/lib/inventory.functions"
import { exportRecords } from "@/lib/export"
import type { ExportFormat } from "@/lib/export"
import { formatCurrency } from "@/lib/app-settings"
import { useCan } from "@/hooks/use-permissions"

export const Route = createFileRoute("/_authenticated/inventory/sales-log")({
  loader: async () => ({
    sales: await listSales(),
    stockItems: await listStockItems(),
  }),
  component: SalesLogPage,
})

function SalesLogPage() {
  const router = useRouter()
  const canManage = useCan("inventory:manage")
  const { sales: salesData, stockItems } = Route.useLoaderData()
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState("")

  const toggle = (id: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const filtered = filter
    ? salesData.filter(
        (s) =>
          s.date.includes(filter) ||
          s.items.some((i) =>
            i.item.toLowerCase().includes(filter.toLowerCase())
          )
      )
    : salesData

  function handleExport(format: ExportFormat) {
    const records = filtered.map((sale) => ({
      ["Fecha"]: sale.date,
      ["Artículos"]: sale.items
        .map((i) => `${i.quantity}x ${i.item}`)
        .join("; "),
      ["Cantidad de artículos"]: sale.items.length,
      ["Total"]: saleTotal(sale),
    }))
    exportRecords(records, format, "sales-log")
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Registro de ventas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Haz clic en una fila para ver sus líneas.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Buscar ventas..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <IconDownload className="size-4" />
                {"Exportar"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("csv")}>
                Exportar como CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("json")}>
                Exportar como JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {canManage && (
            <NewSaleDrawer
              stockItems={stockItems}
              onSaved={() => router.invalidate()}
              trigger={
                <Button size="sm">
                  <IconPlus className="size-4" />
                  {"Nueva venta"}
                </Button>
              }
            />
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Fecha</TableHead>
              <TableHead>Artículos</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-muted-foreground"
                >
                  Sin resultados.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((sale) => {
                const expanded = expandedRows.has(sale.id)
                const total = saleTotal(sale)
                return (
                  <Fragment key={sale.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => toggle(sale.id)}
                    >
                      <TableCell className="pr-0">
                        {expanded ? (
                          <IconChevronDown className="size-4 text-muted-foreground" />
                        ) : (
                          <IconChevronRight className="size-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>{sale.date}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {sale.items.length === 1
                          ? `${sale.items.length} artículo`
                          : `${sale.items.length} artículos`}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(total)}
                      </TableCell>
                    </TableRow>

                    {expanded && (
                      <TableRow key={`${sale.id}-detail`} data-detail>
                        <TableCell colSpan={4} className="bg-muted/30 p-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="pl-8">Producto</TableHead>
                                <TableHead className="w-20">Cant.</TableHead>
                                <TableHead className="w-32">
                                  Precio unitario
                                </TableHead>
                                <TableHead className="w-32 text-right">
                                  Subtotal
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {sale.items.map((line, i) => (
                                <TableRow key={i}>
                                  <TableCell className="pl-8">
                                    {line.item}
                                  </TableCell>
                                  <TableCell>{line.quantity}</TableCell>
                                  <TableCell>
                                    {formatCurrency(line.unitPrice)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(
                                      line.quantity * line.unitPrice
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
