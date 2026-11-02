// Suggested priority and reply wording for a complaint. Suggestions only: an admin still
// chooses the priority and writes the reply.
import type { ComplaintCategory } from "@zoauro/shared"

export type SuggestedPriority = "low" | "medium" | "high" | "urgent"

export type SuggestedReply = { title: string; body: string }

export type ComplaintSuggestion = {
  priority: SuggestedPriority
  reasons: string[]
  replies: SuggestedReply[]
}

const BASE_PRIORITY: Record<ComplaintCategory, SuggestedPriority> = {
  not_delivered: "high",
  damaged: "high",
  partner_behaviour: "high",
  late_delivery: "medium",
  missing_item: "medium",
  wrong_item: "medium",
  quality: "medium",
  payment: "medium",
}

const RANK: SuggestedPriority[] = ["low", "medium", "high", "urgent"]
const raise = (current: SuggestedPriority, to: SuggestedPriority) =>
  RANK.indexOf(to) > RANK.indexOf(current) ? to : current

/** Words that mean someone may be hurt or the food may be unsafe. */
const SAFETY_WORDS =
  /\b(sick|vomit|injur|hospital|poison|stomach|food safety|rash|allerg|glass|insect|hair in)/i

/** Refund claims at or above this amount (paise) are handled first. */
const LARGE_CLAIM_PAISE = 100_000

const REPLIES: Record<ComplaintCategory, SuggestedReply[]> = {
  late_delivery: [
    {
      title: "Apology and status",
      body: "We're sorry your order arrived late. We've checked the delivery and are working to avoid this in future.",
    },
  ],
  missing_item: [
    {
      title: "Confirm and credit",
      body: "Thank you for letting us know. We've confirmed the missing item and will credit it back to your account.",
    },
  ],
  wrong_item: [
    {
      title: "Replacement",
      body: "We're sorry we sent the wrong item. We'll arrange the correct item or a refund, whichever you prefer.",
    },
  ],
  damaged: [
    {
      title: "Refund or replacement",
      body: "We're sorry your order arrived damaged. Please share a photo if you have one, and we'll arrange a refund or replacement.",
    },
  ],
  quality: [
    {
      title: "Quality review",
      body: "We're sorry the quality wasn't what you expected. We've shared your feedback with the seller and will review it.",
    },
  ],
  not_delivered: [
    {
      title: "Investigation",
      body: "We're sorry your order hasn't reached you. We're tracing the delivery now and will update you shortly.",
    },
  ],
  payment: [
    {
      title: "Payment check",
      body: "Thank you for reporting this. We're checking your payment and will confirm the outcome with you.",
    },
  ],
  partner_behaviour: [
    {
      title: "Conduct review",
      body: "We're sorry for your experience with our delivery partner. We've logged your concern and are reviewing it.",
    },
  ],
}

export function suggestComplaintHandling(input: {
  category: ComplaintCategory
  claimPaise: number | null
  text: string
}): ComplaintSuggestion {
  const reasons: string[] = [
    `Category "${input.category.replaceAll("_", " ")}" starts at ${BASE_PRIORITY[input.category]}.`,
  ]
  let priority = BASE_PRIORITY[input.category]

  if (SAFETY_WORDS.test(input.text)) {
    priority = raise(priority, "urgent")
    reasons.push("The text mentions health or safety, so it is urgent.")
  }
  if (input.claimPaise !== null && input.claimPaise >= LARGE_CLAIM_PAISE) {
    priority = raise(priority, "urgent")
    reasons.push("The refund claim is ₹1,000 or more.")
  } else if (input.claimPaise !== null && input.claimPaise > 0) {
    priority = raise(priority, "high")
    reasons.push("The customer is asking for a refund.")
  }

  return { priority, reasons, replies: REPLIES[input.category] }
}
