import { calcCommission, formatRate } from './commission';

describe('calcCommission', () => {
  it('base_only sem hourlyRate: comissão só sobre o preço base', () => {
    const r = calcCommission({ basePrice: 100, hourlyRate: 0, commissionRate: 0.4, policy: 'base_only' });
    expect(r.totalCents).toBe(10000);
    expect(r.platformFeeCents).toBe(4000);
    expect(r.trainerNetCents).toBe(6000);
  });

  it('full: comissão sobre base + hourlyRate, sem surcharge de Stripe', () => {
    const r = calcCommission({ basePrice: 100, hourlyRate: 300, commissionRate: 0.4, policy: 'full' });
    expect(r.totalCents).toBe(40000);
    expect(r.platformFeeCents).toBe(16000);
    expect(r.trainerNetCents).toBe(24000);
  });

  it('base_only com hourlyRate > 0: soma o surcharge proporcional da taxa Stripe', () => {
    const r = calcCommission({
      basePrice: 100,
      hourlyRate: 300,
      commissionRate: 0.4,
      policy: 'base_only',
      stripePercentFee: 0.0399,
      stripeFixedFeeInCents: 39,
    });
    // totalStripeFee = 40000*0.0399 + 39 = 1596+39 = 1635; ratio hourlyRate = 30000/40000 = 0.75
    // surcharge = round(1635*0.75) = 1226
    expect(r.platformFeeCents).toBe(4000 + 1226);
    expect(r.trainerNetCents).toBe(r.totalCents - r.platformFeeCents);
  });

  it('base_only com hourlyRate=0: não aplica surcharge mesmo com stripe fees informados', () => {
    const r = calcCommission({
      basePrice: 100, hourlyRate: 0, commissionRate: 0.4, policy: 'base_only',
      stripePercentFee: 0.0399, stripeFixedFeeInCents: 39,
    });
    expect(r.platformFeeCents).toBe(4000);
  });

  it('usa os defaults de taxa Stripe (3.99% + 39 centavos) quando omitidos', () => {
    const comExplicito = calcCommission({
      basePrice: 100, hourlyRate: 300, commissionRate: 0.4, policy: 'base_only',
      stripePercentFee: 0.0399, stripeFixedFeeInCents: 39,
    });
    const comDefault = calcCommission({ basePrice: 100, hourlyRate: 300, commissionRate: 0.4, policy: 'base_only' });
    expect(comDefault.platformFeeCents).toBe(comExplicito.platformFeeCents);
  });

  it('preço total zero: effectiveRateOnTotal é 0, sem divisão por zero', () => {
    const r = calcCommission({ basePrice: 0, hourlyRate: 0, commissionRate: 0.4, policy: 'base_only' });
    expect(r.totalCents).toBe(0);
    expect(r.effectiveRateOnTotal).toBe(0);
    expect(r.platformFeeCents).toBe(0);
  });

  it('effectiveRateOnTotal reflete o percentual real cobrado sobre o total', () => {
    const r = calcCommission({ basePrice: 100, hourlyRate: 0, commissionRate: 0.4, policy: 'base_only' });
    expect(r.effectiveRateOnTotal).toBe(40);
  });
});

describe('formatRate', () => {
  it('converte decimal em percentual arredondado', () => {
    expect(formatRate(0.4)).toBe('40%');
    expect(formatRate(0.155)).toBe('16%');
  });
});
