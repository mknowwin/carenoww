import * as React from "react"

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
import { cn } from "@/lib/utils"

interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  confirmText?: string
  cancelText?: string
  variant?: "default" | "destructive"
}

interface ConfirmState extends ConfirmOptions {
  open: boolean
  resolve?: (value: boolean) => void
}

let state: ConfirmState = { open: false, title: "" }
const listeners: Array<(state: ConfirmState) => void> = []

function setState(next: Partial<ConfirmState>) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener(state))
}

// Imperative, promise-based replacement for window.confirm — usable from any
// event handler without wiring per-page dialog state.
function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    setState({ ...options, open: true, resolve })
  })
}

function settle(result: boolean) {
  state.resolve?.(result)
  setState({ open: false, resolve: undefined })
}

// Mounted once at the app root, alongside <Toaster />.
function ConfirmDialog() {
  const [s, setS] = React.useState(state)

  React.useEffect(() => {
    listeners.push(setS)
    return () => {
      const index = listeners.indexOf(setS)
      if (index > -1) listeners.splice(index, 1)
    }
  }, [])

  return (
    <AlertDialog open={s.open} onOpenChange={(open) => { if (!open) settle(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{s.title}</AlertDialogTitle>
          {s.description && (
            <AlertDialogDescription>{s.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {s.cancelText || "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className={cn(
              s.variant === "destructive" &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            )}
          >
            {s.confirmText || "Continue"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { confirm, ConfirmDialog }
