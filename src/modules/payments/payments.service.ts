import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "crypto";
import * as Midtrans from "midtrans-client";

import { Prisma } from "@prisma/client";

import { normalizeNameQuery } from "src/common/utils/normalize-name";
import { getPaginationParams, paginate } from "src/common/utils/pagination";
import { PrismaService } from "src/prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import {
  endOfBusinessInstant,
  isPastDue,
  resolveLateFeeAmount,
  startOfBusinessInstant,
} from "../bills/late-fee";
import { FilterPaymentsDto } from "./dto/filter-payments.dto";
import { renderPaymentPage } from "./payment-page";

const ownerBillInclude = {
  occupant: {
    include: {
      room: {
        include: {
          property: {
            include: {
              owner: true,
              setting: true,
            },
          },
        },
      },
    },
  },
  payment: true,
} satisfies Prisma.BillInclude;

const paymentListInclude = {
  bill: {
    select: {
      id: true,
      invoiceNumber: true,
      type: true,
      status: true,
      amount: true,
      lateFeeAmount: true,
      dueDate: true,
      paidAt: true,
      occupant: {
        select: {
          id: true,
          fullName: true,
          email: true,
          room: {
            select: {
              id: true,
              name: true,
              property: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  private coreApi: Midtrans.CoreApi;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {
    const isProduction =
      this.configService.get<string>("MIDTRANS_IS_PRODUCTION") === "true";

    const serverKey = this.configService.getOrThrow<string>(
      "MIDTRANS_SERVER_KEY",
    );

    this.coreApi = new Midtrans.CoreApi({
      isProduction,
      serverKey,
    });
  }

  async findAll(userId: string, query: FilterPaymentsDto) {
    this.assertPaidDateRange(query.paidFrom, query.paidTo);

    const { page, limit, skip, take } = getPaginationParams(query);
    const where = this.buildFindAllWhere(userId, query);

    const [payments, total] = await this.prismaService.$transaction([
      this.prismaService.payment.findMany({
        where,
        include: paymentListInclude,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take,
      }),
      this.prismaService.payment.count({ where }),
    ]);

    return paginate(
      payments.map((payment) => this.toPaymentListResponse(payment)),
      page,
      limit,
      total,
    );
  }

  async findOne(userId: string, paymentId: string) {
    const payment = await this.prismaService.payment.findFirst({
      where: {
        id: paymentId,
        ...this.ownerPaymentWhere(userId),
      },
      include: {
        ...paymentListInclude,
        charges: {
          select: {
            id: true,
            gatewayReference: true,
            amount: true,
            status: true,
            expiredAt: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException("Payment not found.");
    }

    return this.toPaymentDetailResponse(payment);
  }

  async sendInvoice(userId: string, billId: string) {
    await this.findOwnerBill(userId, billId);

    const result = await this.chargeAndNotify(billId);

    if (!result.sent) {
      if (result.reason === "no-email") {
        throw new NotFoundException("Occupant email not found.");
      }

      throw new ConflictException("This bill cannot be charged.");
    }

    return {
      message: "Payment invoice sent to occupant.",
      payment: result.payment,
    };
  }

  async markPaidCash(userId: string, billId: string) {
    const bill = await this.findOwnerBill(userId, billId);

    if (bill.status === "PAID") {
      throw new ConflictException("This bill is already paid.");
    }

    if (bill.status === "CANCELLED") {
      throw new ConflictException("Cancelled bills cannot be marked as paid.");
    }

    const paidAt = new Date();
    const lateFeeAmount = this.getLateFeeAmount(bill);
    const payableAmount = this.getPayableAmount(bill.amount, lateFeeAmount);

    await this.prismaService.$transaction([
      this.prismaService.bill.update({
        where: {
          id: bill.id,
        },
        data: {
          status: "PAID",
          paidAt,
        },
      }),
      ...(bill.payment
        ? [
            this.prismaService.payment.update({
              where: {
                id: bill.payment.id,
              },
              data: {
                status: "PAID",
                paidAt,
                qrCode: null,
              },
            }),
          ]
        : []),
    ]);

    if (bill.payment) {
      await this.paymentCharges.updateMany({
        where: {
          paymentId: bill.payment.id,
          status: "PENDING",
        },
        data: {
          status: "SUPERSEDED",
        },
      });
    }

    const occupant = bill.occupant;
    const room = occupant?.room;
    const propertyName = room?.property.name
    const period = this.formatPeriod(bill.periodStart, bill.periodEnd);
    const paidAtLabel = paidAt.toLocaleString("id-ID");

    if (occupant?.email) {
      await this.mailService.sendPaymentSuccessToOccupant({
        email: occupant.email,
        name: occupant.fullName,
        invoiceNumber: bill.invoiceNumber,
        amount: payableAmount.toString(),
        rentAmount: bill.amount.toString(),
        lateFeeAmount: lateFeeAmount.toString(),
        period,
        paidAt: paidAtLabel,
        propertyName: propertyName ? propertyName : ''
      });
    }

    const owner = occupant?.room.property.owner;

    if (occupant && owner) {
      await this.mailService.sendPaymentSuccessToOwner({
        email: owner.email,
        ownerName: owner.fullName,
        occupantName: occupant.fullName,
        roomName: occupant.room.name,
        invoiceNumber: bill.invoiceNumber,
        billType: bill.type,
        period,
        amount: payableAmount.toString(),
        rentAmount: bill.amount.toString(),
        lateFeeAmount: lateFeeAmount.toString(),
        paidAt: paidAtLabel,
        transactionId: "CASH",
        propertyName: propertyName ? propertyName : ''
      });
    }

    return {
      message: "Bill marked as paid in cash.",
    };
  }

  async chargeAndNotify(billId: string) {
    const bill = await this.prismaService.bill.findFirst({
      where: {
        id: billId,
        deletedAt: null,
      },
      include: ownerBillInclude,
    });

    if (!bill) {
      throw new NotFoundException("Bill not found.");
    }

    if (bill.status === "PAID" || bill.status === "CANCELLED") {
      return {
        sent: false as const,
        reason: "unpayable" as const,
      };
    }

    if (!bill.occupant?.email) {
      return {
        sent: false as const,
        reason: "no-email" as const,
      };
    }

    const payableBill = await this.applyOverdueLateFee(bill);
    const payment = await this.ensureCharge(payableBill);
    await this.syncChargedBillStatus(payableBill);

    const payToken = this.getPayToken(payment);

    if (!payToken) {
      throw new NotFoundException("Payment token is missing.");
    }

    const payUrl = this.buildPayUrl(payToken);
    await this.sendPaymentEmail(payableBill, payment, payUrl);

    return {
      sent: true as const,
      payment: {
        id: payment.id,
        status: payment.status,
        qrCode: payment.qrCode,
        expiredAt: payment.expiredAt,
        payUrl,
      },
    };
  }

  async getPublicPaymentPage(token: string) {
    const payment = await this.prismaService.payment.findFirst({
      where: {
        payToken: token,
      } as Prisma.PaymentWhereInput,
      include: {
        bill: {
          include: ownerBillInclude,
        },
      },
    });

    if (!payment) {
      throw new NotFoundException("Payment not found.");
    }

    const payableBill =
      payment.status === "PAID" || payment.bill.status === "PAID"
        ? payment.bill
        : await this.applyOverdueLateFee(payment.bill);

    const freshPayment =
      payment.status === "PAID" || payableBill.status === "PAID"
        ? payment
        : await this.ensureCharge({
            ...payment.bill,
            ...payableBill,
          });

    if (freshPayment.status === "PENDING" && payableBill.status !== "PAID") {
      await this.syncChargedBillStatus(payableBill);
    }

    const bill = payableBill;
    const occupant = bill.occupant;

    if (!occupant) {
      throw new NotFoundException("Occupant not found for this bill.");
    }

    const lateFeeAmount = this.getLateFeeAmount(bill);
    const payableAmount = this.getPayableAmount(bill.amount, lateFeeAmount);

    return renderPaymentPage({
      status:
        freshPayment.status === "PAID" || bill.status === "PAID"
          ? "PAID"
          : freshPayment.status,
      occupantName: occupant.fullName,
      propertyName: occupant.room.property.name,
      roomName: occupant.room.name,
      invoiceNumber: bill.invoiceNumber,
      period: this.formatPeriod(bill.periodStart, bill.periodEnd),
      amount: payableAmount.toString(),
      dueDate: bill.dueDate?.toLocaleDateString("id-ID") ?? "-",
      qrCode: freshPayment.qrCode,
      vaNumber: freshPayment.vaNumber ?? null,
      bankName: freshPayment.bankName ?? null,
      expiredAt: freshPayment.expiredAt?.toLocaleString("id-ID") ?? null,
    });
  }

  async handleWebhook(notification: Midtrans.MidtransWebhookPayload) {
    const isValid = this.verifyWebhookSignature(notification);

    if (!isValid) throw new UnauthorizedException("Invalid midtrans signature");

    const matched = await this.findPaymentByGatewayReference(
      notification.transaction_id,
    );

    if (!matched) {
      return {
        message: "Payment not found, ignored.",
      };
    }

    const { payment, charge } = matched;
    const transactionStatus = notification.transaction_status;
    const fraudStatus = notification.fraud_status;

    if (
      transactionStatus === "settlement" ||
      (transactionStatus === "capture" && fraudStatus === "accept")
    ) {
      if (payment.status === "PAID" || payment.bill.status === "PAID") {
        if (charge && charge.status !== "PAID") {
          await this.paymentCharges.update({
            where: { id: charge.id },
            data: { status: "PAID" },
          });
        }

        return {
          message: "Webhook processed successfully",
        };
      }

      const expectedAmount = charge?.amount ?? payment.amount;

      if (!this.isSameAmount(notification.gross_amount, expectedAmount)) {
        console.error(
          `Webhook amount mismatch for ${notification.transaction_id}: expected ${expectedAmount.toString()}, got ${notification.gross_amount}`,
        );
      }

      const paidAt = new Date();

      await this.prismaService.$transaction([
        this.prismaService.payment.update({
          where: {
            id: payment.id,
          },
          data: {
            status: "PAID",
            paidAt,
          },
        }),
        this.prismaService.bill.update({
          where: { id: payment.billId },
          data: {
            status: "PAID",
            paidAt,
          },
        }),
        ...(charge
          ? [
              this.paymentCharges.update({
                where: {
                  id: charge.id,
                },
                data: {
                  status: "PAID",
                },
              }),
            ]
          : []),
      ]);

      const occupant = payment.bill.occupant;

      if (!occupant?.email) {
        return {
          message: "Webhook processed successfully",
        };
      }

      const room = occupant.room;
      const propertyName = room.property.name
      const owner = room.property.owner;
      const lateFeeAmount = this.getLateFeeAmount(payment.bill);
      const period = this.formatPeriod(
        payment.bill.periodStart,
        payment.bill.periodEnd,
      );

      await this.mailService.sendPaymentSuccessToOccupant({
        email: occupant.email,
        name: occupant.fullName,
        invoiceNumber: payment.bill.invoiceNumber,
        amount: expectedAmount.toString(),
        rentAmount: payment.bill.amount.toString(),
        lateFeeAmount: lateFeeAmount.toString(),
        period,
        paidAt: paidAt.toLocaleString("id-ID"),
        propertyName
      });

      if (owner) {
        await this.mailService.sendPaymentSuccessToOwner({
          email: owner.email,
          ownerName: owner.fullName,
          occupantName: occupant.fullName,
          roomName: room.name,
          invoiceNumber: payment.bill.invoiceNumber,
          billType: payment.bill.type,
          period,
          amount: expectedAmount.toString(),
          rentAmount: payment.bill.amount.toString(),
          lateFeeAmount: lateFeeAmount.toString(),
          paidAt: paidAt.toLocaleString("id-ID"),
          transactionId: notification.transaction_id ?? "-",
          propertyName
        });
      }

      return {
        message: "Webhook processed successfully",
      };
    }

    if (transactionStatus === "expire") {
      await this.completeCharge(charge?.id, "EXPIRED");
      if (this.isCurrentCharge(payment, notification.transaction_id)) {
        await this.revertUnpaidPayment(payment.id, payment.bill);
      }
      return {
        message: "Webhook processed successfully",
      };
    }

    if (transactionStatus === "cancel" || transactionStatus === "deny") {
      await this.completeCharge(charge?.id, "FAILED");
      if (this.isCurrentCharge(payment, notification.transaction_id)) {
        await this.revertUnpaidPayment(payment.id, payment.bill, "FAILED");
      }
      return {
        message: "Webhook processed successfully",
      };
    }

    return {
      message: "Payment status received",
      status: transactionStatus,
    };
  }

  private buildFindAllWhere(
    userId: string,
    query: FilterPaymentsDto,
  ): Prisma.PaymentWhereInput {
    const invoiceNumber = query.invoiceNumber?.trim();
    const occupantName = normalizeNameQuery(query.occupantName);

    return {
      ...(query.status && { status: query.status }),
      ...(query.gateway && { gateway: query.gateway }),
      ...(query.billId && { billId: query.billId }),
      ...(query.paidFrom || query.paidTo
        ? {
            paidAt: {
              ...(query.paidFrom && {
                gte: startOfBusinessInstant(new Date(query.paidFrom)),
              }),
              ...(query.paidTo && {
                lte: endOfBusinessInstant(new Date(query.paidTo)),
              }),
            },
          }
        : {}),
      bill: {
        deletedAt: null,
        ...(invoiceNumber && {
          invoiceNumber: {
            contains: invoiceNumber,
            mode: "insensitive",
          },
        }),
        occupant: {
          ...(query.occupantId && { id: query.occupantId }),
          ...(occupantName && {
            fullName: {
              contains: occupantName,
              mode: "insensitive",
            },
          }),
          room: {
            ...(query.propertyId && { propertyId: query.propertyId }),
            property: {
              ownerId: userId,
              deletedAt: null,
            },
          },
        },
      },
    };
  }

  private ownerPaymentWhere(userId: string): Prisma.PaymentWhereInput {
    return {
      bill: {
        deletedAt: null,
        occupant: {
          room: {
            property: {
              ownerId: userId,
              deletedAt: null,
            },
          },
        },
      },
    };
  }

  private assertPaidDateRange(paidFrom?: string, paidTo?: string) {
    if (!paidFrom || !paidTo) {
      return;
    }

    if (new Date(paidFrom) > new Date(paidTo)) {
      throw new BadRequestException("paidFrom cannot be greater than paidTo.");
    }
  }

  private toPaymentListResponse(
    payment: Prisma.PaymentGetPayload<{ include: typeof paymentListInclude }>,
  ) {
    const { qrCode: _qrCode, ...paymentData } = payment;

    return {
      ...paymentData,
      payUrl: this.buildPayUrl(payment.payToken),
    };
  }

  private toPaymentDetailResponse(
    payment: Prisma.PaymentGetPayload<{
      include: typeof paymentListInclude;
    }> & {
      charges: Array<{
        id: string;
        gatewayReference: string;
        amount: Prisma.Decimal;
        status: string;
        expiredAt: Date | null;
        createdAt: Date;
      }>;
    },
  ) {
    return {
      ...this.toPaymentListResponse(payment),
      qrCode: payment.qrCode,
      charges: payment.charges,
    };
  }

  private async findOwnerBill(userId: string, billId: string) {
    const bill = await this.prismaService.bill.findFirst({
      where: {
        id: billId,
        deletedAt: null,
        occupant: {
          room: {
            property: {
              ownerId: userId,
              deletedAt: null,
            },
          },
        },
      },
      include: ownerBillInclude,
    });

    if (!bill) {
      throw new NotFoundException("Bill not found.");
    }

    return bill;
  }

  private async applyOverdueLateFee(
    bill: Prisma.BillGetPayload<{ include: typeof ownerBillInclude }>,
  ) {
    if (bill.status === "PAID" || bill.status === "CANCELLED") {
      return bill;
    }

    const lateFeeAmount = resolveLateFeeAmount({
      dueDate: bill.dueDate,
      amount: bill.amount,
      currentLateFee: bill.lateFeeAmount,
      payment: bill.payment,
      setting: bill.occupant?.room.property.setting,
    });

    const isOverdue = isPastDue(bill.dueDate);
    const nextStatus = isOverdue ? "OVERDUE" : bill.status;

    if (
      new Prisma.Decimal(bill.lateFeeAmount).eq(lateFeeAmount) &&
      bill.status === nextStatus
    ) {
      return bill;
    }

    const updated = await this.prismaService.bill.update({
      where: {
        id: bill.id,
      },
      data: {
        lateFeeAmount,
        ...(nextStatus !== bill.status && {
          status: nextStatus,
        }),
      },
    });

    return {
      ...bill,
      ...updated,
    };
  }

  private async ensureCharge(
    bill: Prisma.BillGetPayload<{ include: typeof ownerBillInclude }>,
  ) {
    const existing = bill.payment;

    if (existing?.status === "PAID" || bill.status === "PAID") {
      if (!existing) {
        throw new ConflictException("This bill has already been paid.");
      }

      return existing;
    }

    const payableAmount = this.getPayableAmount(
      bill.amount,
      this.getLateFeeAmount(bill),
    );

    if (existing && !this.needsNewCharge(existing, payableAmount)) {
      return existing;
    }

    if (
      existing &&
      this.isChargeCoolingDown(existing) &&
      new Prisma.Decimal(existing.amount).eq(payableAmount)
    ) {
      return existing;
    }

    const threshold = new Prisma.Decimal(
      parseInt(process.env.QRIS_THRESHOLD || "0"),
    );
    const isQris = payableAmount.lt(threshold);

    let chargeResult: any;
    let paymentData: any;
    const payToken = this.getPayToken(existing) ?? this.generatePayToken();
    const now = new Date();

    if (isQris) {
      chargeResult = await this.chargeQris(bill.invoiceNumber, payableAmount);
      paymentData = {
        gatewayReference: chargeResult.gatewayReference,
        amount: payableAmount,
        status: "PENDING" as const,
        qrCode: chargeResult.qrCode,
        vaNumber: null,
        bankName: null,
        expiredAt: chargeResult.expiredAt,
        payToken,
        lastChargedAt: now,
      };
    } else {
      chargeResult = await this.chargeBcaVa(bill.invoiceNumber, payableAmount);
      paymentData = {
        gatewayReference: chargeResult.gatewayReference,
        amount: payableAmount,
        status: "PENDING" as const,
        qrCode: null,
        vaNumber: chargeResult.vaNumber,
        bankName: chargeResult.bankName,
        expiredAt: chargeResult.expiredAt,
        payToken,
        lastChargedAt: now,
      };
    }

    if (existing) {
      if (existing.gatewayReference) {
        await this.paymentCharges.updateMany({
          where: {
            paymentId: existing.id,
            gatewayReference: existing.gatewayReference,
            status: "PENDING",
          },
          data: {
            status: "SUPERSEDED",
          },
        });
      }

      const payment = await this.prismaService.payment.update({
        where: {
          id: existing.id,
        },
        data: paymentData as Prisma.PaymentUncheckedUpdateInput,
      });

      await this.recordCharge(existing.id, chargeResult, payableAmount);
      return payment;
    }

    const payment = await this.prismaService.payment.create({
      data: {
        billId: bill.id,
        gateway: "MIDTRANS",
        ...paymentData,
      } as Prisma.PaymentUncheckedCreateInput,
    });

    await this.recordCharge(payment.id, chargeResult, payableAmount);
    return payment;
  }

  private async recordCharge(
    paymentId: string,
    charge: {
      gatewayReference?: string;
      qrCode: string | null;
      expiredAt: Date | null;
    },
    amount: Prisma.Decimal,
  ) {
    if (!charge.gatewayReference) {
      return;
    }

    await this.paymentCharges.create({
      data: {
        paymentId,
        gatewayReference: charge.gatewayReference,
        amount,
        qrCode: charge.qrCode,
        expiredAt: charge.expiredAt,
        status: "PENDING",
      },
    });
  }

  private async findPaymentByGatewayReference(gatewayReference?: string) {
    if (!gatewayReference) {
      return null;
    }

    const charge = await this.paymentCharges.findFirst({
      where: {
        gatewayReference,
      },
      include: {
        payment: {
          include: {
            bill: {
              include: ownerBillInclude,
            },
          },
        },
      },
    });

    if (charge) {
      return {
        charge,
        payment: charge.payment,
      };
    }

    const payment = await this.prismaService.payment.findFirst({
      where: {
        gatewayReference,
      },
      include: {
        bill: {
          include: ownerBillInclude,
        },
      },
    });

    if (!payment) {
      return null;
    }

    return {
      charge: null,
      payment,
    };
  }

  private isCurrentCharge(
    payment: { gatewayReference?: string | null },
    gatewayReference?: string,
  ) {
    return Boolean(
      gatewayReference && payment.gatewayReference === gatewayReference,
    );
  }

  private async completeCharge(
    chargeId: string | undefined,
    status: "EXPIRED" | "FAILED",
  ) {
    if (!chargeId) {
      return;
    }

    await this.paymentCharges.update({
      where: {
        id: chargeId,
      },
      data: {
        status,
      },
    });
  }

  private get paymentCharges() {
    type PaymentRecord = Prisma.PaymentGetPayload<{
      include: { bill: { include: typeof ownerBillInclude } };
    }>;

    return (
      this.prismaService as PrismaService & {
        paymentCharge: {
          create: (
            args: Record<string, unknown>,
          ) => ReturnType<PrismaService["payment"]["create"]>;
          update: (
            args: Record<string, unknown>,
          ) => ReturnType<PrismaService["payment"]["update"]>;
          updateMany: (
            args: Record<string, unknown>,
          ) => ReturnType<PrismaService["payment"]["updateMany"]>;
          findFirst: (args: Record<string, unknown>) => Promise<{
            id: string;
            amount: Prisma.Decimal;
            status: string;
            payment: PaymentRecord;
          } | null>;
        };
      }
    ).paymentCharge;
  }

  private isChargeCoolingDown(payment: {
    expiredAt?: Date | null;
    lastChargedAt?: Date | null;
  }) {
    const lastChargedAt = (payment as { lastChargedAt?: Date | null })
      .lastChargedAt;

    if (!lastChargedAt) {
      return false;
    }

    return Date.now() - lastChargedAt.getTime() < 60_000;
  }

  private isSameAmount(
    incomingAmount: string | number | undefined,
    expectedAmount: Prisma.Decimal,
  ) {
    if (incomingAmount === undefined) {
      return false;
    }

    return new Prisma.Decimal(incomingAmount).eq(expectedAmount);
  }

  private needsNewCharge(
    payment: {
      status: string;
      qrCode: string | null;
      expiredAt: Date | null;
      amount: Prisma.Decimal;
    },
    payableAmount: Prisma.Decimal,
  ) {
    if (["EXPIRED", "FAILED", "CANCELLED"].includes(payment.status)) {
      return true;
    }

    if (!payment.qrCode) {
      return true;
    }

    if (!new Prisma.Decimal(payment.amount).eq(payableAmount)) {
      return true;
    }

    return Boolean(
      payment.expiredAt && payment.expiredAt.getTime() <= Date.now(),
    );
  }

  private async chargeQris(invoiceNumber: string, amount: Prisma.Decimal) {
    const response = (await this.coreApi.charge({
      payment_type: "qris",
      transaction_details: {
        order_id: `${invoiceNumber}-${Date.now()}`,
        gross_amount: Number(amount),
      },
      qris: {
        acquirer: "gopay",
      },
    })) as {
      transaction_id?: string;
      expiry_time?: string;
      qr_string?: string;
      actions?: Array<{ name?: string; url?: string }>;
    };

    const qrUrl =
      response.actions?.find((action) => {
        const name = action.name?.toLowerCase() ?? "";
        return name.includes("qr") || Boolean(action.url?.includes("qr"));
      })?.url ?? null;

    const qrCode =
      qrUrl ??
      (response.qr_string
        ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(
            response.qr_string,
          )}`
        : null);

    if (!qrCode) {
      console.error("Midtrans QRIS response missing QR image", {
        transactionId: response.transaction_id,
        hasActions: Boolean(response.actions?.length),
        hasQrString: Boolean(response.qr_string),
      });
    }

    return {
      gatewayReference: response.transaction_id,
      qrCode,
      expiredAt: response.expiry_time ? new Date(response.expiry_time) : null,
    };
  }

  private async chargeBcaVa(invoiceNumber: string, amount: Prisma.Decimal) {
    const numericAmount = Number(amount);

    const response = (await this.coreApi.charge({
      payment_type: "bank_transfer",
      transaction_details: {
        order_id: `${invoiceNumber}-${Date.now()}`,
        gross_amount: numericAmount,
      },
      bank_transfer: {
        bank: "bca",
      },
    })) as {
      transaction_id?: string;
      expiry_time?: string;
      va_numbers?: Array<{ back: string; va_number: string }>;
      permata_va_number?: string;
    };

    const vaNumber = response.va_numbers?.[0]?.va_number ?? null;

    if (!vaNumber) {
      console.error("Midtrans BCA VA response missing VA number", {
        transactionId: response.transaction_id,
        response,
      });
    }

    return {
      gatewayReference: response.transaction_id,
      vaNumber,
      bankName: "BCA",
      expiredAt: response.expiry_time ? new Date(response.expiry_time) : null,
    };
  }

  private async syncChargedBillStatus(bill: {
    id: string;
    dueDate: Date | null;
  }) {
    const isOverdue = isPastDue(bill.dueDate);

    await this.prismaService.bill.update({
      where: {
        id: bill.id,
      },
      data: {
        status: isOverdue ? "OVERDUE" : "PENDING",
      },
    });
  }

  private async revertUnpaidPayment(
    paymentId: string,
    bill: { id: string; status: string; dueDate: Date | null },
    paymentStatus: "EXPIRED" | "FAILED" = "EXPIRED",
  ) {
    if (bill.status === "PAID") {
      return;
    }

    const isOverdue = isPastDue(bill.dueDate);

    await this.prismaService.$transaction([
      this.prismaService.payment.update({
        where: {
          id: paymentId,
        },
        data: {
          status: paymentStatus,
        },
      }),
      this.prismaService.bill.update({
        where: {
          id: bill.id,
        },
        data: {
          status: isOverdue ? "OVERDUE" : "UNPAID",
        },
      }),
    ]);
  }

  private async sendPaymentEmail(
    bill: Prisma.BillGetPayload<{ include: typeof ownerBillInclude }>,
    payment: {
      qrCode: string | null;
      expiredAt: Date | null;
    },
    payUrl: string,
  ) {
    const occupant = bill.occupant;

    if (!occupant?.email) {
      return;
    }

    const lateFeeAmount = this.getLateFeeAmount(bill);
    const payableAmount = this.getPayableAmount(bill.amount, lateFeeAmount);

    await this.mailService.sendBillPaymentToOccupant({
      email: occupant.email,
      name: occupant.fullName,
      invoiceNumber: bill.invoiceNumber,
      amount: payableAmount.toString(),
      rentAmount: bill.amount.toString(),
      lateFeeAmount: lateFeeAmount.toString(),
      dueDate: bill.dueDate?.toLocaleDateString("id-ID") ?? "-",
      period: this.formatPeriod(bill.periodStart, bill.periodEnd),
      roomName: occupant.room.name,
      propertyName: occupant.room.property.name,
      payUrl,
    });
  }

  buildPayUrl(payToken: string) {
    const appUrl = (
      this.configService.get<string>("APP_URL") ?? "http://localhost:3000"
    ).replace(/\/$/, "");

    return `${appUrl}/payments/pay/${payToken}`;
  }

  private getPayToken(
    payment?: { id?: string; payToken?: string | null } | null,
  ) {
    const payToken = (
      payment as { payToken?: string | null } | null | undefined
    )?.payToken;

    return typeof payToken === "string" ? payToken : undefined;
  }

  private generatePayToken() {
    return randomBytes(32).toString("hex");
  }

  private formatPeriod(periodStart?: Date | null, periodEnd?: Date | null) {
    return `${periodStart?.toLocaleDateString("id-ID") ?? "-"} - ${
      periodEnd?.toLocaleDateString("id-ID") ?? "-"
    }`;
  }

  private getLateFeeAmount(bill: { amount: Prisma.Decimal }) {
    const lateFeeAmount = (
      bill as { lateFeeAmount?: Prisma.Decimal | number | string | null }
    ).lateFeeAmount;

    return new Prisma.Decimal(lateFeeAmount ?? 0);
  }

  private getPayableAmount(
    amount: Prisma.Decimal,
    lateFeeAmount: Prisma.Decimal,
  ) {
    return new Prisma.Decimal(amount).add(lateFeeAmount);
  }

  private verifyWebhookSignature(
    notification: Midtrans.MidtransWebhookPayload,
  ) {
    const serverKey = this.configService.getOrThrow<string>(
      "MIDTRANS_SERVER_KEY",
    );

    const signature = createHash("sha512")
      .update(
        notification.order_id +
          notification.status_code +
          notification.gross_amount +
          serverKey,
      )
      .digest("hex");

    return signature === notification.signature_key;
  }
}
