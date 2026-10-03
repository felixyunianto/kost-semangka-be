import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { Resend } from "resend";
import { formatRupiah } from "src/common/helpers/format-currency";
import { formatDate } from "src/common/helpers/format-date";

@Injectable()
export class MailService {
  private readonly resend: Resend;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  private getRecipient(email: string): string {
    if (process.env.NODE_ENV === "development") {
      return process.env.EMAIL_TEST_RECIPIENT ?? email;
    }

    return email;
  }

  async sendEmail(
    email: string,
    subject: string,
    html: string,
    options?: { toActualRecipient?: boolean },
  ) {
    const recipient = options?.toActualRecipient
      ? email
      : this.getRecipient(email);

    const { error } = await this.resend.emails.send({
      from: process.env.MAIL_FROM ?? "onboarding@resend.dev",
      to: recipient,
      subject,
      html,
    });

    if (error) {
      console.error("Failed to send email.", error);
      throw new InternalServerErrorException(
        error.message ?? "Failed to send email.",
      );
    }

    return {
      deliveredTo: recipient,
    };
  }

  async sendOccupantDeliveryTest(
    email: string,
    name: string,
    propertyName?: string,
  ) {
    return this.sendEmail(
      email,
      `${propertyName} - Tes notifikasi email`,
      `
        <!doctype html>
        <html lang="id">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Konfirmasi Email - ${propertyName}</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 0;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); overflow: hidden;">
                    
                    <!-- Header Banner dengan warna utama #1b4f8a -->
                    <tr>
                      <td style="background: #1b4f8a; padding: 24px; text-align: center; color: #ffffff;">
                        <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">${propertyName}</h1>
                      </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                      <td style="padding: 32px 24px;">
                        <h2 style="margin-top: 0; margin-bottom: 16px; font-size: 18px; color: #1b4f8a;">Halo, ${name}! 👋</h2>
                        
                        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                          Email ini dikirim untuk memastikan bahwa alamat email kamu sudah benar dan aktif untuk menerima notifikasi tagihan serta informasi pembayaran dari <strong>${propertyName}</strong>.
                        </p>

                        <!-- Info Box dengan warna soft & aksen primary -->
                        <div style="background: #e8f1f8; border-left: 4px solid #1b4f8a; padding: 14px 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
                          <p style="margin: 0; font-size: 14px; color: #153e6d; line-height: 1.5;">
                            ✨ Kalau pesan ini sudah sampai dengan baik, maka informasi tagihan selanjutnya akan otomatis dikirimkan melalui email ini.
                          </p>
                        </div>

                        <p style="margin: 0; font-size: 14px; color: #94a3b8; line-height: 1.5;">
                          Terima kasih,<br>
                          <strong style="color: #1b4f8a;">Pengelola ${propertyName}</strong>
                        </p>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                          Pesan otomatis, mohon tidak membalas email ini.
                        </p>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
      { toActualRecipient: true },
    );
  }

  async sendPasswordResetOtp(email: string, otp: string) {
    const { error } = await this.resend.emails.send({
      from: process.env.MAIL_FROM ?? "onboarding@resend.dev",
      to: email,
      subject: "Password Reset Verification Code",
      html: `
            <!doctype html>
            <html lang="id">
              <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>Reset Password</title>
              </head>
              <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 0;">
                  <tr>
                    <td align="center">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); overflow: hidden;">
                        
                        <!-- Body Content -->
                        <tr>
                          <td style="padding: 40px 32px; text-align: center;">
                            <h2 style="margin-top: 0; margin-bottom: 12px; font-size: 22px; color: #1b4f8a;">Reset Password</h2>
                            
                            <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                              Use the verification code below to reset your password:
                            </p>

                            <!-- OTP Box -->
                            <div style="background: #e8f1f8; border: 2px dashed #1b4f8a; border-radius: 12px; padding: 18px; margin-bottom: 24px; display: inline-block; width: 100%; box-sizing: border-box;">
                              <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1b4f8a;">${otp}</span>
                            </div>

                            <p style="margin: 0 0 24px 0; font-size: 14px; color: #64748b;">
                              This verification code will expire in <strong>5 minutes</strong>.
                            </p>

                            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

                            <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5;">
                              If you did not request a password reset, you can safely ignore this email.
                            </p>
                          </td>
                        </tr>

                      </table>
                    </td>
                  </tr>
                </table>
              </body>
            </html>
            `,
    });

    if (error) {
      throw new InternalServerErrorException("Failed to send email.");
    }
  }

  async sendPaymentSuccessToOccupant(data: {
    email: string;
    name: string;
    invoiceNumber: string;
    amount: string;
    rentAmount?: string;
    lateFeeAmount?: string;
    period: string;
    paidAt: string;
    propertyName: string;
  }) {
    const formattedRent = formatRupiah(data.rentAmount ?? data.amount);
    const formattedLateFee = formatRupiah(data.lateFeeAmount ?? 0);
    const formattedTotal = formatRupiah(data.amount);

    await this.sendEmail(
      data.email,
      "Payment Successful",
      `
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Payment Successful</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 0;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); overflow: hidden;">
                    
                    <!-- Header Banner with Property Name Variable -->
                    <tr>
                      <td style="background: #1b4f8a; padding: 24px; text-align: center; color: #ffffff;">
                        <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">${data.propertyName}</h1>
                      </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                      <td style="padding: 32px 24px;">
                        <div style="text-align: center; margin-bottom: 24px;">
                          <div style="width: 48px; height: 48px; background: #e8f1f8; color: #1b4f8a; font-size: 24px; line-height: 48px; border-radius: 50%; margin: 0 auto 12px; font-weight: bold;">✓</div>
                          <h2 style="margin: 0 0 8px 0; font-size: 20px; color: #1b4f8a;">Payment Successful</h2>
                          <p style="margin: 0; font-size: 15px; color: #475569;">
                            Hello ${data.name}, your payment has been successfully received.
                          </p>
                        </div>

                        <!-- Receipt Box -->
                        <div style="background: #f1f5f9; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 14px;">
                            <tr>
                              <td style="padding: 6px 0; color: #64748b;">Invoice</td>
                              <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${data.invoiceNumber}</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #64748b;">Period</td>
                              <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${data.period}</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #64748b;">Rent</td>
                              <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${formattedRent}</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #64748b;">Late Fee</td>
                              <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${formattedLateFee}</td>
                            </tr>
                            <tr>
                              <td colspan="2" style="padding: 12px 0 6px 0;"><hr style="border: none; border-top: 1px solid #cbd5e1; margin: 0;" /></td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; font-size: 15px; font-weight: 600; color: #1b4f8a;">Total Paid</td>
                              <td style="padding: 6px 0; text-align: right; font-size: 16px; font-weight: 700; color: #1b4f8a;">${formattedTotal}</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #64748b; font-size: 13px;">Paid At</td>
                              <td style="padding: 6px 0; text-align: right; color: #475569; font-size: 13px;">${data.paidAt}</td>
                            </tr>
                          </table>
                        </div>

                        <p style="margin: 0; font-size: 13px; color: #94a3b8; text-align: center; line-height: 1.5;">
                          Thank you for your payment! Please keep this email as a receipt of your transaction.
                        </p>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                          Automated notification from ${data.propertyName}. Please do not reply to this email.
                        </p>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    );
  }

  async sendPaymentSuccessToOwner(data: {
    email: string;
    ownerName: string;
    occupantName: string;
    roomName: string;
    invoiceNumber: string;
    billType: string;
    period: string;
    amount: string;
    rentAmount?: string;
    lateFeeAmount?: string;
    paidAt: string;
    transactionId: string;
    propertyName: string;
  }) {
    const formattedRent = formatRupiah(data.rentAmount ?? data.amount);
    const formattedLateFee = formatRupiah(data.lateFeeAmount ?? 0);
    const formattedTotal = formatRupiah(data.amount);

    await this.sendEmail(
      data.email,
      "Payment Received",
      `
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Payment Received</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 0;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); overflow: hidden;">
                    
                    <!-- Header Banner dengan Property Name -->
                    <tr>
                      <td style="background: #1b4f8a; padding: 24px; text-align: center; color: #ffffff;">
                        <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">${data.propertyName}</h1>
                      </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                      <td style="padding: 32px 24px;">
                        <div style="text-align: center; margin-bottom: 24px;">
                          <div style="width: 48px; height: 48px; background: #e8f1f8; color: #1b4f8a; font-size: 24px; line-height: 48px; border-radius: 50%; margin: 0 auto 12px; font-weight: bold;">✓</div>
                          <h2 style="margin: 0 0 8px 0; font-size: 20px; color: #1b4f8a;">Payment Received</h2>
                          <p style="margin: 0; font-size: 15px; color: #475569;">
                            Hello ${data.ownerName}, a new payment has been successfully received.
                          </p>
                        </div>

                        <!-- Receipt Box -->
                        <div style="background: #f1f5f9; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 14px;">
                            <tr>
                              <td style="padding: 6px 0; color: #64748b;">Property</td>
                              <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1b4f8a;">${data.propertyName}</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #64748b;">Occupant</td>
                              <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${data.occupantName}</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #64748b;">Room</td>
                              <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${data.roomName}</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #64748b;">Invoice</td>
                              <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${data.invoiceNumber}</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #64748b;">Bill Type</td>
                              <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${data.billType}</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #64748b;">Period</td>
                              <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${data.period}</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #64748b;">Rent</td>
                              <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${formattedRent}</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #64748b;">Late Fee</td>
                              <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${formattedLateFee}</td>
                            </tr>
                            <tr>
                              <td colspan="2" style="padding: 12px 0 6px 0;"><hr style="border: none; border-top: 1px solid #cbd5e1; margin: 0;" /></td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; font-size: 15px; font-weight: 600; color: #1b4f8a;">Amount Paid</td>
                              <td style="padding: 6px 0; text-align: right; font-size: 16px; font-weight: 700; color: #1b4f8a;">${formattedTotal}</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #64748b; font-size: 13px;">Paid At</td>
                              <td style="padding: 6px 0; text-align: right; color: #475569; font-size: 13px;">${data.paidAt}</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #64748b; font-size: 13px;">Gateway</td>
                              <td style="padding: 6px 0; text-align: right; color: #475569; font-size: 13px;">Midtrans</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #64748b; font-size: 13px;">Transaction ID</td>
                              <td style="padding: 6px 0; text-align: right; color: #475569; font-size: 13px; word-break: break-all;">${data.transactionId}</td>
                            </tr>
                          </table>
                        </div>

                        <p style="margin: 0; font-size: 13px; color: #94a3b8; text-align: center; line-height: 1.5;">
                          This is an automated notification regarding a successful transaction on your property.
                        </p>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                          Please do not reply to this automated email.
                        </p>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    );
  }

  async sendBillReminderToOccupant(data: {
    email: string;
    name: string;
    invoiceNumber: string;
    amount: string;
    rentAmount?: string;
    lateFeeAmount?: string;
    dueDate: string;
    period: string;
    roomName: string;
    propertyName: string;
    payUrl?: string;
  }) {
    await this.sendEmail(
      data.email,
      "Bill Reminder",
      this.renderBillEmail({
        title: "Bill Reminder",
        intro: "This is a reminder that you have a bill that is due soon.",
        ctaLabel: "Open payment page",
        ...data,
      }),
    );
  }

  async sendBillPaymentToOccupant(data: {
    email: string;
    name: string;
    invoiceNumber: string;
    amount: string;
    rentAmount?: string;
    lateFeeAmount?: string;
    dueDate: string;
    period: string;
    roomName: string;
    propertyName: string;
    payUrl: string;
  }) {
    await this.sendEmail(
      data.email,
      "Invoice Payment",
      this.renderBillEmail({
        title: "Invoice Payment",
        intro:
          "You have a bill that is ready to be paid. Open the payment page to view the QRIS and complete the payment.",
        ctaLabel: "Pay now",
        ...data,
      }),
    );
  }

  private renderBillEmail(data: {
    title: string;
    intro: string;
    name: string;
    invoiceNumber: string;
    amount: string;
    rentAmount?: string;
    lateFeeAmount?: string;
    dueDate: string;
    period: string;
    roomName: string;
    propertyName: string;
    payUrl?: string;
    ctaLabel: string;
  }) {
    const formattedRent = formatRupiah(data.rentAmount ?? data.amount);
    const formattedLateFee = formatRupiah(data.lateFeeAmount ?? 0);
    const formattedTotal = formatRupiah(data.amount);
    const formattedDueDate = formatDate(data.dueDate);

    return `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${data.title}</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 0;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); overflow: hidden;">
                  
                  <!-- Header Banner dengan Property Name -->
                  <tr>
                    <td style="background: #1b4f8a; padding: 24px; text-align: center; color: #ffffff;">
                      <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">${data.propertyName}</h1>
                    </td>
                  </tr>

                  <!-- Body Content -->
                  <tr>
                    <td style="padding: 32px 24px;">
                      <h2 style="margin-top: 0; margin-bottom: 12px; font-size: 20px; color: #1b4f8a; text-align: center;">${data.title}</h2>
                      
                      <p style="margin: 0 0 20px 0; font-size: 15px; color: #475569; text-align: center;">
                        Hello ${data.name},
                      </p>

                      <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #475569; text-align: center;">
                        ${data.intro}
                      </p>

                      <!-- Bill Details Box -->
                      <div style="background: #f1f5f9; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 14px;">
                          <tr>
                            <td style="padding: 6px 0; color: #64748b;">Property</td>
                            <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1b4f8a;">${data.propertyName}</td>
                          </tr>
                          <tr>
                            <td style="padding: 6px 0; color: #64748b;">Room</td>
                            <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${data.roomName}</td>
                          </tr>
                          <tr>
                            <td style="padding: 6px 0; color: #64748b;">Invoice</td>
                            <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${data.invoiceNumber}</td>
                          </tr>
                          <tr>
                            <td style="padding: 6px 0; color: #64748b;">Period</td>
                            <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${data.period}</td>
                          </tr>
                          <tr>
                            <td style="padding: 6px 0; color: #64748b;">Rent</td>
                            <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${formattedRent}</td>
                          </tr>
                          <tr>
                            <td style="padding: 6px 0; color: #64748b;">Late Fee</td>
                            <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">${formattedLateFee}</td>
                          </tr>
                          <tr>
                            <td colspan="2" style="padding: 12px 0 6px 0;"><hr style="border: none; border-top: 1px solid #cbd5e1; margin: 0;" /></td>
                          </tr>
                          <tr>
                            <td style="padding: 6px 0; font-size: 15px; font-weight: 600; color: #1b4f8a;">Total Payable</td>
                            <td style="padding: 6px 0; text-align: right; font-size: 16px; font-weight: 700; color: #1b4f8a;">${formattedTotal}</td>
                          </tr>
                          <tr>
                            <td style="padding: 6px 0; color: #64748b; font-size: 13px;">Due Date</td>
                            <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #dc2626; font-size: 13px;">${formattedDueDate}</td>
                          </tr>
                        </table>
                      </div>

                      <!-- CTA Button -->
                      ${
                        data.payUrl
                          ? `<div style="text-align: center; margin-bottom: 24px;">
                              <a href="${data.payUrl}" style="background-color: #1b4f8a; color: #ffffff; padding: 12px 28px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block; box-shadow: 0 4px 12px rgba(27, 79, 138, 0.3);">${data.ctaLabel ?? "View Payment"}</a>
                            </div>`
                          : ""
                      }

                      <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.5;">
                        If you have already made the payment, please ignore this message.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                      <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                        Automated billing notification from ${data.propertyName}. Please do not reply to this email.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }
}
