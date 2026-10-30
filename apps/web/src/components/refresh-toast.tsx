"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { Toast, type ToastMessage } from "@/components/super/ui"

type RefreshToastContextValue = {
  runRefresh: (action: () => Promise<void>) => Promise<void>
}

const RefreshToastContext = createContext<RefreshToastContextValue | null>(null)

export function RefreshToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null)

  useEffect(() => {
    if (!toast || toast.tone === "error") return
    const timer = window.setTimeout(() => setToast(null), 5000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const runRefresh = useCallback(async (action: () => Promise<void>) => {
    try {
      await action()
      setToast({
        tone: "success",
        title: "Done",
        message: "Platform data refreshed successfully.",
      })
    } catch {
      setToast({
        tone: "error",
        title: "Refresh failed",
        message: "Couldn't refresh platform data. Please try again.",
      })
    }
  }, [])

  return (
    <RefreshToastContext.Provider value={{ runRefresh }}>
      {children}
      {toast && (
        <div className="super-ui refresh-toast-host">
          <Toast toast={toast} close={() => setToast(null)} />
        </div>
      )}
    </RefreshToastContext.Provider>
  )
}

export function useRefreshToast() {
  const context = useContext(RefreshToastContext)
  if (!context) throw new Error("useRefreshToast must be used within a RefreshToastProvider")
  return context.runRefresh
}
