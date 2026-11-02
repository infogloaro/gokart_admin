"use client"

import { AlertTriangle } from "lucide-react"
import { useState } from "react"
import { Button, ErrorBox, Input, Modal } from "./ui"

/** Asks for the reason behind a change before it is saved to the partner's history. */
export function ReasonDialog({
  title,
  subtitle,
  confirmLabel,
  danger = false,
  saving,
  error,
  close,
  submit,
}: {
  title: string
  subtitle?: string
  confirmLabel: string
  danger?: boolean
  saving: boolean
  error?: string
  close: () => void
  submit: (reason: string) => void
}) {
  const [reason, setReason] = useState("")
  return (
    <Modal title={title} subtitle={subtitle} close={close}>
      <div className="modal-body">
        <Input
          label="Reason *"
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
        />
        <p>The reason and the before and after values are kept in this partner’s history.</p>
        {error && <ErrorBox icon={AlertTriangle}>{error}</ErrorBox>}
        <footer>
          <Button onClick={close}>Cancel</Button>
          <Button
            primary={!danger}
            danger={danger}
            disabled={reason.trim().length < 3 || saving}
            onClick={() => submit(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </footer>
      </div>
    </Modal>
  )
}
