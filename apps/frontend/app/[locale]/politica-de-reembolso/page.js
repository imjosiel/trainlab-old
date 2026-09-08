import Link from 'next/link'

export const metadata = {
  title: 'Política de Reembolso e Cancelamento | Player.Action',
  description:
    'Política de Reembolso e Cancelamento da plataforma Player.Action — direito de arrependimento, prazos, procedimentos e condições para reembolso e cancelamento de assinaturas.',
}

export default function PoliticaDeReembolsoPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Green accent bar */}
      <div className="h-1 bg-[#39ff6a]" />

      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            Voltar ao início
          </Link>
          <span className="text-xs font-semibold tracking-widest uppercase text-[#16a34a]">
            Player.Action
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-16">
        {/* Title block */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#16a34a] bg-green-50 px-3 py-1.5 rounded-full mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" />
            DOCUMENTO LEGAL
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight">
            Política de Reembolso e Cancelamento
          </h1>
          <p className="mt-3 text-lg text-gray-500">
            Entenda seus direitos de reembolso, cancelamento de assinaturas e os procedimentos
            para solicitação na plataforma Player.Action.
          </p>
        </div>

        {/* Highlight box — Right of withdrawal */}
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 md:p-8 mb-12">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-[#16a34a] rounded-xl flex items-center justify-center shrink-0 mt-0.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Garantia de 7 dias — Direito de Arrependimento
              </h2>
              <p className="text-gray-700 leading-relaxed">
                Conforme o <strong>Art. 49 do Código de Defesa do Consumidor (CDC)</strong>,
                você tem o direito de desistir de qualquer contratação realizada na Player.Action
                no prazo de <strong>7 (sete) dias corridos</strong> a partir da data da compra,
                sem necessidade de justificativa, com reembolso integral do valor pago.
              </p>
            </div>
          </div>
        </div>

        {/* Legal sections */}
        <div className="prose prose-gray prose-lg max-w-none [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:border-l-4 [&_h2]:border-[#39ff6a] [&_h2]:pl-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-800 [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:text-gray-600 [&_p]:leading-relaxed [&_li]:text-gray-600 [&_li]:leading-relaxed [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_strong]:text-gray-800">

          {/* 1. Direito de Arrependimento */}
          <h2>1. Direito de Arrependimento (CDC Art. 49)</h2>
          <p>
            O Aluno que contratar qualquer plano, assinatura ou serviço na plataforma
            Player.Action poderá exercer seu direito de arrependimento dentro do prazo de{' '}
            <strong>7 (sete) dias corridos</strong>, contados a partir da data da contratação.
          </p>
          <p>Este direito aplica-se a:</p>
          <ul>
            <li>Assinaturas mensais de planos de treino;</li>
            <li>Pacotes avulsos de aulas ou consultorias;</li>
            <li>Qualquer contratação realizada pela Plataforma por meio eletrônico.</li>
          </ul>
          <p>
            O exercício do direito de arrependimento resulta no{' '}
            <strong>reembolso integral</strong> do valor pago, sem aplicação de multas ou
            penalidades.
          </p>

          {/* 2. Como Solicitar Reembolso */}
          <h2>2. Como Solicitar Reembolso</h2>
          <p>
            Para solicitar o reembolso, o Aluno deve seguir os seguintes passos:
          </p>

          <div className="not-prose my-8">
            <div className="space-y-4">
              {/* Step 1 */}
              <div className="flex items-start gap-4 p-5 bg-gray-50 rounded-xl">
                <div className="w-8 h-8 bg-[#16a34a] rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-sm">
                  1
                </div>
                <div>
                  <p className="font-semibold text-gray-900">
                    Envie um e-mail para contato@playeraction.com.br
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Utilize o assunto: &quot;Solicitação de Reembolso&quot;
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-4 p-5 bg-gray-50 rounded-xl">
                <div className="w-8 h-8 bg-[#16a34a] rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-sm">
                  2
                </div>
                <div>
                  <p className="font-semibold text-gray-900">
                    Informe seus dados de identificação
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Nome completo, e-mail de cadastro e o plano ou serviço contratado
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-4 p-5 bg-gray-50 rounded-xl">
                <div className="w-8 h-8 bg-[#16a34a] rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-sm">
                  3
                </div>
                <div>
                  <p className="font-semibold text-gray-900">
                    Descreva o motivo da solicitação (opcional)
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Embora não seja obrigatório dentro do prazo de 7 dias, o motivo nos ajuda a melhorar nossos serviços
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex items-start gap-4 p-5 bg-gray-50 rounded-xl">
                <div className="w-8 h-8 bg-[#16a34a] rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-sm">
                  4
                </div>
                <div>
                  <p className="font-semibold text-gray-900">
                    Aguarde a confirmação
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Nossa equipe confirmará o recebimento em até 2 (dois) dias úteis
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p>
            O reembolso será processado utilizando o <strong>mesmo método de pagamento</strong>{' '}
            da compra original (cartão de crédito, débito ou outro meio disponível no Stripe).
          </p>

          {/* 3. Cancelamento de Assinaturas */}
          <h2>3. Cancelamento de Assinaturas</h2>
          <p>
            O Aluno pode cancelar sua assinatura a qualquer momento, diretamente pela
            Plataforma (na área de configurações da conta) ou entrando em contato com nosso
            suporte.
          </p>

          <h3>3.1. Efeitos do Cancelamento</h3>
          <ul>
            <li>
              O <strong>acesso ao conteúdo e funcionalidades</strong> do plano será mantido até
              o <strong>final do período de cobrança já pago</strong> — ou seja, se a assinatura
              foi paga até o dia 15 do mês, o acesso permanecerá ativo até essa data;
            </li>
            <li>
              <strong>Não será cobrada multa</strong> ou taxa de cancelamento;
            </li>
            <li>
              A próxima cobrança recorrente será <strong>automaticamente suspensa</strong>;
            </li>
            <li>
              O histórico de treinos, registros de evolução e dados do Aluno continuarão
              disponíveis para consulta mesmo após o cancelamento, conforme nossa Política de
              Privacidade.
            </li>
          </ul>

          <h3>3.2. Cancelamento pelo Treinador/Parceiro</h3>
          <p>
            Caso o Treinador/Parceiro cancele seu plano na Plataforma, os Alunos vinculados
            manterão acesso aos conteúdos até o final do período vigente. A Player.Action se
            compromete a notificar os Alunos afetados com antecedência.
          </p>

          <h3>3.3. Reativação</h3>
          <p>
            Caso deseje reativar uma assinatura cancelada, o Aluno poderá fazê-lo a qualquer
            momento, escolhendo um novo plano. Não há garantia de manutenção dos mesmos preços
            ou condições do plano anterior.
          </p>

          {/* 4. Reembolsos Parciais */}
          <h2>4. Reembolsos Parciais</h2>
          <p>
            Em situações específicas, poderão ser concedidos reembolsos parciais, a critério da
            Player.Action e/ou do Treinador/Parceiro. Essas situações incluem:
          </p>
          <ul>
            <li>
              <strong>Indisponibilidade prolongada da Plataforma:</strong> se a Plataforma
              ficar indisponível por período superior a 72 (setenta e duas) horas consecutivas
              por motivos imputáveis à Player.Action, o Aluno poderá solicitar reembolso
              proporcional ao período de indisponibilidade;
            </li>
            <li>
              <strong>Falha grave no serviço:</strong> se o Treinador/Parceiro não prestar o
              serviço contratado (ausência de treinos, falta de acompanhamento, etc.), o Aluno
              poderá solicitar mediação da Player.Action para reembolso parcial ou total;
            </li>
            <li>
              <strong>Cobranças indevidas:</strong> em caso de cobrança duplicada ou valor
              incorreto, o reembolso da diferença será realizado automaticamente ou mediante
              solicitação.
            </li>
          </ul>
          <p>
            Cada solicitação de reembolso parcial será analisada individualmente. A
            Player.Action se reserva o direito de solicitar informações adicionais para avaliar
            o caso.
          </p>

          {/* 5. Prazo para Processamento */}
          <h2>5. Prazo para Processamento do Reembolso</h2>
          <p>
            Após a aprovação da solicitação de reembolso, o prazo para processamento e
            efetivação do crédito é de:
          </p>

          <div className="not-prose my-8">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-xl p-6 text-center">
                <div className="text-3xl font-extrabold text-[#16a34a] mb-1">5–10</div>
                <div className="text-sm text-gray-500 font-medium">dias úteis</div>
                <p className="text-xs text-gray-400 mt-2">
                  Para estorno em cartão de crédito
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-6 text-center">
                <div className="text-3xl font-extrabold text-[#16a34a] mb-1">3–5</div>
                <div className="text-sm text-gray-500 font-medium">dias úteis</div>
                <p className="text-xs text-gray-400 mt-2">
                  Para outros métodos de pagamento
                </p>
              </div>
            </div>
          </div>

          <p>
            O prazo pode variar de acordo com a instituição financeira ou operadora do cartão. A
            Player.Action não se responsabiliza por atrasos causados por terceiros no
            processamento do estorno.
          </p>

          {/* 6. Exceções */}
          <h2>6. Exceções ao Reembolso</h2>
          <p>
            <strong>Não serão elegíveis para reembolso</strong> as seguintes situações:
          </p>
          <ul>
            <li>
              Solicitações realizadas <strong>após o prazo de 7 (sete) dias corridos</strong>{' '}
              da contratação, salvo nos casos previstos na cláusula 4 (Reembolsos Parciais);
            </li>
            <li>
              Serviços que tenham sido <strong>integralmente consumidos</strong> dentro do prazo
              de arrependimento (por exemplo, consultorias já realizadas, aulas já ministradas);
            </li>
            <li>
              Assinaturas canceladas após o período de arrependimento, em que o{' '}
              <strong>período pago já foi usufruído</strong>;
            </li>
            <li>
              Situações em que o Aluno tenha <strong>violado os Termos de Uso</strong> da
              Plataforma, resultando em suspensão ou encerramento da conta;
            </li>
            <li>
              Valores pagos a título de <strong>taxa de processamento do Stripe</strong>, que
              são de responsabilidade do processador de pagamentos e podem não ser estornáveis.
            </li>
          </ul>

          {/* 7. Disputas e Chargebacks */}
          <h2>7. Disputas e Chargebacks</h2>
          <p>
            Antes de abrir uma disputa junto à operadora do cartão (chargeback), pedimos que
            entre em contato conosco para resolvermos a questão diretamente. Chargebacks geram
            custos administrativos e podem resultar em:
          </p>
          <ul>
            <li>Suspensão imediata da conta até resolução da disputa;</li>
            <li>Cobrança de taxa administrativa para cobrir custos de processamento;</li>
            <li>Encerramento definitivo da conta em caso de disputas infundadas ou repetidas.</li>
          </ul>
          <p>
            A Player.Action compromete-se a resolver todas as solicitações de reembolso
            legítimas de forma rápida e transparente, tornando dispensável o recurso a
            chargebacks.
          </p>

          {/* 8. Contato */}
          <h2>8. Contato</h2>
          <p>
            Para dúvidas, reclamações ou solicitações relacionadas a reembolsos e cancelamentos:
          </p>
          <div className="bg-gray-50 rounded-xl p-6 not-prose my-4">
            <p className="text-sm text-gray-700 leading-relaxed">
              <strong className="text-gray-900">Player.Action — Suporte ao Cliente</strong>
              <br />
              E-mail: <strong>contato@playeraction.com.br</strong>
              <br />
              Assunto sugerido: &quot;Reembolso&quot; ou &quot;Cancelamento&quot;
              <br />
              Horário de atendimento: segunda a sexta-feira, das 9h às 18h (horário de Brasília)
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100 my-12" />

        {/* Related links */}
        <div className="flex flex-col sm:flex-row gap-4 mb-12">
          <Link
            href="/termos-de-uso"
            className="flex-1 block p-4 rounded-xl border border-gray-100 hover:border-[#39ff6a] hover:bg-green-50/30 transition-all group"
          >
            <span className="text-xs font-semibold text-[#16a34a] uppercase tracking-wider">
              Veja também
            </span>
            <span className="block text-base font-semibold text-gray-900 mt-1 group-hover:text-[#16a34a] transition-colors">
              Termos de Uso →
            </span>
          </Link>
          <Link
            href="/politica-de-privacidade"
            className="flex-1 block p-4 rounded-xl border border-gray-100 hover:border-[#39ff6a] hover:bg-green-50/30 transition-all group"
          >
            <span className="text-xs font-semibold text-[#16a34a] uppercase tracking-wider">
              Veja também
            </span>
            <span className="block text-base font-semibold text-gray-900 mt-1 group-hover:text-[#16a34a] transition-colors">
              Política de Privacidade →
            </span>
          </Link>
        </div>

        {/* Last updated */}
        <div className="text-center text-sm text-gray-400 pb-8">
          <p>Última atualização: 6 de julho de 2026</p>
        </div>
      </main>
    </div>
  )
}
