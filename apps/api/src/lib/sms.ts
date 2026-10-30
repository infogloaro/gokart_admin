// Sends sign-in codes by SMS.
// - "dev" (default): the message goes to the local Mailpit inbox as an email to
//   <number>@sms.local, so codes can be tested without an SMS provider.
// - "msg91": real SMS through MSG91's Flow API. Indian SMS needs DLT registration;
//   the DLT-approved template must contain the variable ##otp##.
import { env, isProd } from "../config/env"
import { HttpError } from "./errors"
import { sendMail } from "./mailer"

const unavailable = () =>
  new HttpError(
    503,
    "sms_unavailable",
    "SMS codes aren't available right now. Choose another method.",
  )

export async function sendOtpSms(phone: string, code: string) {
  const text = `${code} is your GoKart Admin sign-in code. It expires in 10 minutes. Do not share it with anyone.`

  if (env.SMS_PROVIDER === "msg91") {
    if (!env.MSG91_AUTH_KEY || !env.MSG91_TEMPLATE_ID) throw unavailable()
    const res = await fetch("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: {
        authkey: env.MSG91_AUTH_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        template_id: env.MSG91_TEMPLATE_ID,
        short_url: "0",
        recipients: [{ mobiles: phone.replace("+", ""), otp: code }],
      }),
    }).catch(() => null)
    if (!res?.ok) {
      console.error("MSG91 send failed", res?.status, await res?.text().catch(() => ""))
      throw unavailable()
    }
    return
  }

  // The dev outbox must never be used for real members.
  if (isProd) throw unavailable()
  await sendMail(`${phone.replace("+", "")}@sms.local`, `SMS to ${phone}`, text)
  console.info(`[dev] SMS to ${phone}: ${text}`)
}
