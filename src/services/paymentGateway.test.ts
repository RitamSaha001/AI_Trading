import { describe, it, expect } from 'vitest';
import {
  validateCardLuhn,
  detectCardBrand,
  formatCardNumberSpacing,
  validateUPIVpa,
  buildUPIUrl,
  generatePaperModeUPIQRCodeSvg,
  paperModeTokenizeCardLocally,
  ZeroCostSandboxGateway,
} from './paymentGateway';

describe('Payment Gateway & Security Services', () => {
  describe('Card Luhn Validation & Formatting', () => {
    it('validates genuine Luhn card numbers and rejects invalid numbers', () => {
      // Standard Luhn test vectors
      expect(validateCardLuhn('4532015112830366')).toBe(true); // Valid Visa
      expect(validateCardLuhn('4532 0151 1283 0366')).toBe(true); // With spaces
      expect(validateCardLuhn('4532015112830367')).toBe(false); // Invalid check digit
      expect(validateCardLuhn('1234')).toBe(false); // Too short
    });

    it('detects card issuer brands accurately', () => {
      expect(detectCardBrand('4532015112830366')).toBe('visa');
      expect(detectCardBrand('5425233430109903')).toBe('mastercard');
      expect(detectCardBrand('378282246310005')).toBe('amex');
      expect(detectCardBrand('6069812345678901')).toBe('rupay');
      expect(detectCardBrand('6521501234567890')).toBe('rupay');
      expect(detectCardBrand('9999999999999999')).toBe('unknown');
    });

    it('formats card numbers with 4-digit spacing', () => {
      expect(formatCardNumberSpacing('4532015112830366')).toBe('4532 0151 1283 0366');
      expect(formatCardNumberSpacing('378282246310005')).toBe('3782 8224 6310 005');
    });

    it('tokenizes card details locally for paper mode', () => {
      const token = paperModeTokenizeCardLocally('4532015112830366', '12', '28', 'John Doe');
      expect(token.type).toBe('card');
      expect(token.last4).toBe('0366');
      expect(token.brand).toBe('visa');
      expect(token.label).toBe('VISA •••• 0366');
      // Verify raw card number is not exposed on the object
      expect((token as any).cardNumber).toBeUndefined();
    });
  });

  describe('UPI Protocol & QR Code Generator', () => {
    it('validates compliant UPI VPA virtual addresses', () => {
      expect(validateUPIVpa('trader@okhdfcbank')).toBe(true);
      expect(validateUPIVpa('name.saha@oksbi')).toBe(true);
      expect(validateUPIVpa('9876543210@paytm')).toBe(true);
      expect(validateUPIVpa('quant_alpha@icici')).toBe(true);

      // Invalid VPAs
      expect(validateUPIVpa('invalid_vpa_without_bank')).toBe(false);
      expect(validateUPIVpa('@okhdfcbank')).toBe(false);
      expect(validateUPIVpa('user@')).toBe(false);
    });

    it('builds standard NPCI compliant UPI URIs', () => {
      const uri = buildUPIUrl({
        payeeVpa: 'lumen@okhdfcbank',
        payeeName: 'Lumen Trading Desk',
        amountINR: 5000,
        transactionNote: 'Wallet Deposit',
        transactionRefId: 'TX123456',
      });

      expect(uri).toContain('upi://pay?pa=lumen@okhdfcbank');
      expect(uri).toContain('pn=Lumen%20Trading%20Desk');
      expect(uri).toContain('am=5000.00');
      expect(uri).toContain('cu=INR');
      expect(uri).toContain('tr=TX123456');
    });

    it('generates a paper mode pseudo-QR code SVG string', () => {
      const svg = generatePaperModeUPIQRCodeSvg('upi://pay?pa=lumen@okhdfcbank&am=500.00');
      expect(svg).toContain('<svg');
      expect(svg).toContain('viewBox=');
      expect(svg).toContain('<rect');
      expect(svg).toContain('</svg>');
    });
  });

  describe('Zero-Cost Sandbox Gateway', () => {
    it('initiates card payment with 3DS requirement', async () => {
      const session = await ZeroCostSandboxGateway.initiateCardPayment({
        cardNumber: '4532015112830366',
        expMonth: '12',
        expYear: '28',
        cvv: '123',
        cardholderName: 'Alice Quant',
        amount: 250,
        currency: 'USD',
      });

      expect(session.requires3DS).toBe(true);
      expect(session.cardLast4).toBe('0366');
      expect(session.cardBrand).toBe('visa');
      expect(session.simulatedOtp).toBe('123456');
    });

    it('verifies 3DS OTP correctly and rejects invalid OTPs', async () => {
      const session = await ZeroCostSandboxGateway.initiateCardPayment({
        cardNumber: '4532015112830366',
        expMonth: '12',
        expYear: '28',
        cvv: '123',
        cardholderName: 'Alice Quant',
        amount: 100,
        currency: 'USD',
      });

      // Valid OTP
      const isApproved = await ZeroCostSandboxGateway.verifyCard3DS(session, '123456');
      expect(isApproved).toBe(true);

      // Invalid OTP
      await expect(
        ZeroCostSandboxGateway.verifyCard3DS(session, '000000')
      ).rejects.toThrow(/Invalid 3DS Authentication Code/);
    });

    it('initiates UPI collect requests to valid VPAs', async () => {
      const res = await ZeroCostSandboxGateway.initiateUPICollect('trader@okhdfcbank', 1000);
      expect(res.collectId).toMatch(/^upi_col_/);
      expect(res.expiryTs).toBeGreaterThan(Date.now());
    });
  });
});
