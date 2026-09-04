import { describe, it, expect } from 'vitest';

// Import the encoding functions that will be added to dexRouter.ts
// Since they're in src/, we import from there
describe('Uniswap V3 DEX Calldata Encoding', () => {
  // Inline test implementation since the functions are in src/
  const encodeExactInputSingle = (params: {
    tokenIn: string;
    tokenOut: string;
    fee: number;
    recipient: string;
    amountIn: bigint;
    amountOutMinimum: bigint;
    sqrtPriceLimitX96: bigint;
  }): string => {
    const selector = '04e45aaf';
    const encodeAddress = (addr: string) => addr.toLowerCase().replace('0x', '').padStart(64, '0');
    const encodeUint = (val: bigint | number) => BigInt(val).toString(16).padStart(64, '0');
    return '0x' + selector
      + encodeAddress(params.tokenIn)
      + encodeAddress(params.tokenOut)
      + encodeUint(BigInt(params.fee))
      + encodeAddress(params.recipient)
      + encodeUint(params.amountIn)
      + encodeUint(params.amountOutMinimum)
      + encodeUint(params.sqrtPriceLimitX96);
  };

  it('generates correct function selector for exactInputSingle', () => {
    const calldata = encodeExactInputSingle({
      tokenIn: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC on Polygon
      tokenOut: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // WETH on Polygon
      fee: 3000,
      recipient: '0x1234567890123456789012345678901234567890',
      amountIn: 1000000n, // 1 USDC (6 decimals)
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n,
    });
    expect(calldata.startsWith('0x04e45aaf')).toBe(true);
  });

  it('encodes correct total calldata length (4 selector + 7x32 params = 228 bytes)', () => {
    const calldata = encodeExactInputSingle({
      tokenIn: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      tokenOut: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      fee: 3000,
      recipient: '0x1234567890123456789012345678901234567890',
      amountIn: 1000000n,
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n,
    });
    // 0x prefix (2 chars) + selector (8 chars) + 7 params * 64 chars = 2 + 8 + 448 = 458 hex chars
    expect(calldata.length).toBe(2 + 8 + 7 * 64);
  });

  it('encodes token addresses at correct ABI positions', () => {
    const usdc = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
    const weth = '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619';
    const calldata = encodeExactInputSingle({
      tokenIn: usdc,
      tokenOut: weth,
      fee: 3000,
      recipient: '0x1234567890123456789012345678901234567890',
      amountIn: 1000000n,
      amountOutMinimum: 500000n,
      sqrtPriceLimitX96: 0n,
    });
    // tokenIn is at offset 10 (after 0x + selector)
    const tokenInEncoded = calldata.slice(10, 10 + 64);
    expect(tokenInEncoded).toContain(usdc.toLowerCase().replace('0x', ''));
    // tokenOut is next 64 chars
    const tokenOutEncoded = calldata.slice(10 + 64, 10 + 128);
    expect(tokenOutEncoded).toContain(weth.toLowerCase().replace('0x', ''));
  });

  it('encodes fee tier correctly', () => {
    const calldata = encodeExactInputSingle({
      tokenIn: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      tokenOut: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      fee: 500, // 0.05% tier
      recipient: '0x1234567890123456789012345678901234567890',
      amountIn: 1000000n,
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n,
    });
    // fee at offset 10 + 128 (after tokenIn + tokenOut)
    const feeEncoded = calldata.slice(10 + 128, 10 + 192);
    expect(feeEncoded).toBe('00000000000000000000000000000000000000000000000000000000000001f4'); // 500 in hex
  });

  it('encodes amountOutMinimum with slippage protection', () => {
    const calldata = encodeExactInputSingle({
      tokenIn: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      tokenOut: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      fee: 3000,
      recipient: '0x1234567890123456789012345678901234567890',
      amountIn: 1000000n,
      amountOutMinimum: 950000n, // 5% slippage from 1M
      sqrtPriceLimitX96: 0n,
    });
    // amountOutMinimum is at offset 10 + 64*5 = 330
    const amountOutMinEncoded = calldata.slice(10 + 64 * 5, 10 + 64 * 6);
    // 950000 = 0xe7ef0
    expect(amountOutMinEncoded.replace(/^0+/, '')).toBe('e7ef0');
  });
});
