import { describe, expect, it } from "vitest"
import {
  canTransition,
  CreateAdminRequest,
  CreateDeliveryFleetRequest,
  CreateZoneRequest,
  DeliveryBoySubmissionRequest,
  AuditLogQuery,
  formatINR,
  formatINRCompact,
  normalizeIndianPhone,
  orderStatusLabel,
  percentOf,
  rupeesToPaise,
  splitPaise,
  UpdatePartnerRequest,
  UpdateVendorRequest,
} from "./index"

describe("money", () => {
  it("formats paise as rupees", () => {
    expect(formatINR(124000)).toBe("₹1,240")
    expect(formatINR(12345678)).toBe("₹1,23,456.78")
    expect(formatINR(-30000)).toBe("−₹300")
    expect(formatINRCompact(rupeesToPaise(840000))).toBe("₹8.4L")
    expect(formatINRCompact(rupeesToPaise(11000000))).toBe("₹1.1Cr")
  })
  it("rejects fractional paise", () => {
    expect(() => formatINR(10.5)).toThrow()
  })
  it("splits without losing a paisa", () => {
    const parts = splitPaise(1400000, 31)
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1400000)
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1)
  })
  it("rounds percentages to whole paise", () => {
    expect(percentOf(3333, 1.5)).toBe(50)
  })
})

describe("phone", () => {
  it("normalises Indian mobile numbers", () => {
    expect(normalizeIndianPhone("98765 43210")).toBe("+919876543210")
    expect(normalizeIndianPhone("+91-98765-43210")).toBe("+919876543210")
    expect(normalizeIndianPhone("098765 43210")).toBe("+919876543210")
    expect(normalizeIndianPhone("12345")).toBeNull()
  })
})

describe("order state machine", () => {
  it("follows the food flow", () => {
    expect(canTransition("food", "accepted", "preparing")).toBe(true)
    expect(canTransition("food", "accepted", "packed")).toBe(false)
    expect(canTransition("food", "picked_up", "cancelled")).toBe(false)
  })

  it("follows the mart flow", () => {
    expect(canTransition("mart", "accepted", "packed")).toBe(true)
    expect(canTransition("mart", "packed", "ready")).toBe(true)
  })
  it("labels statuses per business", () => {
    expect(orderStatusLabel("food", "ready")).toBe("Ready for pickup")
    expect(orderStatusLabel("mart", "out_for_delivery")).toBe("In transit")
  })
})

describe("system management input", () => {
  it("normalizes new admin email and rejects duplicate scope grants", () => {
    const valid = {
      name: "Sam Admin",
      email: " SAM@EXAMPLE.COM ",
      password: "A-secure-initial-password",
      businesses: ["food"],
      zoneIds: ["zone-1"],
      permissions: ["orders.view"],
    }
    expect(CreateAdminRequest.parse(valid).email).toBe("sam@example.com")
    expect(CreateAdminRequest.safeParse({ ...valid, zoneIds: ["zone-1", "zone-1"] }).success).toBe(
      false,
    )
  })

  describe("delivery fleet onboarding", () => {
    const rider = (name: string, phone: string) => ({
      name,
      phone,
      address: "12 Test Street, Chennai",
      zoneId: "zone-1",
      drivingLicence: "TN0120210001",
      vehicleType: "motorcycle",
      vehicleNumber: "TN 01 AB 4821",
      payout: {
        holderName: name,
        accountNumber: "50100012345678",
        ifsc: "HDFC0001284",
      },
    })

    it("accepts multiple separately detailed riders under one fleet", () => {
      const request = CreateDeliveryFleetRequest.safeParse({
        name: "Chennai Fleet",
        contactPerson: "Fleet Owner",
        phone: "+919876543210",
        address: "1 Fleet Road, Chennai",
        districtId: "district-1",
        zoneIds: ["zone-1"],
        deliveryBoys: [
          rider("First Rider", "+919876543211"),
          rider("Second Rider", "+919876543212"),
        ],
      })
      expect(request.success).toBe(true)
      if (request.success) {
        expect(request.data.deliveryBoys).toHaveLength(2)
        expect(request.data.businesses).toEqual(["food", "mart"])
      }
    })

    it("requires a verified phone challenge for a partner-submitted delivery boy", () => {
      const request = DeliveryBoySubmissionRequest.safeParse({
        ...rider("Rider", "+919876543211"),
        otpChallengeId: "2f6d88d5-3ab3-4f4e-91a7-6332f5823d58",
        otp: "123456",
      })
      expect(request.success).toBe(true)
      expect(
        DeliveryBoySubmissionRequest.safeParse({
          ...rider("Rider", "+919876543211"),
          otpChallengeId: "2f6d88d5-3ab3-4f4e-91a7-6332f5823d58",
        }).success,
      ).toBe(false)
    })

    it("requires payout details for riders onboarded with a fleet", () => {
      const input = {
        name: "Chennai Fleet",
        contactPerson: "Fleet Owner",
        phone: "+919876543210",
        address: "1 Fleet Road, Chennai",
        districtId: "district-1",
        zoneIds: ["zone-1"],
        deliveryBoys: [rider("First Rider", "+919876543211")],
      }
      expect(CreateDeliveryFleetRequest.safeParse(input).success).toBe(true)
      expect(
        CreateDeliveryFleetRequest.safeParse({
          ...input,
          deliveryBoys: [{ ...input.deliveryBoys[0], payout: undefined }],
        }).success,
      ).toBe(false)
    })
  })

  it("requires service-area coordinates to be supplied as a pair", () => {
    const base = { district: "Chennai", city: "Chennai", location: "T Nagar" }
    expect(CreateZoneRequest.safeParse({ ...base, lat: null, lng: null }).success).toBe(true)
    expect(CreateZoneRequest.safeParse({ ...base, lat: 13.04, lng: null }).success).toBe(false)
  })

  it("accepts valid audit module/date filters and rejects reversed ranges", () => {
    expect(
      AuditLogQuery.safeParse({
        module: "vendor",
        source: "web",
        role: "admin",
        ip: "::1",
        from: "2026-10-01",
        to: "2026-10-29",
      }).success,
    ).toBe(true)
    expect(AuditLogQuery.safeParse({ role: "owner" }).success).toBe(false)
    expect(
      AuditLogQuery.safeParse({
        from: "2026-10-29",
        to: "2026-10-01",
      }).success,
    ).toBe(false)
    expect(AuditLogQuery.safeParse({ pageSize: 101 }).success).toBe(false)
  })

  it("requires an edit reason for vendor and delivery partner profile updates", () => {
    const updatedAt = "2026-11-02T00:00:00.000Z"
    expect(UpdateVendorRequest.safeParse({ updatedAt }).success).toBe(false)
    expect(UpdatePartnerRequest.safeParse({ updatedAt }).success).toBe(false)
    expect(UpdateVendorRequest.safeParse({ updatedAt, reason: "Correcting address" }).success).toBe(
      true,
    )
    expect(
      UpdatePartnerRequest.safeParse({ updatedAt, reason: "Correcting mobile number" }).success,
    ).toBe(true)
  })
})
