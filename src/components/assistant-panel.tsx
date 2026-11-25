import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useChat } from "@ai-sdk/react"
import { lastAssistantMessageIsCompleteWithApprovalResponses } from "ai"
import { toast } from "sonner"
import {
  IconLoader2,
  IconMessagePlus,
  IconMicrophone,
  IconPlayerStopFilled,
  IconSend,
  IconSparkles,
  IconUpload,
  IconX,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  appendTranscript,
  formatDuration,
  MAX_RECORDING_SECONDS,
} from "@/lib/voice"
import { useVoiceRecorder } from "@/hooks/use-voice-recorder"
import type { VoiceError, VoiceStatus } from "@/hooks/use-voice-recorder"

interface AssistantContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}

const AssistantContext = createContext<AssistantContextValue | null>(null)

export function useAssistant() {
  const ctx = useContext(AssistantContext)
  if (!ctx)
    throw new Error("useAssistant must be used within AssistantProvider")
  return ctx
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const value = useMemo(() => ({ open, setOpen }), [open])
  return (
    <AssistantContext.Provider value={value}>
      {children}
    </AssistantContext.Provider>
  )
}

export function AssistantTrigger() {
  const { open, setOpen } = useAssistant()
  return (
    <Button
      variant={open ? "secondary" : "ghost"}
      size="icon"
      className="size-8"
      title={`${"Abrir asistente IA"} (⌘J)`}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      <IconSparkles className="size-4" />
      <span className="sr-only">Abrir asistente IA</span>
    </Button>
  )
}

// Minimal shape of a tool UI part we render (avoids deep SDK generics).
interface ToolPart {
  type: string
  toolCallId: string
  state: string
  input?: unknown
  output?: unknown
  errorText?: string
  approval?: { id: string; isAutomatic?: boolean }
}

interface PlayerRow {
  id: string
  fullName: string
  phone: string
  age: number
  gender: string
  category: string
}

function PlayersResult({ output }: { output: unknown }) {
  const data = output as
    | { ok?: boolean; error?: string; count?: number; players?: PlayerRow[] }
    | undefined
  if (!data || !data.players) {
    return (
      <p className="mt-2 text-xs text-destructive">
        {data?.error ?? "Algo salió mal."}
      </p>
    )
  }
  const players = data.players
  return (
    <div className="mt-2 overflow-x-auto rounded-md border">
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {`${data.count ?? players.length} jugadores encontrados`}
      </div>
      {players.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre completo</TableHead>
              <TableHead>Edad</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Teléfono</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.fullName}</TableCell>
                <TableCell>{p.age}</TableCell>
                <TableCell>{p.category}</TableCell>
                <TableCell>{p.phone}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function ToolPartView({
  part,
  onApprove,
}: {
  part: ToolPart
  onApprove: (id: string, approved: boolean) => void
}) {
  const toolName = part.type.replace(/^tool-/, "")

  if (part.type === "tool-searchPlayers" && part.state === "output-available") {
    return <PlayersResult output={part.output} />
  }

  if (part.state === "approval-requested" && part.approval) {
    const approval = part.approval
    return (
      <div className="mt-2 rounded-md border border-primary/40 bg-primary/5 p-3">
        <p className="text-sm font-medium">¿Aprobar esta acción?</p>
        <p className="mt-1 text-xs text-muted-foreground">{toolName}</p>
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
          {JSON.stringify(part.input, null, 2)}
        </pre>
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => onApprove(approval.id, true)}>
            Aprobar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onApprove(approval.id, false)}
          >
            Denegar
          </Button>
        </div>
      </div>
    )
  }

  if (part.state === "output-available") {
    return (
      <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
        {JSON.stringify(part.output, null, 2)}
      </pre>
    )
  }

  if (part.state === "output-error") {
    return (
      <p className="mt-2 text-xs text-destructive">
        {part.errorText ?? "Algo salió mal."}
      </p>
    )
  }

  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {`Ejecutando ${toolName}…`}
    </p>
  )
}

const VOICE_ERROR_KEYS: Record<VoiceError, string> = {
  permissionDenied:
    "El acceso al micrófono está bloqueado. Permítelo en la configuración del navegador para usar la voz.",
  noSpeech: "No se detectó voz. Inténtalo de nuevo.",
  failed: "No se pudo transcribir la grabación. Inténtalo de nuevo.",
}

// Non-modal floating panel: the page behind stays interactive, and the panel
// stays mounted while hidden so the conversation survives closing it and
// navigating between pages.
export function AssistantPanel() {
  const { open, setOpen } = useAssistant()
  const [input, setInput] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const {
    messages,
    setMessages,
    sendMessage,
    addToolApprovalResponse,
    status,
    stop,
  } = useChat({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  })

  const busy = status === "submitted" || status === "streaming"

  // Voice input fills the composer; the user reviews the text and sends it.
  const voice = useVoiceRecorder({
    onTranscript: (text) => {
      setInput((current) => appendTranscript(current, text))
      inputRef.current?.focus()
    },
    onError: (error) => toast.error(VOICE_ERROR_KEYS[error]),
  })
  const { cancel: cancelRecording } = voice

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else cancelRecording()
  }, [open, cancelRecording])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  function submit() {
    const text = input.trim()
    if (!text || busy) return
    sendMessage({ text })
    setInput("")
  }

  function newChat() {
    void stop()
    setMessages([])
    setInput("")
    inputRef.current?.focus()
  }

  async function onCsvSelected(file: File) {
    const text = await file.text()
    setInput(
      `${"Carga estos artículos de inventario desde CSV:"}\n\n\`\`\`csv\n${text.trim()}\n\`\`\``
    )
    inputRef.current?.focus()
  }

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label="Asistente IA"
      hidden={!open}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return
        // Esc discards an in-progress recording before it closes the panel.
        if (voice.status === "recording") voice.cancel()
        else setOpen(false)
      }}
      className={cn(
        "fixed inset-x-2 bottom-2 z-40 flex h-[min(640px,calc(100svh-4rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[420px]",
        open && "animate-in duration-200 fade-in-0 slide-in-from-bottom-4"
      )}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <IconSparkles className="size-4 text-primary" />
        <h2 className="flex-1 text-sm font-semibold">Asistente IA</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Nueva conversación"
          disabled={messages.length === 0}
          onClick={newChat}
        >
          <IconMessagePlus className="size-4" />
          <span className="sr-only">Nueva conversación</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Cerrar asistente"
          onClick={() => setOpen(false)}
        >
          <IconX className="size-4" />
          <span className="sr-only">Cerrar asistente</span>
        </Button>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
      >
        {messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Prueba: «jugadores menores de 30 con categoría al menos C6 y
            teléfono», sube un CSV de artículos de stock, o «reserva la pista 3
            para María García mañana a las 18:00».
          </p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                {message.role === "user" ? "Tú" : "Asistente"}
              </span>
              <div className="mt-1 space-y-1">
                {message.parts.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <p key={i} className="whitespace-pre-wrap">
                        {part.text}
                      </p>
                    )
                  }
                  if (part.type.startsWith("tool-")) {
                    return (
                      <ToolPartView
                        key={i}
                        part={part as unknown as ToolPart}
                        onApprove={(id, approved) =>
                          addToolApprovalResponse({ id, approved })
                        }
                      />
                    )
                  }
                  return null
                })}
              </div>
            </div>
          ))
        )}
        {busy && <p className="text-xs text-muted-foreground">Pensando…</p>}
      </div>

      {voice.status !== "idle" && (
        <div
          role="status"
          className="flex shrink-0 items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground"
        >
          {voice.status === "recording" ? (
            <>
              <span className="size-2 animate-pulse rounded-full bg-destructive" />
              <span className="flex-1 tabular-nums">
                {`Grabando ${formatDuration(voice.elapsed)} / ${formatDuration(MAX_RECORDING_SECONDS)}`}
              </span>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={voice.cancel}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <IconLoader2 className="size-3.5 animate-spin" />
              <span>Transcribiendo…</span>
            </>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="flex shrink-0 items-center gap-2 border-t p-3"
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void onCsvSelected(file)
            e.target.value = ""
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Subir CSV de artículos de stock"
          onClick={() => fileRef.current?.click()}
        >
          <IconUpload className="size-4" />
          <span className="sr-only">Subir CSV de artículos de stock</span>
        </Button>
        {voice.supported && (
          <VoiceButton
            status={voice.status}
            onStart={() => void voice.start()}
            onStop={voice.stop}
          />
        )}
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregunta al asistente…"
          className="flex-1"
        />
        {busy ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            title="Detener"
            onClick={() => void stop()}
          >
            <IconPlayerStopFilled className="size-4" />
            <span className="sr-only">Detener</span>
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!input.trim()}>
            <IconSend className="size-4" />
          </Button>
        )}
      </form>
    </section>
  )
}

function VoiceButton({
  status,
  onStart,
  onStop,
}: {
  status: VoiceStatus
  onStart: () => void
  onStop: () => void
}) {
  if (status === "recording") {
    return (
      <Button
        type="button"
        size="icon"
        variant="destructive"
        title="Detener grabación"
        onClick={onStop}
      >
        <IconPlayerStopFilled className="size-4" />
        <span className="sr-only">Detener grabación</span>
      </Button>
    )
  }
  const label = "Grabar un mensaje de voz"
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      title={label}
      disabled={status === "transcribing"}
      onClick={onStart}
    >
      {status === "transcribing" ? (
        <IconLoader2 className="size-4 animate-spin" />
      ) : (
        <IconMicrophone className="size-4" />
      )}
      <span className="sr-only">{label}</span>
    </Button>
  )
}
