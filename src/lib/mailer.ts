import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';

export function smtpConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

export async function sendMagicLink(to: string, link: string): Promise<void> {
  const subject = 'Your sign-in link for the research dashboard';
  const text = `Use this link to sign in (valid for 15 minutes, single use):\n\n${link}\n\nIf you did not request this, ignore this email.`;

  const fileTransport = process.env.MAIL_TRANSPORT === 'file'; // explicit opt-in, for local testing only
  if (fileTransport || !smtpConfigured()) {
    if (!fileTransport && process.env.NODE_ENV === 'production') {
      throw new Error('SMTP is not configured; cannot send sign-in links in production');
    }
    // Local testing only: write the link to a local outbox instead of sending email.
    const dir = path.resolve('./data');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'dev-outbox.log'), JSON.stringify({ at: new Date().toISOString(), to, link }) + '\n');
    console.log(`[dev-mail] sign-in link for ${to}: ${link}`);
    return;
  }

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html: `<p>Use this link to sign in (valid for 15 minutes, single use):</p><p><a href="${link}">Sign in to the research dashboard</a></p><p>If you did not request this, ignore this email.</p>`,
  });
}
