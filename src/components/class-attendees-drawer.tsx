import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { IconTrash } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
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
import { fullDateLabel } from "@/lib/recurrence"

interface Props {
  classId: string
  capacity: number | null
  // A series' class can sign customers up to its following classes too.
  inSeries?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  // On close, when anyone was added or removed, so the list's counts
  // refresh. Not while open: reloading the page can remount the row that
  // owns this drawer and close it mid-use.
  onChanged?: () => void
}

/** Who's signed up to a class: add customers up to its capacity, or remove. */
export function ClassAttendeesDrawer({
  classId,
  capacity,
  inSeries = false,
  open,
  onOpenChange,
  onChanged,
}: Props) {
  const { t } = useTranslation()
  const [attendees, setAttendees] = useState<AttendeeRecord[]>([])
  // null until loaded: the picker waits for them, so its options don't
  // appear (and shift) under a click.
  const [players, setPlayers] = useState<
    { id: string; fullName: string }[] | null
  >(null)
  const [selected, setSelected] = useState("")
  const [busy, setBusy] = useState(false)
  const [following, setFollowing] = useState(false)
  const changed = useRef(false)

  function handleOpenChange(next: boolean) {
    if (!next && changed.current) {
      changed.current = false
      onChanged?.()
    }
    onOpenChange(next)
  }

  const load = useCallback(async () => {
    setAttendees(await listClassAttendees({ data: { classId } }))
  }, [classId])

  useEffect(() => {
    if (!open) return
    setSelected("")
    setFollowing(false)
    setPlayers(null)
    void load()
    void listPlayers().then((rows) =>
      setPlayers(rows.map((p) => ({ id: p.id, fullName: p.fullName })))
    )
  }, [open, load])

  const full = capacity !== null && attendees.length >= capacity
  const choices = (players ?? []).filter(
    (p) => !attendees.some((a) => a.playerId === p.id)
  )

  async function change<T>(
    action: () => Promise<T>,
    success: string | ((result: T) => void)
  ) {
    setBusy(true)
    try {
      const result = await action()
      if (typeof success === "string") toast.success(success)
      else success(result)
      changed.current = true
      await load()
    } catch (err) {
      toast.error(translateError(err, t, t("common.genericError")))
      await load()
    } finally {
      setBusy(false)
    }
  }

  function add() {
    const name = choices.find((p) => p.id === selected)?.fullName ?? ""
    void change(
      () =>
        addClassAttendee({ data: { classId, playerId: selected, following } }),
      following
        ? ({ classes, full: fullDates }) => {
            const message = t("forms.attendees.addedToSeries", {
              name,
              count: classes,
            })
            if (fullDates.length === 0) {
              toast.success(message)
              return
            }
            // Signed up to the rest; say which dates were full.
            toast.warning(message, {
              description: t("forms.attendees.fullDates", {
                dates: fullDates.map((d) => fullDateLabel(d, t)).join(", "),
              }),
            })
          }
        : t("forms.attendees.added", { name })
    ).then(() => setSelected(""))
  }

  function remove(attendee: AttendeeRecord) {
    void change(
      () =>
        removeClassAttendee({
          data: { classId, playerId: attendee.playerId, following },
        }),
      following
        ? t("forms.attendees.removedFromSeries", { name: attendee.fullName })
        : t("forms.attendees.removed", { name: attendee.fullName })
    )
  }

  return (
    <Drawer direction="right" open={open} onOpenChange={handleOpenChange}>
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
          ) : players === null ? null : (
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

          {/* Applies to adding and removing alike. */}
          {inSeries && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="attendees-following"
                checked={following}
                onCheckedChange={(checked) => setFollowing(checked === true)}
              />
              <Label htmlFor="attendees-following" className="font-normal">
                {t("forms.attendees.following")}
              </Label>
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
