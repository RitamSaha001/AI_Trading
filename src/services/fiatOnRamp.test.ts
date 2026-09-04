import { describe, it, expect } from 'vitest';
import {
  validateUPIVpa,
  getVpaProviderName,
  buildStandardUPIUrl,
  buildAppSpecificUPIUrl,
  validateUTR,
  generateOnmetaWidgetUrl,
  generateTransakWidgetUrl,
  generatePaymentProofReceipt,
  UPI_APPS,
} from './fiatOnRamp';

describe('Fiat On-Ramp & Indian UPI Engine', () => {
  describe('VPA Validation & Provider Detection', () => {
    it('validates common Indian banking VPA formats', () => {
      expect(validateUPIVpa('trader@okhdfcbank')).toBe(true);
      expect(validateUPIVpa('9876543210@paytm')).toBe(true);
      expect(validateUPIVpa('alice.investor@ybl')).toBe(true);
      expect(validateUPIVpa('desk_fund@oksbi')).toBe(true);
      expect(validateUPIVpa('mycompany@axl')).toBe(true);
      expect(validateUPIVpa('user@upi')).toBe(true);
    });

    it('rejects malformed or invalid VPAs', () => {
      expect(validateUPIVpa('')).toBe(false);
      expect(validateUPIVpa('plainstring')).toBe(false);
      expect(validateUPIVpa('@okhdfcbank')).toBe(false);
      expect(validateUPIVpa('user@')).toBe(false);
      expect(validateUPIVpa('user@b')).toBe(false); // handle too short
      expect(validateUPIVpa('.user@oksbi')).toBe(false); // starts with dot
    });

    it('correctly maps bank handles to provider labels', () => {
      expect(getVpaProviderName('trader@okhdfcbank')).toContain('Google Pay (HDFC');
      expect(getVpaProviderName('investor@ybl')).toContain('PhonePe (Yes Bank)');
      expect(getVpaProviderName('merchant@paytm')).toContain('Paytm');
      expect(getVpaProviderName('citizen@upi')).toContain('BHIM / NPCI');
    });
  });

  describe('UPI URL & Intent Dispatching', () => {
    const paymentParams = {
      payeeVpa: 'lumen.desk@okhdfcbank',
      payeeName: 'Lumen Sovereign Treasury',
      amountINR: 5000,
      transactionNote: 'Web3 Wallet Funding',
      transactionRefId: 'LMN-REF-123456',
    };

    it('generates compliant standard NPCI UPI URI', () => {
      const url = buildStandardUPIUrl(paymentParams);
      expect(url.startsWith('upi://pay?')).toBe(true);
      expect(url).toContain('pa=lumen.desk%40okhdfcbank');
      expect(url).toContain('am=5000.00');
      expect(url).toContain('cu=INR');
      expect(url).toContain('tr=LMN-REF-123456');
    });

    it('generates app-specific intent URIs for Google Pay, PhonePe, and Paytm', () => {
      const gpayUrl = buildAppSpecificUPIUrl('gpay', paymentParams);
      expect(gpayUrl.startsWith('tez://upi/pay?')).toBe(true);
      expect(gpayUrl).toContain('pa=lumen.desk%40okhdfcbank');

      const phonepeUrl = buildAppSpecificUPIUrl('phonepe', paymentParams);
      expect(phonepeUrl.startsWith('phonepe://pay?')).toBe(true);

      const paytmUrl = buildAppSpecificUPIUrl('paytm', paymentParams);
      expect(paytmUrl.startsWith('paytmmp://pay?')).toBe(true);
    });

    it('has full configuration for all 6 supported UPI apps', () => {
      const apps = Object.keys(UPI_APPS);
      expect(apps).toContain('gpay');
      expect(apps).toContain('phonepe');
      expect(apps).toContain('paytm');
      expect(apps).toContain('bhim');
      expect(apps).toContain('cred');
      expect(apps).toContain('generic');
    });
  });

  describe('Indian UTR (Unique Transaction Reference) Validation', () => {
    it('accepts valid 12-digit numeric Indian bank UTRs', () => {
      expect(validateUTR('423456789012')).toBe(true);
      expect(validateUTR(' 308912345678 ')).toBe(true); // handles whitespace
      expect(validateUTR('012345678901')).toBe(true);
    });

    it('rejects invalid or corrupted UTRs', () => {
      expect(validateUTR('')).toBe(false);
      expect(validateUTR('12345')).toBe(false); // too short
      expect(validateUTR('12345678901234')).toBe(false); // too long
      expect(validateUTR('42345678901A')).toBe(false); // contains letters
      expect(validateUTR('000000000000')).toBe(false); // repeating dummy digits
      expect(validateUTR('111111111111')).toBe(false); // repeating dummy digits
    });
  });

  describe('Public Web3 On-Ramp Widgets', () => {
    it('generates valid Onmeta India UPI widget link for Polygon', () => {
      const url = generateOnmetaWidgetUrl({
        walletAddress: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        fiatAmountINR: 10000,
        cryptoSymbol: 'USDT',
        network: 'polygon',
      });

      expect(url.startsWith('https://widget.onmeta.in?')).toBe(true);
      expect(url).toContain('walletAddress=0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf');
      expect(url).toContain('fiatCurrency=INR');
      expect(url).toContain('fiatAmount=10000');
      expect(url).toContain('chainId=137');
    });

    it('generates valid Transak global card widget link', () => {
      const url = generateTransakWidgetUrl({
        walletAddress: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        fiatAmount: 250,
        fiatCurrency: 'USD',
        cryptoCurrency: 'USDT',
        network: 'polygon',
      });

      expect(url.startsWith('https://global.transak.com?')).toBe(true);
      expect(url).toContain('walletAddress=0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf');
      expect(url).toContain('cryptoCurrencyCode=USDT');
    });
  });

  describe('Proof-of-Payment Receipts', () => {
    it('generates cryptographic SHA-256 receipt for verified transactions', async () => {
      const receipt = await generatePaymentProofReceipt({
        orderId: 'ORD-98765',
        utrOrAuthCode: '423456789012',
        amountINR: 5000,
        amountUSD: 57.34,
        payeeVpa: 'lumen.desk@okhdfcbank',
        walletAddress: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        paymentMethod: 'UPI',
      });

      expect(receipt.receiptId.startsWith('RCP-')).toBe(true);
      expect(receipt.proofHash.startsWith('0x')).toBe(true);
      expect(receipt.proofHash.length).toBe(66); // 0x + 64 hex characters
      expect(receipt.details.settlementRail).toContain('NPCI');
      expect(receipt.details.currencyPeg).toBe('1 USD = 87.20 INR');
    });
  });
});
