"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@zoauro/api-client"
import {
  CreatePartnerRequest,
  type Business,
  type Partner,
  type PartnerAvailability,
  type PartnerDecision,
  type PartnerStatus,
  type VehicleType,
} from "@zoauro/shared"
import { useState } from "react"
import { fieldErrors, withoutBlanks } from "./vendors"

export type PartnerQuery = {
  business?: Business | undefined
  status?: PartnerStatus | undefined
  availability?: PartnerAvailability | undefined
  search?: string | undefined
  page: number
  pageSize: number
}

export const usePartners = (q: PartnerQuery) =>
  useQuery({
    queryKey: ["partners", "list", q],
    queryFn: () => api("get", "/partners", { query: q }),
    placeholderData: keepPreviousData,
  })

export const usePartnerSummary = (business?: Business) =>
  useQuery({
    queryKey: ["partners", "summary", business ?? "all"],
    queryFn: () => api("get", "/partners/summary", { query: business ? { business } : {} }),
  })

export const usePartner = (id: string | null) =>
  useQuery({
    queryKey: ["partners", "detail", id],
    queryFn: () => api("get", "/partners/{id}", { params: { id: id! } }),
    enabled: Boolean(id),
  })

export function useCreatePartner() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: CreatePartnerRequest) => api("post", "/partners", { body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["partners"] }),
  })
}

export function usePartnerDecision() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; decision: PartnerDecision; reason?: string }) =>
      api("post", "/partners/{id}/decision", {
        params: { id: v.id },
        body: { decision: v.decision, ...(v.reason && { reason: v.reason }) },
      }),
    onSettled: () => client.invalidateQueries({ queryKey: ["partners"] }),
  })
}

export const servicesLabel = (b: Business[]) =>
  b.length > 1 ? "Food + Mart" : b[0] === "food" ? "ZOAURO FOOD" : "GLOARO MART"

export const verificationOf = (p: Pick<Partner, "status" | "kycVerified">) =>
  p.status === "pending_approval" ? "Under Review" : p.kycVerified ? "Verified" : "Pending"

export const availabilityTone = (p: Pick<Partner, "status" | "availability">) =>
  p.status !== "active"
    ? "danger"
    : p.availability === "available"
      ? "success"
      : p.availability === "on_delivery"
        ? "info"
        : "neutral"

export const partnerStatusTone = (s: PartnerStatus) =>
  s === "active" ? "success" : s === "pending_approval" ? "warning" : "danger"

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

/** Masks a +91 number for list views: +91 98••• 4421 */
export const maskPhone = (phone: string) => `+91 ${phone.slice(3, 5)}••• ${phone.slice(-4)}`

export const PARTNER_STEPS = [
  ["Personal information", "Contact & service eligibility"],
  ["Identity & license", "Protected documents"],
  ["Vehicle information", "Vehicle & insurance"],
  ["Payout details", "Secure bank details"],
  ["Final review", "Review & submit"],
] as const

export type PartnerForm = {
  name: string
  phone: string
  email: string
  dateOfBirth: string
  gender: string
  address: string
  pinCode: string
  service: "food" | "mart" | "both"
  zoneId: string
  drivingLicence: string
  licenceValidUntil: string
  vehicleType: VehicleType
  vehicleNumber: string
  vehicleModel: string
  holderName: string
  bankName: string
  accountNumber: string
  confirmAccount: string
  ifsc: string
}

/** Fields checked before leaving each wizard step. */
const stepFields: (keyof PartnerForm | string)[][] = [
  ["name", "phone", "email", "dateOfBirth", "gender", "address", "pinCode", "businesses", "zoneId"],
  ["drivingLicence", "licenceValidUntil"],
  ["vehicleType", "vehicleNumber", "vehicleModel"],
  ["bank.holderName", "bank.bankName", "bank.accountNumber", "bank.ifsc", "confirmAccount"],
]

/**
 * Form state and validation for the partner onboarding wizard, shared by both portals.
 * Validates with the API's own schema so the wizard and server agree.
 */
export function usePartnerWizard(defaultService: PartnerForm["service"], defaultZone = "") {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<PartnerForm>({
    name: "",
    phone: "",
    email: "",
    dateOfBirth: "",
    gender: "",
    address: "",
    pinCode: "",
    service: defaultService,
    zoneId: defaultZone,
    drivingLicence: "",
    licenceValidUntil: "",
    vehicleType: "motorcycle",
    vehicleNumber: "",
    vehicleModel: "",
    holderName: "",
    bankName: "",
    accountNumber: "",
    confirmAccount: "",
    ifsc: "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const create = useCreatePartner()

  const set = (k: keyof PartnerForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }))
  const hasBank = Boolean(form.holderName || form.bankName || form.accountNumber || form.ifsc)

  function request() {
    const { service, holderName, bankName, accountNumber, confirmAccount, ifsc, ...rest } = form
    void confirmAccount
    return {
      ...withoutBlanks(rest, [
        "email",
        "dateOfBirth",
        "gender",
        "address",
        "pinCode",
        "vehicleModel",
        "licenceValidUntil",
      ]),
      businesses: service === "both" ? ["food", "mart"] : [service],
      ...(hasBank && { bank: { holderName, bankName, accountNumber, ifsc } }),
    }
  }

  function check(upTo: number) {
    const parsed = CreatePartnerRequest.safeParse(request())
    const all = parsed.success ? {} : fieldErrors(parsed.error.issues)
    if (form.accountNumber !== form.confirmAccount)
      all.confirmAccount = "Account numbers don't match"
    const wanted = new Set(stepFields.slice(0, upTo + 1).flat())
    const shown = Object.fromEntries(Object.entries(all).filter(([k]) => wanted.has(k)))
    setErrors(shown)
    return { shown, parsed }
  }

  const next = () => {
    if (Object.keys(check(step).shown).length === 0)
      setStep(Math.min(step + 1, PARTNER_STEPS.length - 1))
  }
  const back = () => setStep(Math.max(0, step - 1))
  const goTo = (i: number) => i < step && setStep(i)

  function submit() {
    const { shown, parsed } = check(stepFields.length - 1)
    const keys = Object.keys(shown)
    if (keys.length || !parsed.success) {
      // Jump back to the first step with a problem.
      const first = stepFields.findIndex((fields) => fields.some((f) => keys.includes(f)))
      if (first >= 0) setStep(first)
      return
    }
    create.mutate(parsed.data)
  }

  return { step, form, set, errors, next, back, goTo, submit, create }
}
