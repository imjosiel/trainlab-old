import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
@Injectable()
export class AdminFinanceService {
  async get() {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_dummy', { apiVersion: '2025-02-24.acacia' as any });
    const now = new Date();
    const monthlyData: any[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthlyData.push({ monthLabel: d.toLocaleString('pt-BR', { month: 'short' }), year: d.getFullYear(), monthIndex: d.getMonth(), amount: 0, startDate: Math.floor(new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000), endDate: Math.floor(new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime() / 1000) });
    }
    const windowStart = monthlyData[0].startDate;
    const windowEnd = monthlyData[monthlyData.length - 1].endDate;
    const allCharges: Stripe.Charge[] = [];
    const recent: any[] = [];
    let count = 0;
    try {
      for await (const charge of stripe.charges.list({ created: { gte: windowStart, lte: windowEnd }, limit: 100 })) {
        if (count++ >= 500) break;
        allCharges.push(charge);
        if ((charge as any).paid && charge.status === 'succeeded' && recent.length < 10) {
          recent.push({ id: charge.id, amount: charge.amount / 100, customerEmail: (charge as any).billing_details?.email ?? 'Desconhecido', date: new Date(charge.created * 1000).toISOString(), receiptUrl: (charge as any).receipt_url });
        }
      }
    } catch {}
    const truncated = count >= 500;
    allCharges.forEach((c: any) => {
      if (c.paid && c.status === 'succeeded' && !c.refunded) {
        const bucket = monthlyData.find((m) => c.created >= m.startDate && c.created <= m.endDate);
        if (bucket) bucket.amount += c.amount / 100;
      }
    });
    const total6Months = monthlyData.reduce((a, c) => a + c.amount, 0);
    return { historicalMrr: monthlyData, recentTransactions: recent, summary: { total6Months }, truncated };
  }
}
