import { describe, expect, it } from "vitest"
import type { MemberContext } from "../../middleware/auth"
import { HttpError } from "../../lib/errors"
import { assertOrderAssignmentEligible, nextDeliveryBoyStatus } from "./delivery.policy"

const admin: MemberContext = {
  id: "admin-1",
  name: "Zone Admin",
  email: "admin@example.test",
  role: "admin",
  businesses: ["food"],
  zoneIds: ["zone-1"],
  permissions: ["partners.manage"],
}

const superAdmin: MemberContext = {
  ...admin,
  id: "super-1",
  role: "super_admin",
  zoneIds: [],
}

const pendingBoy = {
  status: "pending_admin" as const,
  zoneId: "zone-1",
  reviewAdminId: "admin-1",
  fleetStatus: "active" as const,
  verifiedDocumentKinds: [],
}

const verifiedBoy = {
  ...pendingBoy,
  verifiedDocumentKinds: ["photo_id", "driving_licence", "vehicle_registration"],
}

const eligibleAssignment = {
  fleetId: "fleet-1",
  boy: {
    fleetId: "fleet-1",
    zoneId: "zone-1",
    status: "active",
    availability: "available",
    maxActiveOrders: 2,
  },
  order: {
    zoneId: "zone-1",
    status: "ready",
    partnerId: null,
    deliveryFleetId: null,
    deliveryBoyId: null,
  },
  primaryZone: true,
  openAssignment: false,
  workload: 0,
  verifiedDocumentKinds: ["photo_id", "driving_licence", "vehicle_registration"],
}

const errorStatus = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return error instanceof HttpError ? error.status : null
  }
  return null
}

describe("delivery boy review policy", () => {
  it("blocks an Admin from forwarding before the required documents are verified", () => {
    expect(
      errorStatus(() =>
        nextDeliveryBoyStatus(admin, { ...pendingBoy, verifiedDocumentKinds: [] }, "forwarded"),
      ),
    ).toBe(409)
  })

  it("allows only the responsible, zone-authorized Admin to forward an application", () => {
    expect(nextDeliveryBoyStatus(admin, verifiedBoy, "forwarded")).toBe("pending_super")
    expect(
      errorStatus(() =>
        nextDeliveryBoyStatus({ ...admin, id: "other-admin" }, verifiedBoy, "forwarded"),
      ),
    ).toBe(403)
    expect(
      errorStatus(() =>
        nextDeliveryBoyStatus({ ...admin, zoneIds: ["another-zone"] }, verifiedBoy, "forwarded"),
      ),
    ).toBe(403)
  })

  it("requires the Admin stage before a Super Admin decision", () => {
    expect(errorStatus(() => nextDeliveryBoyStatus(superAdmin, pendingBoy, "approved"))).toBe(409)
    expect(
      errorStatus(() =>
        nextDeliveryBoyStatus(superAdmin, { ...pendingBoy, status: "pending_super" }, "approved"),
      ),
    ).toBe(409)
  })

  it("requires an active fleet and verified identity, licence, and vehicle documents", () => {
    const forwarded = { ...pendingBoy, status: "pending_super" as const }
    expect(errorStatus(() => nextDeliveryBoyStatus(superAdmin, forwarded, "approved"))).toBe(409)
    expect(
      errorStatus(() =>
        nextDeliveryBoyStatus(superAdmin, { ...forwarded, fleetStatus: "suspended" }, "approved"),
      ),
    ).toBe(409)
    expect(
      nextDeliveryBoyStatus(
        superAdmin,
        {
          ...forwarded,
          verifiedDocumentKinds: ["photo_id", "driving_licence", "vehicle_registration"],
        },
        "approved",
      ),
    ).toBe("active")
  })

  it("does not permit Super Admins to repeat the Admin forwarding stage", () => {
    expect(
      errorStatus(() =>
        nextDeliveryBoyStatus(superAdmin, { ...pendingBoy, status: "pending_super" }, "forwarded"),
      ),
    ).toBe(403)
  })

  it("allows only an approved, verified rider under workload from their active zone partner", () => {
    expect(() => assertOrderAssignmentEligible(eligibleAssignment)).not.toThrow()
    expect(
      errorStatus(() =>
        assertOrderAssignmentEligible({
          ...eligibleAssignment,
          boy: { ...eligibleAssignment.boy, status: "pending_super" },
        }),
      ),
    ).toBe(403)
    expect(
      errorStatus(() =>
        assertOrderAssignmentEligible({
          ...eligibleAssignment,
          boy: { ...eligibleAssignment.boy, fleetId: "other-fleet" },
        }),
      ),
    ).toBe(403)
    expect(
      errorStatus(() =>
        assertOrderAssignmentEligible({
          ...eligibleAssignment,
          primaryZone: false,
        }),
      ),
    ).toBe(403)
    expect(
      errorStatus(() =>
        assertOrderAssignmentEligible({
          ...eligibleAssignment,
          openAssignment: true,
        }),
      ),
    ).toBe(409)
    expect(
      errorStatus(() =>
        assertOrderAssignmentEligible({
          ...eligibleAssignment,
          workload: 2,
        }),
      ),
    ).toBe(409)
    expect(
      errorStatus(() =>
        assertOrderAssignmentEligible({
          ...eligibleAssignment,
          verifiedDocumentKinds: [],
        }),
      ),
    ).toBe(409)
  })
})
