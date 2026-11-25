import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export interface SeriesRemovals {
  classes: number
  signUps: number
}

interface Props {
  // Open while set: what a series edit would remove.
  removals: SeriesRemovals | null
  onCancel: () => void
  onConfirm: () => void
}

/** Asks before a series edit removes classes (and their sign-ups). */
export function SeriesRemovalsDialog({ removals, onCancel, onConfirm }: Props) {
  return (
    <AlertDialog
      open={!!removals}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar clases?</AlertDialogTitle>
          <AlertDialogDescription>
            {`Se eliminarán las clases que no encajan con la nueva repetición: ${removals?.classes ?? 0} clases y ${removals?.signUps ?? 0} inscripciones.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Eliminar y guardar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
