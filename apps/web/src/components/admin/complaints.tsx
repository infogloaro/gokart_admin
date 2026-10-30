"use client"

import type { Business } from "@zoauro/shared"
import { ComplaintsCenter } from "@/components/complaints/complaints-board"

export function AdminComplaints({ business }: { business: Business }) {
  return <ComplaintsCenter business={business} portal="admin" />
}
