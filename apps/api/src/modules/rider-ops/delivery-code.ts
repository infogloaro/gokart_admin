// The delivery code: a 4-digit code texted to the customer when a rider is assigned. The rider
// asks the customer for it at the door. Only a keyed hash is stored, and wrong guesses are limited.
import { randomInt, timingSafeEqual } from "node:crypto"
import { hashForLookup } from "../../lib/crypto"
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import { redis } from "../../lib/redis"
import { sendOtpSms } from "../../lib/sms"

const MAX_WRONG_CODES = 5
const WINDOW_SECONDS = 15 * 60

const codeHash = (orderId: string, code: string) =>
  hashForLookup("delivery-code", `${orderId}:${code}`)
const attemptsKey = (orderId: string) => `delivery-code:wrong:${orderId}`

/** Issues a new code for the order and texts it to the customer. Earlier codes stop working. */
export async function issueDeliveryCode(
  orderId: string,
  db: Pick<typeof prisma, "order"> = prisma,
) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { customerPhone: true },
  })
  if (!order) return
  const code = String(randomInt(0, 10_000)).padStart(4, "0")
  await db.order.update({
    where: { id: orderId },
    data: { deliveryOtpHash: codeHash(orderId, code), otpVerifiedAt: null },
  })
  await redis.del(attemptsKey(orderId))
  await sendOtpSms(order.customerPhone, code, "delivery").catch((error: unknown) =>
    console.error("Delivery code SMS failed", error),
  )
}

/** The rider checks the customer's code. Five wrong codes lock checking for 15 minutes. */
export async function verifyDeliveryCode(
  fleetId: string,
  boyId: string,
  orderId: string,
  code: string,
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deliveryFleetId: fleetId, deliveryBoyId: boyId },
    select: { deliveryOtpHash: true, otpVerifiedAt: true },
  })
  if (!order) throw notFound("Assigned order")
  if (order.otpVerifiedAt) return
  if (!order.deliveryOtpHash) throw conflict("No delivery code has been sent for this order yet.")
  const key = attemptsKey(orderId)
  const wrong = await redis.incr(key)
  if (wrong === 1) await redis.expire(key, WINDOW_SECONDS)
  if (wrong > MAX_WRONG_CODES)
    throw forbidden("Too many wrong codes. The Admin can send the customer a new code.")
  const given = Buffer.from(codeHash(orderId, code))
  const expected = Buffer.from(order.deliveryOtpHash)
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    throw badRequest("That code is wrong. Check it with the customer.")
  await prisma.order.update({ where: { id: orderId }, data: { otpVerifiedAt: new Date() } })
  await redis.del(key)
}
