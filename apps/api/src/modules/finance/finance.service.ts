import type { PrismaClient } from "../../generated/client/index.js"
import type { ResolveAccessibleWorkspaceIds, WorkspacePrincipal } from "../workspace.types.js"
import {
  accrualFactor,
  adminPlanLabel,
  buildPeriodBuckets,
  computeAdminEarnings,
  computePartnerEarnings,
  cycleDueDate,
  cycleKeyOf,
  cycleLabel,
  cycleRange,
  displayPayoutStatus,
  inRange,
  isOnTime,
  partnerPlanLabel,
  round,
  toNumber,
  type AdminEarnings,
  type DateRange,
  type PartnerEarnings,
} from "./finance.util.js"

const ACTOR = "Arjun Menon (Super Admin)"
const WORKSPACE_TAGS: Record<string, string> = { "zoauro-food": "FOOD", "gloaro-mart": "MART" }

function fail(message: string, status: number): never {
  throw Object.assign(new Error(message), { status })
}

type ReportPeriod = "daily" | "weekly" | "monthly"

export function createFinanceService(
  prisma: PrismaClient,
  resolveAccessibleWorkspaceIds: ResolveAccessibleWorkspaceIds,
) {
  async function resolveScope(principal: WorkspacePrincipal, workspaceSlug: string) {
    const accessibleIds = await resolveAccessibleWorkspaceIds(principal)
    const accessible = await prisma.workspace.findMany({
      where: { id: { in: [...new Set(accessibleIds)] }, status: "ACTIVE" },
      select: { id: true, slug: true, name: true },
      orderBy: { name: "asc" },
    })
    const workspaces =
      workspaceSlug === "all"
        ? accessible
        : accessible.filter(
            (workspace) => workspace.slug === workspaceSlug || workspace.id === workspaceSlug,
          )
    if (workspaces.length === 0) fail("Workspace not found or access denied", 404)
    return {
      workspaces,
      ids: workspaces.map((workspace) => workspace.id),
      tagById: new Map(
        workspaces.map((workspace) => [workspace.id, WORKSPACE_TAGS[workspace.slug] ?? "FOOD"]),
      ),
    }
  }

  async function audit(workspaceId: string | null, action: string, detail: string) {
    await prisma.financeAuditLog.create({ data: { workspaceId, actor: ACTOR, action, detail } })
  }

  async function loadData(ids: string[], range: DateRange) {
    const [partners, admins, orders, remittances, adjustments] = await Promise.all([
      prisma.deliveryPartner.findMany({
        where: { workspaceId: { in: ids } },
        include: { admin: { select: { name: true } } },
        orderBy: { code: "asc" },
      }),
      prisma.adminAccount.findMany({
        where: { workspaceId: { in: ids } },
        orderBy: { accountCode: "asc" },
      }),
      prisma.order.findMany({
        where: {
          workspaceId: { in: ids },
          status: "DELIVERED",
          deliveredAt: { gte: range.start, lte: range.end },
        },
        select: {
          workspaceId: true,
          deliveryPartnerId: true,
          acceptedAt: true,
          deliveredAt: true,
          grossValue: true,
          paymentMethod: true,
          commissionAmount: true,
          deliveryFeeAmount: true,
        },
      }),
      prisma.partnerRemittance.findMany({
        where: { workspaceId: { in: ids } },
        orderBy: { remittedAt: "desc" },
      }),
      prisma.payAdjustment.findMany({
        where: { workspaceId: { in: ids }, createdAt: { gte: range.start, lte: range.end } },
      }),
    ])
    return { partners, admins, orders, remittances, adjustments }
  }

  type Data = Awaited<ReturnType<typeof loadData>>

  function compute(data: Data, range: DateRange, cycleClosed: boolean) {
    const factor = accrualFactor(range)
    const orders = data.orders.filter((order) => inRange(order.deliveredAt, range))
    const adjustments = data.adjustments.filter((item) => inRange(item.createdAt, range))
    const remittances = data.remittances.filter((item) => inRange(item.remittedAt, range))

    const partners = data.partners
      .map((partner) => {
        const mine = orders.filter((order) => order.deliveryPartnerId === partner.id)
        const collected = mine
          .filter((order) => order.paymentMethod === "COD")
          .reduce((sum, order) => sum + toNumber(order.grossValue), 0)
        const remitted = remittances
          .filter((item) => item.partnerId === partner.id)
          .reduce((sum, item) => sum + toNumber(item.amount), 0)
        const adj = adjustments.filter((item) => item.partnerId === partner.id)
        const plan = {
          monthlySalary: toNumber(partner.monthlySalary),
          fixedPay: toNumber(partner.fixedPay),
          perDeliveryRate: toNumber(partner.perDeliveryRate),
          feeSharePercent: toNumber(partner.feeSharePercent),
        }
        const earnings: PartnerEarnings = computePartnerEarnings({
          plan,
          deliveries: mine.length,
          deliveryFees: mine.reduce((sum, order) => sum + toNumber(order.deliveryFeeAmount), 0),
          factor,
          bonus: adj
            .filter((item) => item.kind === "BONUS")
            .reduce((sum, item) => sum + toNumber(item.amount), 0),
          deductions: adj
            .filter((item) => item.kind === "DEDUCTION")
            .reduce((sum, item) => sum + toNumber(item.amount), 0),
        })
        const last = data.remittances.find((item) => item.partnerId === partner.id) ?? null
        return {
          partner,
          plan,
          planLabel: partnerPlanLabel(plan),
          collected: round(collected),
          remitted: round(remitted),
          toRemit: Math.max(0, round(collected - remitted)),
          last,
          earnings,
        }
      })
      .filter((row) => row.earnings.deliveries > 0 || row.earnings.earnings !== 0)

    const adminRows = data.admins.map((admin) => {
      const managed = data.partners.filter((partner) => partner.adminId === admin.id)
      const managedIds = new Set(managed.map((partner) => partner.id))
      const mine = orders.filter(
        (order) => order.deliveryPartnerId && managedIds.has(order.deliveryPartnerId),
      )
      const adj = adjustments.filter((item) => item.adminId === admin.id)
      const plan = {
        monthlySalary: toNumber(admin.monthlySalary),
        commissionPercent: toNumber(admin.commissionPercent),
        incentiveAmount: toNumber(admin.incentiveAmount),
        onTimeThreshold: toNumber(admin.onTimeThreshold),
      }
      const earnings: AdminEarnings = computeAdminEarnings({
        plan,
        partners: managed.length,
        delivered: mine.length,
        onTime: mine.filter((order) => isOnTime(order.acceptedAt, order.deliveredAt)).length,
        managedPlatformRevenue: mine.reduce(
          (sum, order) =>
            sum + toNumber(order.commissionAmount) + toNumber(order.deliveryFeeAmount),
          0,
        ),
        factor,
        cycleClosed,
        bonus: adj
          .filter((item) => item.kind === "BONUS")
          .reduce((sum, item) => sum + toNumber(item.amount), 0),
        deductions: adj
          .filter((item) => item.kind === "DEDUCTION")
          .reduce((sum, item) => sum + toNumber(item.amount), 0),
      })
      return { admin, plan, planLabel: adminPlanLabel(plan), earnings }
    })

    const deliveryFees = round(
      orders.reduce((sum, order) => sum + toNumber(order.deliveryFeeAmount), 0),
    )
    const orderCommission = round(
      orders.reduce((sum, order) => sum + toNumber(order.commissionAmount), 0),
    )
    const collections = partners.reduce((sum, row) => sum + row.collected, 0)
    const remitted = partners.reduce((sum, row) => sum + row.remitted, 0)
    const partnerEarnings = partners.reduce((sum, row) => sum + row.earnings.earnings, 0)
    const adminEarnings = adminRows.reduce((sum, row) => sum + row.earnings.earnings, 0)
    const platformRevenue = deliveryFees + orderCommission

    return {
      partners,
      admins: adminRows,
      totals: {
        deliveryFees,
        orderCommission,
        platformRevenue,
        collections,
        remitted,
        partnerEarnings,
        adminEarnings,
        netProfit: platformRevenue - partnerEarnings - adminEarnings,
        bonuses:
          partners.reduce((sum, row) => sum + row.earnings.bonus, 0) +
          adminRows.reduce((sum, row) => sum + row.earnings.bonus, 0),
        deductions:
          partners.reduce((sum, row) => sum + row.earnings.deductions, 0) +
          adminRows.reduce((sum, row) => sum + row.earnings.deductions, 0),
      },
    }
  }

  async function cycleContext(
    principal: WorkspacePrincipal,
    workspaceSlug: string,
    cycle?: string,
  ) {
    const scope = await resolveScope(principal, workspaceSlug)
    const key = cycle ?? cycleKeyOf(new Date())
    const range = cycleRange(key)
    const data = await loadData(scope.ids, range)
    const result = compute(data, range, !range.open)
    return {
      ...scope,
      key,
      range,
      cycle: { key, label: cycleLabel(key), open: range.open },
      data,
      result,
    }
  }

  function payoutCode(kind: "PARTNER" | "ADMIN", key: string, accountRef: string) {
    const compact = key.replace("-", "")
    return kind === "PARTNER"
      ? `PPO-${compact}-${accountRef.replace("-", "")}`
      : `APO-${compact}-ADM${accountRef.replace(/\D/g, "")}`
  }

  async function payoutRows(ids: string[], where: Record<string, unknown> = {}) {
    return prisma.payout.findMany({
      where: { workspaceId: { in: ids }, ...where },
      include: {
        partner: { select: { name: true, code: true } },
        admin: { select: { name: true, accountCode: true } },
      },
      orderBy: [{ cycle: "desc" }, { code: "asc" }],
    })
  }

  function shapePayout(payout: Awaited<ReturnType<typeof payoutRows>>[number], now = new Date()) {
    return {
      id: payout.id,
      code: payout.code,
      kind: payout.kind,
      accountId: payout.partnerId ?? payout.adminId ?? "",
      accountName: payout.partner?.name ?? payout.admin?.name ?? "Unknown",
      accountRef: payout.partner?.code ?? payout.admin?.accountCode ?? "",
      cycle: payout.cycle,
      cycleLabel: cycleLabel(payout.cycle),
      amount: toNumber(payout.amount),
      dueDate: payout.dueDate.toISOString(),
      status: displayPayoutStatus(payout.status, payout.dueDate, now),
      rawStatus: payout.status,
      note: payout.note,
      generatedAt: payout.generatedAt.toISOString(),
      approvedAt: payout.approvedAt?.toISOString() ?? null,
      approvedBy: payout.approvedBy,
      paidAt: payout.paidAt?.toISOString() ?? null,
    }
  }

  async function findPayout(ids: string[], id: string) {
    const payout = await prisma.payout.findFirst({ where: { id, workspaceId: { in: ids } } })
    if (!payout) fail("Payout not found", 404)
    return payout
  }

  function requireNumber(value: unknown, label: string, min = 0): number {
    const parsed = typeof value === "string" ? Number(value) : value
    if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < min) {
      fail(`${label} must be a number${min > 0 ? " greater than 0" : " of 0 or more"}`, 400)
    }
    return parsed
  }

  return {
    async getCycles(principal: WorkspacePrincipal, workspaceSlug: string) {
      const { ids } = await resolveScope(principal, workspaceSlug)
      const oldest = await prisma.order.aggregate({
        where: { workspaceId: { in: ids } },
        _min: { placedAt: true },
      })
      const current = new Date()
      const first = oldest._min.placedAt ?? current
      const cycles: Array<{ key: string; label: string; open: boolean }> = []
      const cursor = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1))
      while (cursor.getTime() >= Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)) {
        const key = cycleKeyOf(cursor)
        cycles.push({ key, label: cycleLabel(key), open: cycles.length === 0 })
        cursor.setUTCMonth(cursor.getUTCMonth() - 1)
      }
      return { cycles }
    },

    async getSettlements(principal: WorkspacePrincipal, workspaceSlug: string, cycle?: string) {
      const ctx = await cycleContext(principal, workspaceSlug, cycle)
      const { totals, partners, admins } = ctx.result
      const payouts = await payoutRows(ctx.ids, { cycle: ctx.key })
      const pending = payouts.filter(
        (payout) => payout.status === "PENDING_APPROVAL" || payout.status === "APPROVED",
      )
      return {
        cycle: ctx.cycle,
        rangeLabel: `${cycleLabel(ctx.key)} · to ${ctx.range.end.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })}`,
        kpis: {
          collections: totals.collections,
          remitted: totals.remitted,
          remittedPercent:
            totals.collections > 0
              ? Math.round((totals.remitted / totals.collections) * 1000) / 10
              : 0,
          pendingRemittance: Math.max(0, totals.collections - totals.remitted),
          partnersHoldingCash: partners.filter((row) => row.toRemit > 0).length,
          partnerEarnings: totals.partnerEarnings,
          partnerAccounts: partners.length,
          adminEarnings: totals.adminEarnings,
          adminAccounts: admins.length,
          bonuses: totals.bonuses,
          deductions: totals.deductions,
          pendingPayout:
            payouts.length === 0
              ? null
              : pending.reduce((sum, payout) => sum + toNumber(payout.amount), 0),
          platformRevenue: totals.platformRevenue,
          netProfit: totals.netProfit,
          marginPercent:
            totals.platformRevenue > 0
              ? Math.round((totals.netProfit / totals.platformRevenue) * 1000) / 10
              : 0,
        },
        profit: {
          deliveryFees: totals.deliveryFees,
          orderCommission: totals.orderCommission,
          platformRevenue: totals.platformRevenue,
          partnerEarnings: totals.partnerEarnings,
          adminEarnings: totals.adminEarnings,
          netProfit: totals.netProfit,
        },
        remittance: {
          collected: totals.collections,
          remitted: totals.remitted,
          owed: Math.max(0, totals.collections - totals.remitted),
        },
        payoutsGenerated: payouts.length > 0,
      }
    },

    async getCollections(principal: WorkspacePrincipal, workspaceSlug: string, cycle?: string) {
      const ctx = await cycleContext(principal, workspaceSlug, cycle)
      return {
        cycle: ctx.cycle,
        rows: ctx.result.partners.map((row) => ({
          partnerId: row.partner.id,
          name: row.partner.name,
          code: row.partner.code ?? "—",
          accountCode: row.partner.accountCode ?? "—",
          business: ctx.tagById.get(row.partner.workspaceId) ?? "FOOD",
          managedBy: row.partner.admin?.name ?? "Unassigned",
          deliveries: row.earnings.deliveries,
          cashCollected: row.collected,
          remitted: row.remitted,
          toRemit: row.toRemit,
          lastRemittance: row.last
            ? { at: row.last.remittedAt.toISOString(), method: row.last.method }
            : null,
          status: row.toRemit > 0 ? "Pending" : "Settled",
        })),
      }
    },

    async getPartnerPayouts(principal: WorkspacePrincipal, workspaceSlug: string, cycle?: string) {
      const ctx = await cycleContext(principal, workspaceSlug, cycle)
      const payouts = await payoutRows(ctx.ids, { cycle: ctx.key, kind: "PARTNER" })
      const rows = ctx.result.partners.map((row) => {
        const payout = payouts.find((item) => item.partnerId === row.partner.id)
        return {
          partnerId: row.partner.id,
          name: row.partner.name,
          code: row.partner.code ?? "—",
          accountCode: row.partner.accountCode ?? "—",
          planLabel: row.planLabel,
          plan: row.plan,
          deliveries: row.earnings.deliveries,
          salary: row.earnings.salary,
          fixed: row.earnings.fixed,
          perDelivery: row.earnings.perDelivery,
          commission: row.earnings.commission,
          bonus: row.earnings.bonus,
          deductions: row.earnings.deductions,
          earnings: row.earnings.earnings,
          payoutStatus: payout
            ? displayPayoutStatus(payout.status, payout.dueDate)
            : "Not generated",
        }
      })
      return { cycle: ctx.cycle, rows }
    },

    async getAdminPayouts(principal: WorkspacePrincipal, workspaceSlug: string, cycle?: string) {
      const ctx = await cycleContext(principal, workspaceSlug, cycle)
      const payouts = await payoutRows(ctx.ids, { cycle: ctx.key, kind: "ADMIN" })
      const rows = ctx.result.admins.map((row) => {
        const payout = payouts.find((item) => item.adminId === row.admin.id)
        return {
          adminId: row.admin.id,
          name: row.admin.name,
          location: row.admin.location,
          accountCode: row.admin.accountCode,
          planLabel: row.planLabel,
          plan: row.plan,
          partners: row.earnings.partners,
          onTimePercent: row.earnings.onTimePercent,
          salary: row.earnings.salary,
          commission: row.earnings.commission,
          incentive: ctx.cycle.open ? null : row.earnings.incentive,
          bonus: row.earnings.bonus,
          deductions: row.earnings.deductions,
          earnings: row.earnings.earnings,
          payoutStatus: payout
            ? displayPayoutStatus(payout.status, payout.dueDate)
            : "Not generated",
        }
      })
      return { cycle: ctx.cycle, rows }
    },

    async getPayments(
      principal: WorkspacePrincipal,
      workspaceSlug: string,
      filters: { account?: string; status?: string; cycle?: string },
    ) {
      const { ids } = await resolveScope(principal, workspaceSlug)
      const all = (await payoutRows(ids)).map((payout) => shapePayout(payout))
      const sum = (status: string) => {
        const matching = all.filter((payout) => payout.status === status)
        return {
          amount: matching.reduce((total, payout) => total + payout.amount, 0),
          count: matching.length,
        }
      }
      const accounts = [
        ...new Map(all.map((payout) => [payout.accountId, payout.accountName])).entries(),
      ].map(([id, name]) => ({ id, name }))
      return {
        summary: {
          paid: sum("Paid"),
          pending: sum("Pending approval"),
          approved: sum("Approved"),
          overdue: sum("Overdue"),
          settled: sum("Settled"),
        },
        accounts,
        cycles: [...new Set(all.map((payout) => payout.cycle))].map((key) => ({
          key,
          label: cycleLabel(key),
        })),
        rows: all.filter(
          (payout) =>
            (!filters.account || payout.accountId === filters.account) &&
            (!filters.status || payout.status === filters.status) &&
            (!filters.cycle || payout.cycle === filters.cycle),
        ),
      }
    },

    async getReports(principal: WorkspacePrincipal, workspaceSlug: string, period: ReportPeriod) {
      const { ids } = await resolveScope(principal, workspaceSlug)
      const oldest = await prisma.order.aggregate({
        where: { workspaceId: { in: ids } },
        _min: { placedAt: true },
      })
      const now = new Date()
      const first = oldest._min.placedAt ?? now
      const range: DateRange = {
        start: new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)),
        end: now,
      }
      const data = await loadData(ids, range)
      const rows = buildPeriodBuckets(range, period).map((bucket) => {
        const result = compute(data, bucket, false)
        let incentives = 0
        // Incentives are booked on the last day of a closed cycle, so add them to the
        // bucket that contains that day.
        for (const month of new Set([cycleKeyOf(bucket.start), cycleKeyOf(bucket.end)])) {
          const monthRange = cycleRange(month, now)
          if (monthRange.open || !inRange(monthRange.end, bucket)) continue
          incentives += compute(data, monthRange, true).admins.reduce(
            (sum, row) => sum + row.earnings.incentive,
            0,
          )
        }
        const adminSalaries = result.totals.adminEarnings + incentives
        return {
          label: bucket.label,
          collections: result.totals.collections,
          platformRevenue: result.totals.platformRevenue,
          partnerPayouts: result.totals.partnerEarnings,
          adminSalaries,
          netProfit: result.totals.platformRevenue - result.totals.partnerEarnings - adminSalaries,
        }
      })
      const total = rows.reduce(
        (sum, row) => ({
          collections: sum.collections + row.collections,
          platformRevenue: sum.platformRevenue + row.platformRevenue,
          partnerPayouts: sum.partnerPayouts + row.partnerPayouts,
          adminSalaries: sum.adminSalaries + row.adminSalaries,
          netProfit: sum.netProfit + row.netProfit,
        }),
        { collections: 0, platformRevenue: 0, partnerPayouts: 0, adminSalaries: 0, netProfit: 0 },
      )
      return { period, rows, total }
    },

    async getApprovals(principal: WorkspacePrincipal, workspaceSlug: string) {
      const { ids } = await resolveScope(principal, workspaceSlug)
      const [payouts, requests, audit] = await Promise.all([
        payoutRows(ids, { status: "PENDING_APPROVAL" }),
        prisma.payChangeRequest.findMany({
          where: { workspaceId: { in: ids } },
          include: {
            partner: true,
            requestedBy: { select: { name: true, location: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.financeAuditLog.findMany({
          where: { OR: [{ workspaceId: { in: ids } }, { workspaceId: null }] },
          orderBy: { createdAt: "desc" },
          take: 12,
        }),
      ])
      const shaped = payouts.map((payout) => shapePayout(payout))
      return {
        payouts: shaped,
        payoutsTotal: shaped.reduce((sum, payout) => sum + payout.amount, 0),
        requests: requests.map((request) => ({
          id: request.id,
          code: request.code,
          partnerName: request.partner.name,
          requestedBy: request.requestedBy.name,
          requestedByLocation: request.requestedBy.location,
          createdAt: request.createdAt.toISOString(),
          currentPlan: partnerPlanLabel({
            monthlySalary: toNumber(request.partner.monthlySalary),
            fixedPay: toNumber(request.partner.fixedPay),
            perDeliveryRate: toNumber(request.partner.perDeliveryRate),
            feeSharePercent: toNumber(request.partner.feeSharePercent),
          }),
          proposedPlan: partnerPlanLabel({
            monthlySalary: toNumber(request.proposedMonthlySalary),
            fixedPay: toNumber(request.proposedFixedPay),
            perDeliveryRate: toNumber(request.proposedPerDelivery),
            feeSharePercent: toNumber(request.proposedFeeShare),
          }),
          reason: request.reason,
          status: request.status,
        })),
        pendingCount:
          shaped.length + requests.filter((request) => request.status === "PENDING").length,
        audit: audit.map((entry) => ({
          id: entry.id,
          actor: entry.actor,
          action: entry.action,
          detail: entry.detail,
          at: entry.createdAt.toISOString(),
        })),
      }
    },

    async generatePayouts(principal: WorkspacePrincipal, workspaceSlug: string, cycle?: string) {
      const ctx = await cycleContext(principal, workspaceSlug, cycle)
      const dueDate = cycleDueDate(ctx.key)
      let created = 0
      for (const row of ctx.result.partners) {
        if (row.earnings.earnings <= 0) continue
        const code = payoutCode("PARTNER", ctx.key, row.partner.code ?? row.partner.id.slice(-6))
        const exists = await prisma.payout.findFirst({
          where: { workspaceId: row.partner.workspaceId, code },
        })
        if (exists) continue
        await prisma.payout.create({
          data: {
            workspaceId: row.partner.workspaceId,
            code,
            kind: "PARTNER",
            partnerId: row.partner.id,
            cycle: ctx.key,
            amount: row.earnings.earnings,
            dueDate,
          },
        })
        created += 1
      }
      for (const row of ctx.result.admins) {
        if (row.earnings.earnings <= 0) continue
        const code = payoutCode("ADMIN", ctx.key, row.admin.accountCode)
        const exists = await prisma.payout.findFirst({
          where: { workspaceId: row.admin.workspaceId, code },
        })
        if (exists) continue
        await prisma.payout.create({
          data: {
            workspaceId: row.admin.workspaceId,
            code,
            kind: "ADMIN",
            adminId: row.admin.id,
            cycle: ctx.key,
            amount: row.earnings.earnings,
            dueDate,
          },
        })
        created += 1
      }
      await audit(
        null,
        "Payouts generated",
        `${created} payouts generated for ${cycleLabel(ctx.key)}`,
      )
      return { created }
    },

    async decidePayout(
      principal: WorkspacePrincipal,
      workspaceSlug: string,
      payoutId: string,
      action: "approve" | "reject" | "pay",
    ) {
      const { ids } = await resolveScope(principal, workspaceSlug)
      const payout = await findPayout(ids, payoutId)
      if (action === "approve") {
        if (payout.status !== "PENDING_APPROVAL") fail("Only pending payouts can be approved", 409)
        await prisma.payout.update({
          where: { id: payout.id },
          data: { status: "APPROVED", approvedAt: new Date(), approvedBy: ACTOR },
        })
      } else if (action === "reject") {
        if (payout.status !== "PENDING_APPROVAL" && payout.status !== "APPROVED") {
          fail("Only pending or approved payouts can be rejected", 409)
        }
        await prisma.payout.update({ where: { id: payout.id }, data: { status: "REJECTED" } })
      } else {
        if (payout.status !== "APPROVED") fail("Only approved payouts can be marked paid", 409)
        await prisma.payout.update({
          where: { id: payout.id },
          data: { status: "PAID", paidAt: new Date() },
        })
      }
      const verb = { approve: "approved", reject: "rejected", pay: "marked paid" }[action]
      await audit(
        payout.workspaceId,
        `Payout ${verb}`,
        `${payout.code} · ${cycleLabel(payout.cycle)}`,
      )
      return { ok: true }
    },

    async recordRemittance(
      principal: WorkspacePrincipal,
      workspaceSlug: string,
      body: Record<string, unknown>,
    ) {
      const { ids } = await resolveScope(principal, workspaceSlug)
      const amount = requireNumber(body.amount, "amount", 0.01)
      const method = body.method
      if (method !== "CASH_DEPOSIT" && method !== "UPI" && method !== "BANK_TRANSFER") {
        fail("method must be CASH_DEPOSIT, UPI or BANK_TRANSFER", 400)
      }
      const partner = await prisma.deliveryPartner.findFirst({
        where: { id: String(body.partnerId ?? ""), workspaceId: { in: ids } },
      })
      if (!partner) fail("Partner not found", 404)
      await prisma.partnerRemittance.create({
        data: {
          workspaceId: partner.workspaceId,
          partnerId: partner.id,
          amount,
          method,
          note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
        },
      })
      await audit(
        partner.workspaceId,
        "Remittance recorded",
        `${partner.name} remitted ₹${Math.round(amount).toLocaleString("en-IN")} (${method.replace("_", " ").toLowerCase()})`,
      )
      return { ok: true }
    },

    async addAdjustment(
      principal: WorkspacePrincipal,
      workspaceSlug: string,
      body: Record<string, unknown>,
    ) {
      const { ids } = await resolveScope(principal, workspaceSlug)
      const amount = requireNumber(body.amount, "amount", 0.01)
      if (body.kind !== "BONUS" && body.kind !== "DEDUCTION") {
        fail("kind must be BONUS or DEDUCTION", 400)
      }
      if (typeof body.note !== "string" || body.note.trim().length === 0) {
        fail("A reason is required", 400)
      }
      const partnerId = typeof body.partnerId === "string" ? body.partnerId : undefined
      const adminId = typeof body.adminId === "string" ? body.adminId : undefined
      if (!partnerId && !adminId) fail("partnerId or adminId is required", 400)
      const target = partnerId
        ? await prisma.deliveryPartner.findFirst({
            where: { id: partnerId, workspaceId: { in: ids } },
          })
        : await prisma.adminAccount.findFirst({ where: { id: adminId, workspaceId: { in: ids } } })
      if (!target) fail("Account not found", 404)
      await prisma.payAdjustment.create({
        data: {
          workspaceId: target.workspaceId,
          partnerId: partnerId ?? null,
          adminId: adminId ?? null,
          kind: body.kind,
          amount,
          note: body.note.trim(),
        },
      })
      await audit(
        target.workspaceId,
        body.kind === "BONUS" ? "Bonus added" : "Deduction added",
        `${target.name}: ₹${Math.round(amount).toLocaleString("en-IN")} · ${body.note.trim()}`,
      )
      return { ok: true }
    },

    async updatePartnerPlan(
      principal: WorkspacePrincipal,
      workspaceSlug: string,
      partnerId: string,
      body: Record<string, unknown>,
    ) {
      const { ids } = await resolveScope(principal, workspaceSlug)
      const partner = await prisma.deliveryPartner.findFirst({
        where: { id: partnerId, workspaceId: { in: ids } },
      })
      if (!partner) fail("Partner not found", 404)
      const feeSharePercent = requireNumber(body.feeSharePercent, "feeSharePercent")
      if (feeSharePercent > 100) fail("feeSharePercent cannot exceed 100", 400)
      const plan = {
        monthlySalary: requireNumber(body.monthlySalary, "monthlySalary"),
        fixedPay: requireNumber(body.fixedPay, "fixedPay"),
        perDeliveryRate: requireNumber(body.perDeliveryRate, "perDeliveryRate"),
        feeSharePercent,
      }
      await prisma.deliveryPartner.update({ where: { id: partner.id }, data: plan })
      await audit(
        partner.workspaceId,
        "Pay plan changed",
        `${partner.name}: ${partnerPlanLabel(plan)}`,
      )
      return { ok: true }
    },

    async updateAdminPlan(
      principal: WorkspacePrincipal,
      workspaceSlug: string,
      adminId: string,
      body: Record<string, unknown>,
    ) {
      const { ids } = await resolveScope(principal, workspaceSlug)
      const admin = await prisma.adminAccount.findFirst({
        where: { id: adminId, workspaceId: { in: ids } },
      })
      if (!admin) fail("Admin account not found", 404)
      const commissionPercent = requireNumber(body.commissionPercent, "commissionPercent")
      const onTimeThreshold = requireNumber(body.onTimeThreshold, "onTimeThreshold")
      if (commissionPercent > 100 || onTimeThreshold > 100)
        fail("Percentages cannot exceed 100", 400)
      const plan = {
        monthlySalary: requireNumber(body.monthlySalary, "monthlySalary"),
        commissionPercent,
        incentiveAmount: requireNumber(body.incentiveAmount, "incentiveAmount"),
        onTimeThreshold,
      }
      await prisma.adminAccount.update({ where: { id: admin.id }, data: plan })
      await audit(
        admin.workspaceId,
        "Admin pay plan changed",
        `${admin.name}: ${adminPlanLabel(plan)}`,
      )
      return { ok: true }
    },

    async decideChangeRequest(
      principal: WorkspacePrincipal,
      workspaceSlug: string,
      requestId: string,
      action: "approve" | "reject",
    ) {
      const { ids } = await resolveScope(principal, workspaceSlug)
      const request = await prisma.payChangeRequest.findFirst({
        where: { id: requestId, workspaceId: { in: ids } },
        include: { partner: true },
      })
      if (!request) fail("Request not found", 404)
      if (request.status !== "PENDING") fail("This request has already been decided", 409)
      if (action === "approve") {
        await prisma.deliveryPartner.update({
          where: { id: request.partnerId },
          data: {
            monthlySalary: request.proposedMonthlySalary,
            fixedPay: request.proposedFixedPay,
            perDeliveryRate: request.proposedPerDelivery,
            feeSharePercent: request.proposedFeeShare,
          },
        })
      }
      await prisma.payChangeRequest.update({
        where: { id: request.id },
        data: { status: action === "approve" ? "APPROVED" : "REJECTED", decidedAt: new Date() },
      })
      await audit(
        request.workspaceId,
        action === "approve" ? "Pay change approved" : "Pay change rejected",
        `${request.code} · ${request.partner.name}`,
      )
      return { ok: true }
    },
  }
}
