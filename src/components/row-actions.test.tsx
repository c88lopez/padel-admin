import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RowActions } from "./row-actions"

describe("RowActions", () => {
  it("invokes onEdit when the Edit item is selected", async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<RowActions onEdit={onEdit} />)

    await user.click(screen.getByRole("button"))
    await user.click(await screen.findByText("Editar"))

    expect(onEdit).toHaveBeenCalledOnce()
  })

  it("asks for confirmation before deleting and only deletes on confirm", async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(<RowActions onDelete={onDelete} />)

    await user.click(screen.getByRole("button"))
    await user.click(await screen.findByText("Eliminar"))

    // Confirmation dialog is shown; nothing deleted yet.
    expect(
      await screen.findByText("Esta acción no se puede deshacer.")
    ).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Eliminar" }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it("supports a custom delete label", async () => {
    const user = userEvent.setup()
    render(<RowActions deleteLabel="Remove" />)

    await user.click(screen.getByRole("button"))
    expect(await screen.findByText("Remove")).toBeInTheDocument()
  })

  it("shows row-specific items", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<RowActions extraItems={[{ label: "Inscriptos", onClick }]} />)

    await user.click(screen.getByRole("button"))
    await user.click(await screen.findByText("Inscriptos"))

    expect(onClick).toHaveBeenCalledOnce()
  })
})
