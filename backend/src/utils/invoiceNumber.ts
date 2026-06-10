// backend/src/utils/invoiceNumber.ts

const INVOICE_PREFIX = "INV";

export const generateInvoiceNumber = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random    = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${INVOICE_PREFIX}-${timestamp}-${random}`;
};