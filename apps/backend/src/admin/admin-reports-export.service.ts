import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminReportsExportService {
  constructor(private readonly prisma: PrismaService) {}
  async export(id: string) {
    const report: any = await this.prisma.monthlyReport.findUnique({ where: { id }, include: { expenses: true, distributions: true } });
    if (!report) throw new NotFoundException({ error: 'Relatório não encontrado.' });
    const CATEGORY_LABELS: any = { api_llm: 'Tokens API / LLM', storage: 'Armazenamento de Vídeos', accounting: 'Escritório de Contabilidade', freelancer: 'Freelancer', ads_spend: 'Investimento em Tráfego', ads_agency: 'Agência de Tráfego', other: 'Outros' };
    const fmt = (v: any) => `"R$${parseFloat(String(v)).toFixed(2).replace('.', ',')}"`;
    const pct = (v: any) => `"${(parseFloat(String(v)) * 100).toFixed(2).replace('.', ',')}%"`
    const lines = [
      `"🎮  PLAYER ACTION — CONTROLE FINANCEIRO","","",""`, `"","","",""`, `"⚙  CONFIGURAÇÕES","","Campos em azul = você preenche",""`, `"Mensalidade por aluno (R$)","Variável","",""`, `"Taxa Stripe — % por transação (cartão)",${pct(0.0399)},"",""`, `"Taxa Stripe — Taxa fixa por transação (R$)","R$0,39","",""`, `"","","",""`, `"📥  ENTRADAS","","",""`, `"Descrição","Valor (R$)","Qtd Alunos","Período"`, `"Total de Assinantes Ativos",${fmt(report.grossRevenue)},${report.activeSubscriptions},"${report.period}"`, `"","","",""`, `"TOTAL ENTRADAS BRUTAS",${fmt(report.grossRevenue)},"",""`, `"","","",""`, `"📤  SAÍDAS / DESPESAS","","",""`, `"Descrição","Valor (R$)","Observações",""`, `"Taxa Stripe Total (% sobre receita)",${fmt(-report.stripeFeePercent)},"Calculado automaticamente",""`, `"Taxa Stripe — Fixa (R$0,39 × Alunos)",${fmt(-report.stripeFeeFixed)},"Calculado automaticamente",""`, `"Comissões de Parceiros",${fmt(-report.partnerCommissions)},"Calculado automaticamente",""`, ...report.expenses.map((e: any) => `"${CATEGORY_LABELS[e.category] ?? e.description}",${fmt(-e.amount)},"${e.description}",""`), `"TOTAL SAÍDAS",${fmt(-report.totalExpenses)},"",""`, `"","","",""`, `"💰  RESULTADO LÍQUIDO",${fmt(report.netRevenue)},"",""`, `"","","",""`, `"📊  DISTRIBUIÇÃO DO RESULTADO LÍQUIDO","","",""`, ...report.distributions.map((d: any) => `"${d.label} (${(d.percentage * 100).toFixed(0)}%)",${fmt(d.amount)},"Calculado sobre resultado líquido positivo",""`), `"","","",""`, `"Relatório gerado em","${new Date(report.generatedAt).toLocaleString('pt-BR')}","",""`, `"Status","${report.status === 'published' ? 'Publicado' : 'Rascunho'}","",""`,
    ];
    const csv = lines.join('\r\n');
    const filename = `relatorio-player-action-${report.period}.csv`;
    return { csv, filename };
  }
}
