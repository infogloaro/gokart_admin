"use client"

import { CheckCircle2, X } from "lucide-react"
import { useEffect, useState } from "react"

/** Shown once after sign-in, over whichever page opens next. */
export function LoginToast() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    try {
      if (sessionStorage.getItem("gokart-login-toast") === "1") {
        sessionStorage.removeItem("gokart-login-toast")
        setShow(true)
      }
    } catch {
      // Storage blocked: no toast.
    }
  }, [])
  useEffect(() => {
    if (!show) return
    const t = setTimeout(() => setShow(false), 4000)
    return () => clearTimeout(t)
  }, [show])
  if (!show) return null
  return (
    <div className="login-toast" role="status">
      <CheckCircle2 size={20} />
      <span>
        <b>Login successful</b>
        Welcome back to your dashboard.
      </span>
      <button type="button" aria-label="Dismiss" onClick={() => setShow(false)}>
        <X size={16} />
      </button>
    </div>
  )
}
