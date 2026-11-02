import {
  CreatePartnerRequest,
  DocumentVerifyRequest,
  PartnerDraftRequest,
  PartnerDecisionRequest,
  PartnerListQuery,
  UpdatePartnerRequest,
} from "@zoauro/shared"
import type { Request, Response } from "express"
import { parse } from "../../lib/errors"
import { actorOf, currentMember, scope } from "../../middleware/auth"
import * as service from "./partners.service"

export async function list(req: Request, res: Response) {
  const q = parse(PartnerListQuery, req.query)
  const s = scope(req, q.business)
  res.json(
    await service.list(
      { ...s, status: q.status, availability: q.availability, search: q.search },
      q.page,
      q.pageSize,
      q.sort,
    ),
  )
}

export async function summary(req: Request, res: Response) {
  const q = parse(PartnerListQuery.pick({ business: true }), req.query)
  res.json(await service.summary(scope(req, q.business)))
}

export async function get(req: Request<{ id: string }>, res: Response) {
  res.json(await service.get(req.params.id, scope(req)))
}

export async function create(req: Request, res: Response) {
  const body = parse(CreatePartnerRequest, req.body)
  res.status(201).json(await service.create(body, scope(req), actorOf(req)))
}

export async function getDraft(req: Request, res: Response) {
  res.setHeader("Cache-Control", "private, no-store")
  res.json(await service.getDraft(currentMember(req).id, scope(req)))
}

export async function saveDraft(req: Request, res: Response) {
  const member = currentMember(req)
  const body = parse(PartnerDraftRequest, req.body)
  res.setHeader("Cache-Control", "private, no-store")
  res.json(await service.saveDraft(member.id, scope(req), body))
}

export async function decide(req: Request<{ id: string }>, res: Response) {
  const body = parse(PartnerDecisionRequest, req.body)
  res.json(await service.decide(req.params.id, scope(req), body, actorOf(req)))
}

export async function update(req: Request<{ id: string }>, res: Response) {
  const body = parse(UpdatePartnerRequest, req.body)
  res.json(await service.update(req.params.id, scope(req), body, actorOf(req)))
}

// ---- documents ----

export async function uploadDocument(req: Request<{ id: string; kind: string }>, res: Response) {
  res.status(201).json(
    await service.uploadDocument(
      req.params.id,
      scope(req),
      req.params.kind,
      {
        body: req.body,
        contentType: req.headers["content-type"],
        fileName: req.get("x-file-name"),
      },
      actorOf(req),
    ),
  )
}

export async function documentFile(req: Request<{ id: string; docId: string }>, res: Response) {
  const f = await service.documentFile(req.params.id, req.params.docId, scope(req))
  res.setHeader("Content-Type", f.contentType)
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(f.fileName)}`)
  res.setHeader("Cache-Control", "private, no-store")
  res.send(f.body)
}

export async function verifyDocument(req: Request<{ id: string; docId: string }>, res: Response) {
  const body = parse(DocumentVerifyRequest, req.body)
  res.json(
    await service.verifyDocument(
      req.params.id,
      req.params.docId,
      scope(req),
      body.verified,
      actorOf(req),
    ),
  )
}
