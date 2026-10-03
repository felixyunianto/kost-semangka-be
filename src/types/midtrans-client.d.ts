declare module "midtrans-client" {
  interface MidtransConfig {
    isProduction: boolean;
    serverKey: string;
    clientKey?: string;
  }

  interface TransactionDetails {
    order_id: string;
    gross_amount: number;
  }

  interface QrisConfig {
    acquirer?: string;
  }

  interface BcaVaConfig {
    bank?: 'bca'
  }

  interface ChargeParameter {
    payment_type: "qris" | 'bank_transfer';
    transaction_details: TransactionDetails;
    qris?: QrisConfig;
    bank_transfer?: BcaVaConfig,
  }

  interface TransactionAction {
    name: string;
    method: string;
    url: string;
  }

  interface ChargeResponse {
    transaction_time?: string;
    transaction_status?: string;
    transaction_id?: string;
    status_code?: string;
    status_message?: string;
    order_id?: string;
    gross_amount?: string;
    payment_type?: string;
    expiry_time?: string;
    actions?: TransactionAction[];
  }

  interface MidtransWebhookPayload {
    transaction_time: string;
    transaction_status: string;
    transaction_id: string;
    status_code: string;
    signature_key: string;
    order_id: string;
    gross_amount: string;
    payment_type: string;
    fraud_status?: string;
    expiry_time?: string;
  }

  class CoreApi {
    constructor(config: MidtransConfig);

    charge(parameter: ChargeParameter): Promise<ChargeResponse>;
  }

  class Snap {
    constructor(config: MidtransConfig);

    createTransaction(parameter: {
      transaction_details: TransactionDetails;
      customer_details?: {
        first_name?: string;
        email?: string;
        phone?: string;
      };
      enabled_payments?: string[];
    }): Promise<{
      token: string;
      redirect_url: string;
    }>;
  }
}
