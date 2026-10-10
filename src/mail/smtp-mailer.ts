import nodemailer, { type Transporter } from 'nodemailer';
import type { Config } from '../config/env.ts';
import type { Mailer, MailMessage } from './mailer.ts';

export class SmtpMailer implements Mailer {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: Pick<Config, 'smtp' | 'mailFrom'>) {
    const { host, port, user, pass } = config.smtp;
    this.from = config.mailFrom;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = TLS langsung, 587 = STARTTLS
      auth: { user, pass },
    });
  }

  verify(): Promise<true> {
    return this.transporter.verify();
  }

  async send({ to, subject, text, html }: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to, subject, text, html });
  }
}
