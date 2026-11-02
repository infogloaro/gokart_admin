import type { DeliveryBoyReviewRequest, DeliveryBoyStatus } from "@zoauro/shared"
import { conflict, forbidden } from "../../lib/errors"
import type { MemberContext } from "../../middleware/auth"

const REQUIRED_DOCUMENTS = ["photo_id", "driving_licence", "vehicle_registration"] as const

type ReviewTarget = {
  status: DeliveryBoyStatus
  zoneId: string
  reviewAdminId: string | null
  fleetStatus: "pending_approval" | "active" | "suspended" | "rejected"
  verifiedDocumentKinds: string[]
}

export function nextDeliveryBoyStatus(
  member: MemberContext,
  boy: ReviewTarget,
  decision: DeliveryBoyReviewRequest["decision"],
): DeliveryBoyStatus {
  if (member.role === "super_admin") {
    if (boy.status !== "pending_super")
      throw conflict("Only applications forwarded by an Admin can receive a final decision.")
  } else {
    if (boy.status !== "pending_admin")
      throw conflict("This application is not waiting for an Admin review.")
    if (
      !member.permissions.includes("partners.manage") ||
      !member.zoneIds.includes(boy.zoneId) ||
      boy.reviewAdminId !== member.id
    )
      throw forbidden("You are not the responsible Admin for this zone.")
    if (decision === "approved") throw forbidden("Only a Super Admin can give final approval.")
  }

  if (decision === "forwarded") {
    if (member.role === "super_admin")
      throw forbidden("Super Admins cannot forward an application.")
    if (REQUIRED_DOCUMENTS.some((kind) => !boy.verifiedDocumentKinds.includes(kind)))
      throw conflict(
        "Verify the photo ID, driving licence, and vehicle registration before forwarding.",
      )
    return "pending_super"
  }
  if (decision === "approved") {
    if (member.role !== "super_admin") throw forbidden()
    if (boy.fleetStatus !== "active")
      throw conflict("The delivery partner must be active before final approval.")
    if (REQUIRED_DOCUMENTS.some((kind) => !boy.verifiedDocumentKinds.includes(kind)))
      throw conflict(
        "Verify the photo ID, driving licence, and vehicle registration before approval.",
      )
    return "active"
  }
  return decision
}

export function assertOrderAssignmentEligible(input: {
  fleetId: string
  boy: {
    fleetId: string
    zoneId: string
    status: string
    availability: string
    maxActiveOrders: number
  } | null
  order: {
    zoneId: string
    status: string
    partnerId: string | null
    deliveryFleetId: string | null
    deliveryBoyId: string | null
  }
  primaryZone: boolean
  openAssignment: boolean
  workload: number
  verifiedDocumentKinds: string[]
}) {
  const { boy, order } = input
  if (
    !boy ||
    boy.fleetId !== input.fleetId ||
    boy.zoneId !== order.zoneId ||
    boy.status !== "active" ||
    boy.availability !== "available"
  )
    throw forbidden("Choose an approved, available rider from this partner and zone.")
  if (!input.primaryZone)
    throw forbidden("This partner is not the active primary partner for the order's zone.")
  if (
    order.partnerId ||
    (order.deliveryFleetId && order.deliveryFleetId !== input.fleetId) ||
    order.deliveryBoyId
  )
    throw conflict("This order is already assigned outside this partner.")
  if (order.status !== "ready" && order.status !== "assigned")
    throw conflict("Only ready or unassigned orders can be assigned.")
  if (input.openAssignment) throw conflict("This order already has an active delivery assignment.")
  if (input.workload >= boy.maxActiveOrders)
    throw conflict("This rider is at their active order limit.")
  if (!REQUIRED_DOCUMENTS.every((kind) => input.verifiedDocumentKinds.includes(kind)))
    throw conflict("This rider's required documents are not verified.")
}
