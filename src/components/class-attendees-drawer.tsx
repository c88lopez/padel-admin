import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { IconTrash } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  addClassAttendee,
  listClassAttendees,
  removeClassAttendee,
} from "@/lib/classes.functions"
import type { AttendeeRecord } from "@/lib/classes.functions"
import { listPlayers } from "@/lib/players.functions"
import { translateError } from "@/lib/errors"

interface Props {
  classId: string
  capacity: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  // After a sign-up or removal, so the list's counts refresh.
  onChanged?: () => void
}

/** Who's signed up to a class: add customers up to its capacity, or remove. */
export function ClassAttendeesDrawer({
  classId,
  capacity,
  open,
  onOpenChange,
  onChanged,
}: Props) {
  const { t } = useTranslation()
  const [attendees, setAttendees] = useState<AttendeeRecord[]>([])
  const [players, setPlayers] = useState<{ id: string; fullName: string }[]>([])
  const [selected, setSelected] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setAttendees(await listClassAttendees({ data: { classId } }))
  }, [classId])

  useEffect(() => {
    if (!open) return
    setSelected("")
    void load()
    void listPlayers().then((rows) =>
      setPlayers(rows.map((p) => ({ id: p.id, fullName: p.fullName })))
    )
  }, [open, load])

  const full = capacity !== null && attendees.length >= capacity
  const choices = players.filter(
    (p) => !attendees.some((a) => a.playerId === p.id)
  )

  async function change(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await action()
      toast.success(success)
      await load()
      onChanged?.()
    } catch (err) {
      toast.error(translateError(err, t, t("common.genericError")))
      await load()
    } finally {
      setBusy(false)
    }
  }

  function add() {
    const name = players.find((p) => p.id === selected)?.fullName ?? ""
    void change(
      () => addClassAttendee({ data: { classId, playerId: selected } }),
      t("forms.attendees.added", { name })
    ).then(() => setSelected(""))
  }

  function remove(attendee: AttendeeRecord) {
    void change(
      () =>
        removeClassAttendee({
          data: { classId, playerId: attendee.playerId },
        }),
      t("forms.attendees.removed", { name: attendee.fullName })
    )
  }

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{t("forms.attendees.title")}</DrawerTitle>
          <DrawerDescription>
            {capacity === null
              ? t("forms.attendees.signedUp", { count: attendees.length })
              : t("forms.attendees.placesTaken", {
                  count: attendees.length,
                  capacity,
                })}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-2">
          {attendees.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("forms.attendees.empty")}
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border">
              {attendees.map((a) => (
                <li
                  key={a.playerId}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  {a.fullName}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    disabled={busy}
                    onClick={() => remove(a)}
                    aria-label={t("forms.attendees.remove", {
                      name: a.fullName,
                    })}
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {full ? (
            <p className="text-sm text-muted-foreground">
              {t("errors.class.full")}
            </p>
          ) : (
            <div className="flex gap-2">
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger
                  className="flex-1"
                  aria-label={t("forms.attendees.addPlaceholder")}
                >
                  <SelectValue
                    placeholder={t("forms.attendees.addPlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {choices.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button disabled={!selected || busy} onClick={add}>
                {t("forms.attendees.add")}
              </Button>
            </div>
          )}
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">{t("common.close")}</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
