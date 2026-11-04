// Delivery proof: a photo of the delivered order, taken by the rider. Stored in object storage and
// shown to the Admin and Super Admin on the order.
import type { MemberContext } from "../../middleware/auth"
import { badRequest, conflict, notFound } from "../../lib/errors"
import { prisma } from "../../lib/prisma"
import { getObject, putObject } from "../../lib/storage"

const MAX_BYTES = 5 * 1024 * 1024
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

export async function uploadProof(
  fleetId: string,
  boyId: string,
  orderId: string,
  body: { contentType: string; data: string },
) {
  const extension = EXTENSIONS[body.contentType]
  if (!extension) throw badRequest("Send a JPG, PNG or WEBP photo.")
  const buffer = Buffer.from(body.data, "base64")
  if (buffer.length === 0 || buffer.length > MAX_BYTES)
    throw badRequest("The photo must be smaller than 5 MB.")
  const order = await prisma.order.findFirst({
    where: { id: orderId, deliveryFleetId: fleetId, deliveryBoyId: boyId },
    select: { status: true },
  })
  if (!order) throw notFound("Assigned order")
  if (!["picked_up", "out_for_delivery", "delivered"].includes(order.status))
    throw conflict("Add the photo after you pick the order up.")
  const key = `proof/${orderId}.${extension}`
  await putObject(key, buffer, body.contentType)
  await prisma.order.update({
    where: { id: orderId },
    data: { proofKey: key, proofContentType: body.contentType, proofAt: new Date() },
  })
}

/** The proof photo, for a member who can see the order. */
export async function readProof(orderId: string, member: MemberContext) {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      ...(member.role !== "super_admin" && {
        zoneId: { in: member.zoneIds },
        business: { in: member.businesses },
      }),
    },
    select: { proofKey: true, proofContentType: true },
  })
  if (!order?.proofKey) throw notFound("Delivery proof")
  const buffer = await getObject(order.proofKey)
  if (!buffer) throw notFound("Delivery proof")
  return { buffer, contentType: order.proofContentType ?? "application/octet-stream" }
}
