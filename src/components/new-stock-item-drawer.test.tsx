import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NewStockItemDrawer } from "./new-stock-item-drawer"
import { createStockItem, updateStockItem } from "@/lib/inventory.functions"

// `vaul` (the drawer animation lib) attaches pointer handlers that read computed
// transforms and crash under jsdom. We're testing the form inside the drawer, so
// replace the drawer shell with plain passthroughs.
vi.mock("@/components/ui/drawer", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  return {
    Drawer: Pass,
    DrawerTrigger: Pass,
    DrawerContent: Pass,
    DrawerHeader: Pass,
    DrawerTitle: Pass,
    DrawerFooter: Pass,
    DrawerClose: Pass,
  }
})

// The drawer calls these server functions on submit; stub them so the form
// logic can be tested without a server/database.
vi.mock("@/lib/inventory.functions", () => ({
  createStockItem: vi.fn(() => Promise.resolve({})),
  updateStockItem: vi.fn(() => Promise.resolve({})),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const existingItem = {
  id: "stock-1",
  name: "Water Bottle",
  category: "Drinks",
  price: 1.5,
  stock: 20,
  lowStockThreshold: 5,
}

describe("NewStockItemDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("blocks creation until a low-stock threshold is provided", async () => {
    const user = userEvent.setup()
    render(<NewStockItemDrawer open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Agregar artículo" }))

    expect(
      await screen.findByText("El umbral de stock bajo es obligatorio")
    ).toBeInTheDocument()
    expect(createStockItem).not.toHaveBeenCalled()
  })

  it("creates an item with numeric values coerced from the inputs", async () => {
    const user = userEvent.setup()
    render(<NewStockItemDrawer open onOpenChange={vi.fn()} />)

    await user.type(screen.getByLabelText("Nombre del producto"), "Gym Towel")
    await user.click(screen.getByRole("combobox"))
    await user.click(await screen.findByRole("option", { name: "Accesorios" }))
    await user.type(screen.getByLabelText(/Precio/), "3.5")
    await user.type(screen.getByLabelText("Stock"), "12")
    await user.type(screen.getByLabelText("Umbral de stock bajo"), "4")

    await user.click(screen.getByRole("button", { name: "Agregar artículo" }))

    await waitFor(() =>
      expect(createStockItem).toHaveBeenCalledWith({
        data: {
          name: "Gym Towel",
          category: "Accessories",
          price: 3.5,
          stock: 12,
          lowStockThreshold: 4,
        },
      })
    )
  })

  it("pre-fills fields when editing and saves via updateStockItem", async () => {
    const user = userEvent.setup()
    render(
      <NewStockItemDrawer open item={existingItem} onOpenChange={vi.fn()} />
    )

    expect(screen.getByLabelText("Nombre del producto")).toHaveValue(
      "Water Bottle"
    )
    expect(screen.getByLabelText("Umbral de stock bajo")).toHaveValue(5)

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }))

    await waitFor(() =>
      expect(updateStockItem).toHaveBeenCalledWith({
        data: {
          id: "stock-1",
          name: "Water Bottle",
          category: "Drinks",
          price: 1.5,
          stock: 20,
          lowStockThreshold: 5,
        },
      })
    )
    expect(createStockItem).not.toHaveBeenCalled()
  })
})
