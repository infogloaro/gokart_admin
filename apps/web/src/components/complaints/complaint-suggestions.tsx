"use client"

import { Sparkles } from "lucide-react"
import { useComplaintSuggestions } from "@/lib/operations"

const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
}

/** Suggested priority, the reasons for it, and reply wording. Nothing is sent until an admin uses a reply. */
export function ComplaintSuggestions({
  id,
  onUseReply,
}: {
  id: string
  onUseReply: (body: string) => void
}) {
  const q = useComplaintSuggestions(id)
  if (q.isPending) return null
  if (q.isError || !q.data) return null
  const { priority, reasons, replies } = q.data
  return (
    <section className="cmp-suggestions" aria-label="Suggested handling">
      <h3>
        <Sparkles size={16} /> Suggested handling
      </h3>
      <p>
        Suggested priority: <strong>{PRIORITY_LABEL[priority] ?? priority}</strong>
      </p>
      <ul>
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      {replies.map((reply) => (
        <button
          key={reply.title}
          type="button"
          className="cmp-btn"
          onClick={() => onUseReply(reply.body)}
          title={reply.body}
        >
          Use reply: {reply.title}
        </button>
      ))}
    </section>
  )
}
