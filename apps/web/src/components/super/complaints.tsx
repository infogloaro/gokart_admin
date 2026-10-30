"use client"

import { ComplaintsCenter } from "@/components/complaints/complaints-board"
import { useBusinessFilter } from "./shell"

export function SuperComplaints() {
  const business = useBusinessFilter()
  return <ComplaintsCenter business={business === "all" ? undefined : business} portal="super" />
}
