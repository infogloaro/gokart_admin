import {
  AssignFleetZoneRequest,
  CreateDeliveryFleetRequest,
  DeliveryBoyAssignmentRequest,
  DeliveryBoyCorrectionRequest,
  DeliveryBoyDocumentVerifyRequest,
  DeliveryBoyListQuery,
  DeliveryBoyOtpRequest,
  DeliveryBoyReviewRequest,
  DeliveryBoySubmissionRequest,
  DeliveryBoyOrderStatusRequest,
  DeliveryFleetListQuery,
  DeliveryFleetReviewRequest,
  RequestDeliveryFleetRequest,
  RotateCredentialRequest,
  UpdateDeliveryFleetRequest,
} from "@zoauro/shared"
import type { Request, Response } from "express"
import { notFound, parse, unauthorized } from "../../lib/errors"
import { actorOf, currentMember } from "../../middleware/auth"
import * as service from "./delivery.service"

export async function fleets(req: Request, res: Response) {
  res.json(await service.listFleets(parse(DeliveryFleetListQuery, req.query), currentMember(req)))
}

export async function createFleet(req: Request, res: Response, issueCredential: () => string) {
  const body = parse(CreateDeliveryFleetRequest, req.body)
  res.status(201).json(await service.createFleet(body, actorOf(req), issueCredential))
}

export async function requestFleet(req: Request, res: Response) {
  const body = parse(RequestDeliveryFleetRequest, req.body)
  res.status(201).json(await service.requestFleet(body, currentMember(req), actorOf(req)))
}

export async function reviewFleet(req: Request, res: Response, issueCredential: () => string) {
  const id = req.params.id
  if (typeof id !== "string") throw notFound("Delivery partner")
  const body = parse(DeliveryFleetReviewRequest, req.body)
  res.json(await service.reviewFleet(id, body, actorOf(req), issueCredential))
}

export async function updateFleet(req: Request<{ id: string }>, res: Response) {
  const body = parse(UpdateDeliveryFleetRequest, req.body)
  res.json(await service.updateFleet(req.params.id, body, actorOf(req)))
}

export async function fleetHistory(req: Request<{ id: string }>, res: Response) {
  res.json(await service.fleetHistory(req.params.id, currentMember(req)))
}

export async function suggestRiders(req: Request<{ id: string }>, res: Response) {
  res.json(await service.suggestRiders(req.params.id, currentMember(req)))
}

export async function fleetBoyHistory(req: Request<{ id: string }>, res: Response) {
  res.json(await service.fleetBoyHistory(requiredFleetId(req), req.params.id))
}

export async function boyHistory(req: Request<{ id: string }>, res: Response) {
  res.json(await service.boyHistory(req.params.id, currentMember(req)))
}

export async function rotateCredential(req: Request, res: Response, issueCredential: () => string) {
  const id = req.params.id
  if (typeof id !== "string") throw notFound("Delivery partner")
  const body = parse(RotateCredentialRequest, req.body)
  res.json(await service.rotateCredential(id, body, actorOf(req), issueCredential))
}

export async function assignZone(req: Request<{ id: string; zoneId: string }>, res: Response) {
  const body = parse(AssignFleetZoneRequest, req.body)
  await service.assignZone(req.params.id, req.params.zoneId, body, actorOf(req))
  res.status(204).end()
}

export async function boys(req: Request, res: Response) {
  res.json(await service.listBoys(parse(DeliveryBoyListQuery, req.query), currentMember(req)))
}

export async function boy(req: Request<{ id: string }>, res: Response) {
  res.json(await service.getBoy(req.params.id, currentMember(req)))
}

export async function reviewBoy(req: Request<{ id: string }>, res: Response) {
  const body = parse(DeliveryBoyReviewRequest, req.body)
  res.json(await service.reviewBoy(req.params.id, body, currentMember(req), actorOf(req)))
}

export async function verifyBoyDocument(
  req: Request<{ id: string; docId: string }>,
  res: Response,
) {
  const body = parse(DeliveryBoyDocumentVerifyRequest, req.body)
  res.json(
    await service.verifyBoyDocument(
      req.params.id,
      req.params.docId,
      body,
      currentMember(req),
      actorOf(req),
    ),
  )
}

export async function boyDocumentFile(req: Request<{ id: string; docId: string }>, res: Response) {
  const file = await service.boyDocumentFile(req.params.id, req.params.docId, currentMember(req))
  res.setHeader("Content-Type", file.contentType)
  res.setHeader(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
  )
  res.setHeader("Cache-Control", "private, no-store")
  res.send(file.body)
}

export async function fleetBoys(req: Request, res: Response) {
  res.json(await service.listFleetBoys(requiredFleetId(req)))
}

export async function fleetProfile(req: Request, res: Response) {
  res.json(await service.fleetProfile(requiredFleetId(req)))
}

export async function sendBoyOtp(req: Request, res: Response) {
  const body = parse(DeliveryBoyOtpRequest, req.body)
  res.json(await service.sendDeliveryBoyOtp(requiredFleetId(req), body))
}

export async function fleetOrders(req: Request, res: Response) {
  res.json(await service.fleetOrders(requiredFleetId(req)))
}

export async function assignOrder(req: Request<{ orderId: string }>, res: Response) {
  const body = parse(DeliveryBoyAssignmentRequest, req.body)
  res
    .status(200)
    .json(
      await service.assignOrderToBoy(
        requiredFleetId(req),
        req.params.orderId,
        body,
        await fleetActor(req),
      ),
    )
}

export async function changeFleetOrderStatus(req: Request<{ orderId: string }>, res: Response) {
  const body = parse(DeliveryBoyOrderStatusRequest, req.body)
  res.json(
    await service.changeFleetOrderStatus(
      requiredFleetId(req),
      req.params.orderId,
      body,
      await fleetActor(req),
    ),
  )
}

export async function boyNotifications(req: Request<{ id: string }>, res: Response) {
  res.json(await service.listBoyNotifications(requiredFleetId(req), req.params.id))
}

export async function readBoyNotification(
  req: Request<{ id: string; notificationId: string }>,
  res: Response,
) {
  await service.readBoyNotification(requiredFleetId(req), req.params.id, req.params.notificationId)
  res.status(204).end()
}

export async function submitBoy(req: Request, res: Response) {
  const body = parse(DeliveryBoySubmissionRequest, req.body)
  res.status(201).json(await service.submitBoy(requiredFleetId(req), body, await fleetActor(req)))
}

export async function correctBoy(req: Request<{ id: string }>, res: Response) {
  const body = parse(DeliveryBoyCorrectionRequest, req.body)
  res.json(
    await service.correctBoy(requiredFleetId(req), req.params.id, body, await fleetActor(req)),
  )
}

export async function uploadBoyDocument(req: Request<{ id: string; kind: string }>, res: Response) {
  res.status(201).json(
    await service.uploadBoyDocument(
      requiredFleetId(req),
      req.params.id,
      req.params.kind,
      {
        body: req.body,
        contentType: req.headers["content-type"],
        fileName: req.get("x-file-name"),
      },
      await fleetActor(req),
    ),
  )
}

function requiredFleetId(req: Request) {
  if (!req.deliveryFleetId) throw unauthorized("Partner credential required.")
  return req.deliveryFleetId
}

async function fleetActor(req: Request) {
  const fleetId = requiredFleetId(req)
  return service.fleetActor(fleetId)
}
