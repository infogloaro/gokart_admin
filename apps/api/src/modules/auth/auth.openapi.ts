import {
  CodeSent,
  ForgotPasswordRequest,
  LoginChallenge,
  LoginRequest,
  Me,
  PasswordConfirmRequest,
  RecoveryCodes,
  RecoveryLoginRequest,
  ResendCodeRequest,
  SendCodeRequest,
  TotpConfirmRequest,
  TotpSetup,
  VerifyCodeRequest,
} from "@zoauro/shared"
import { registry, json, noContent, errors } from "../../openapi/registry"

const tags = ["Auth"]
const LoginChallengeRef = registry.register("LoginChallenge", LoginChallenge)
const CodeSentRef = registry.register("CodeSent", CodeSent)
const MeRef = registry.register("Me", Me)
const RecoveryCodesRef = registry.register("RecoveryCodes", RecoveryCodes)

registry.registerPath({
  method: "post",
  path: "/auth/login",
  tags,
  summary: "Check email or mobile number and password; lists the ways to get a code",
  request: { body: json(LoginRequest) },
  responses: { 200: json(LoginChallengeRef, "Choose a method"), ...errors(400, 401, 429) },
})
registry.registerPath({
  method: "post",
  path: "/auth/send-code",
  tags,
  summary:
    "Use the chosen method: email or SMS sends a code; an authenticator app needs nothing sent",
  request: { body: json(SendCodeRequest) },
  responses: { 200: json(CodeSentRef, "Ready for the code"), ...errors(400, 410, 429, 503) },
})
registry.registerPath({
  method: "post",
  path: "/auth/verify",
  tags,
  summary: "Check the code and start a session (sets the gk_session cookie)",
  request: { body: json(VerifyCodeRequest) },
  responses: { 200: json(MeRef, "Signed in"), ...errors(400, 410, 429) },
})
registry.registerPath({
  method: "post",
  path: "/auth/resend",
  tags,
  summary: "Send another code by the method already chosen",
  request: { body: json(ResendCodeRequest) },
  responses: { 200: json(CodeSentRef, "Code sent"), ...errors(400, 410, 429, 503) },
})
registry.registerPath({
  method: "post",
  path: "/auth/forgot-password",
  tags,
  summary: "Ask for a password reset",
  request: { body: json(ForgotPasswordRequest) },
  responses: { 204: noContent, ...errors(400, 429) },
})
registry.registerPath({
  method: "post",
  path: "/auth/logout",
  tags,
  summary: "End the current session",
  responses: { 204: noContent, ...errors(401) },
})
registry.registerPath({
  method: "get",
  path: "/auth/me",
  tags,
  summary: "The signed-in member",
  responses: { 200: json(MeRef, "Current member"), ...errors(401) },
})
registry.registerPath({
  method: "post",
  path: "/auth/totp/setup",
  tags,
  summary: "Start authenticator-app setup",
  responses: { 200: json(TotpSetup, "QR code and setup key"), ...errors(400, 401) },
})
registry.registerPath({
  method: "post",
  path: "/auth/totp/confirm",
  tags,
  summary: "Confirm authenticator-app setup; returns the backup codes (shown once)",
  request: { body: json(TotpConfirmRequest) },
  responses: { 200: json(RecoveryCodesRef, "Backup codes"), ...errors(400, 401, 410) },
})
registry.registerPath({
  method: "post",
  path: "/auth/verify-recovery",
  tags,
  summary: "Sign in with a one-time backup code instead of the authenticator app",
  request: { body: json(RecoveryLoginRequest) },
  responses: { 200: json(MeRef, "Signed in"), ...errors(400, 410, 429) },
})
registry.registerPath({
  method: "post",
  path: "/auth/totp/recovery-codes",
  tags,
  summary: "Replace the backup codes (needs the password)",
  request: { body: json(PasswordConfirmRequest) },
  responses: { 200: json(RecoveryCodesRef, "New backup codes"), ...errors(400, 401, 429) },
})
registry.registerPath({
  method: "post",
  path: "/auth/totp/disable",
  tags,
  summary: "Turn the authenticator app off (needs the password)",
  request: { body: json(PasswordConfirmRequest) },
  responses: { 204: noContent, ...errors(400, 401, 429) },
})
