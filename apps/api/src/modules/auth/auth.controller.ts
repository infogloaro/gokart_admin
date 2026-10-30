import {
  ForgotPasswordRequest,
  LoginRequest,
  PasswordConfirmRequest,
  RecoveryLoginRequest,
  ResendCodeRequest,
  SendCodeRequest,
  TotpConfirmRequest,
  VerifyCodeRequest,
} from "@zoauro/shared"
import type { Request, Response } from "express"
import { parse } from "../../lib/errors"
import { createSession, destroySession } from "../../lib/session"
import { actorOf, currentMember } from "../../middleware/auth"
import * as service from "./auth.service"

export async function login(req: Request, res: Response) {
  res.json(await service.startLogin(parse(LoginRequest, req.body), req.ip))
}

export async function sendCode(req: Request, res: Response) {
  const { challengeId, method } = parse(SendCodeRequest, req.body)
  res.json(await service.sendCode(challengeId, method))
}

export async function verify(req: Request, res: Response) {
  const { challengeId, code } = parse(VerifyCodeRequest, req.body)
  const member = await service.verifyLogin(challengeId, code, actorOf(req))
  await createSession(res, member.id, { userAgent: req.get("user-agent"), ip: req.ip })
  res.json(await service.me(member))
}

export async function resend(req: Request, res: Response) {
  const { challengeId } = parse(ResendCodeRequest, req.body)
  res.json(await service.resendCode(challengeId))
}

export async function logout(req: Request, res: Response) {
  await service.signOut(actorOf(req))
  await destroySession(res, req.sessionToken)
  res.status(204).end()
}

export async function me(req: Request, res: Response) {
  res.json(await service.me(currentMember(req)))
}

export async function totpSetup(req: Request, res: Response) {
  res.set("Cache-Control", "no-store").json(await service.startTotpSetup(currentMember(req)))
}

// Responses carrying secrets or backup codes must never be cached.
const noStore = (res: Response) => res.set("Cache-Control", "no-store")

export async function totpConfirm(req: Request, res: Response) {
  const { code } = parse(TotpConfirmRequest, req.body)
  noStore(res).json(await service.confirmTotpSetup(currentMember(req), code, actorOf(req)))
}

export async function verifyRecovery(req: Request, res: Response) {
  const { challengeId, recoveryCode } = parse(RecoveryLoginRequest, req.body)
  const member = await service.verifyRecoveryLogin(challengeId, recoveryCode, actorOf(req))
  await createSession(res, member.id, { userAgent: req.get("user-agent"), ip: req.ip })
  res.json(await service.me(member))
}

export async function regenerateRecoveryCodes(req: Request, res: Response) {
  const { password } = parse(PasswordConfirmRequest, req.body)
  noStore(res).json(
    await service.regenerateRecoveryCodes(currentMember(req), password, actorOf(req)),
  )
}

export async function totpDisable(req: Request, res: Response) {
  const { password } = parse(PasswordConfirmRequest, req.body)
  await service.disableTotp(currentMember(req), password, actorOf(req))
  res.status(204).end()
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = parse(ForgotPasswordRequest, req.body)
  await service.requestPasswordReset(email.trim().toLowerCase())
  res.status(204).end()
}
