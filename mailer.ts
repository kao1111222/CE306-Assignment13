import nodemailer from "nodemailer";

export function getMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  const port = Number(SMTP_PORT || 587);
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM || !Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }
  return {
    transporter: nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    }),
    from: SMTP_FROM,
  };
}
