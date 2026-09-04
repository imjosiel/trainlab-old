import Link from 'next/link'

export const metadata = {
  title: 'Política de Privacidade | Player.Action',
  description:
    'Política de Privacidade da plataforma Player.Action — como coletamos, utilizamos, armazenamos e protegemos seus dados pessoais em conformidade com a LGPD.',
}

export default function PoliticaDePrivacidadePage() {
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
            Política de Privacidade
          </h1>
          <p className="mt-3 text-lg text-gray-500">
            Esta política descreve como a Player.Action coleta, utiliza e protege seus dados
            pessoais em conformidade com a Lei Geral de Proteção de Dados (LGPD).
          </p>
        </div>

        {/* Legal sections */}
        <div className="prose prose-gray prose-lg max-w-none [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:border-l-4 [&_h2]:border-[#39ff6a] [&_h2]:pl-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-800 [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:text-gray-600 [&_p]:leading-relaxed [&_li]:text-gray-600 [&_li]:leading-relaxed [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_strong]:text-gray-800">

          {/* 1. Controlador dos Dados */}
          <h2>1. Controlador dos Dados</h2>
          <p>
            O controlador dos dados pessoais tratados por meio da plataforma Player.Action é:
          </p>
          <div className="bg-gray-50 rounded-xl p-6 not-prose my-4">
            <p className="text-sm text-gray-700 leading-relaxed">
              <strong className="text-gray-900">Player.Action Tecnologia Ltda.</strong>
              <br />
              E-mail de contato: <strong>contato@playeraction.com.br</strong>
              <br />
              Encarregado de Dados (DPO): <strong>dpo@playeraction.com.br</strong>
            </p>
          </div>
          <p>
            Caso tenha dúvidas ou solicitações relacionadas ao tratamento de seus dados pessoais,
            entre em contato conosco pelos canais indicados acima.
          </p>

          {/* 2. Dados Coletados */}
          <h2>2. Dados Coletados</h2>
          <p>A Player.Action coleta e trata as seguintes categorias de dados pessoais:</p>

          <h3>2.1. Dados de Identificação e Cadastro</h3>
          <ul>
            <li>Nome completo (obtido via Google OAuth);</li>
            <li>Endereço de e-mail;</li>
            <li>Foto de perfil (quando disponível via provedor de autenticação);</li>
            <li>Função na plataforma (Treinador, Aluno, Parceiro ou Afiliado).</li>
          </ul>

          <h3>2.2. Dados de Pagamento</h3>
          <ul>
            <li>
              Dados de cartão de crédito e informações bancárias são processados exclusivamente
              pelo <strong>Stripe</strong> e <strong>não são armazenados</strong> nos servidores
              da Player.Action;
            </li>
            <li>Identificadores de cliente e assinatura do Stripe (Stripe Customer ID, Subscription ID);</li>
            <li>Histórico de transações e faturas.</li>
          </ul>

          <h3>2.3. Dados de Uso e Navegação</h3>
          <ul>
            <li>Endereço IP;</li>
            <li>Tipo de navegador e sistema operacional;</li>
            <li>Páginas visitadas e tempo de permanência;</li>
            <li>Dados de interação com funcionalidades da Plataforma;</li>
            <li>Dados de cookies e tecnologias similares (veja seção 8).</li>
          </ul>

          <h3>2.4. Dados de Conteúdo</h3>
          <ul>
            <li>Mensagens enviadas via chat integrado;</li>
            <li>Vídeos e conteúdos enviados por Treinadores;</li>
            <li>Dados de treinos, fichas de alunos e registros de evolução;</li>
            <li>Dados gerados por ferramentas de inteligência artificial.</li>
          </ul>

          <h3>2.5. Dados do Google Calendar (Treinadores)</h3>
          <p>
            Quando o Treinador opta por utilizar a funcionalidade de videoconferência integrada,
            a Player.Action solicita acesso ao Google Calendar do Treinador exclusivamente para:
          </p>
          <ul>
            <li>Criar eventos de agendamento no Google Calendar do Treinador;</li>
            <li>Gerar links de reunião do Google Meet associados a esses eventos;</li>
            <li>Atualizar ou remover eventos quando o agendamento for editado ou cancelado.</li>
          </ul>
          <p>
            O acesso ao Google Calendar é <strong>opcional</strong> e concedido pelo próprio
            Treinador no momento do login com o Google. A Player.Action <strong>não lê, não
            armazena nem acessa</strong> eventos existentes no calendário do Treinador —
            apenas cria, atualiza e remove os eventos gerados pela própria Plataforma.
            Os tokens de acesso são armazenados de forma segura e utilizados exclusivamente
            para essa finalidade.
          </p>

          {/* 3. Finalidade e Base Legal */}
          <h2>3. Finalidade e Base Legal para o Tratamento</h2>
          <p>
            Cada tratamento de dados pessoais realizado pela Player.Action possui uma finalidade
            específica e está amparado por uma base legal prevista na LGPD:
          </p>
          <div className="overflow-x-auto not-prose my-6">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">
                    Finalidade
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">
                    Base Legal (LGPD)
                  </th>
                </tr>
              </thead>
              <tbody className="text-gray-600">
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-3">Criação e gestão de conta</td>
                  <td className="px-4 py-3">Execução de contrato (Art. 7º, V)</td>
                </tr>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <td className="px-4 py-3">Processamento de pagamentos</td>
                  <td className="px-4 py-3">Execução de contrato (Art. 7º, V)</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-3">Intermediação entre Treinadores e Alunos</td>
                  <td className="px-4 py-3">Execução de contrato (Art. 7º, V)</td>
                </tr>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <td className="px-4 py-3">Envio de notificações e comunicação via chat</td>
                  <td className="px-4 py-3">Execução de contrato (Art. 7º, V)</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-3">Geração de conteúdo por IA</td>
                  <td className="px-4 py-3">Legítimo interesse (Art. 7º, IX)</td>
                </tr>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <td className="px-4 py-3">Criação de videoconferências via Google Meet</td>
                  <td className="px-4 py-3">Consentimento (Art. 7º, I)</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-3">Análise de uso e melhorias na Plataforma</td>
                  <td className="px-4 py-3">Legítimo interesse (Art. 7º, IX)</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-3">Comunicações de marketing</td>
                  <td className="px-4 py-3">Consentimento (Art. 7º, I)</td>
                </tr>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <td className="px-4 py-3">Programa de afiliados e rastreamento de referências</td>
                  <td className="px-4 py-3">Execução de contrato (Art. 7º, V)</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Cumprimento de obrigações legais e regulatórias</td>
                  <td className="px-4 py-3">Obrigação legal (Art. 7º, II)</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 4. Compartilhamento com Terceiros */}
          <h2>4. Compartilhamento com Terceiros</h2>
          <p>
            A Player.Action poderá compartilhar dados pessoais com os seguintes terceiros,
            estritamente para as finalidades descritas nesta Política:
          </p>
          <div className="overflow-x-auto not-prose my-6">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">
                    Terceiro
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">
                    Finalidade
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">
                    País
                  </th>
                </tr>
              </thead>
              <tbody className="text-gray-600">
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-800">Stripe</td>
                  <td className="px-4 py-3">Processamento de pagamentos e gestão financeira</td>
                  <td className="px-4 py-3">EUA</td>
                </tr>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-800">Google LLC</td>
                  <td className="px-4 py-3">Criação de eventos e links de videoconferência (Google Calendar / Meet) — apenas quando o Treinador habilita a funcionalidade</td>
                  <td className="px-4 py-3">EUA</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-800">Vercel</td>
                  <td className="px-4 py-3">Hospedagem da aplicação e entrega de conteúdo (CDN)</td>
                  <td className="px-4 py-3">EUA</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-800">Neon</td>
                  <td className="px-4 py-3">Hospedagem do banco de dados PostgreSQL</td>
                  <td className="px-4 py-3">EUA</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-800">Pusher</td>
                  <td className="px-4 py-3">Comunicação em tempo real (chat, notificações)</td>
                  <td className="px-4 py-3">EUA/UE</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            A Player.Action <strong>não vende, aluga ou compartilha</strong> dados pessoais com
            terceiros para fins de marketing ou publicidade sem o consentimento expresso do
            titular.
          </p>

          {/* 5. Transferência Internacional de Dados */}
          <h2>5. Transferência Internacional de Dados</h2>
          <p>
            Em razão da utilização de serviços de infraestrutura localizados nos Estados Unidos
            e na União Europeia (Stripe, Vercel, Neon, Pusher), os dados pessoais dos Usuários
            poderão ser transferidos e processados fora do Brasil.
          </p>
          <p>Essas transferências são realizadas em conformidade com o Art. 33 da LGPD, asseguradas por:</p>
          <ul>
            <li>
              Cláusulas contratuais padrão com os prestadores de serviço, que garantem nível
              adequado de proteção de dados;
            </li>
            <li>
              Certificações e políticas de privacidade dos prestadores que atendem às
              exigências da LGPD e do GDPR europeu;
            </li>
            <li>
              Medidas técnicas e organizacionais de segurança adotadas pelos prestadores.
            </li>
          </ul>

          {/* 6. Período de Retenção */}
          <h2>6. Período de Retenção dos Dados</h2>
          <p>
            Os dados pessoais serão retidos pela Player.Action durante o período necessário para
            cumprir as finalidades para as quais foram coletados, observando os seguintes critérios:
          </p>
          <ul>
            <li>
              <strong>Dados de conta:</strong> mantidos enquanto a conta estiver ativa e por até
              5 (cinco) anos após o encerramento, para cumprimento de obrigações legais e
              fiscais;
            </li>
            <li>
              <strong>Dados de transações financeiras:</strong> retidos por no mínimo 5 (cinco)
              anos, conforme legislação fiscal e tributária brasileira;
            </li>
            <li>
              <strong>Dados de uso e navegação:</strong> retidos por até 6 (seis) meses para fins
              de segurança e melhoria da Plataforma;
            </li>
            <li>
              <strong>Dados de comunicação (chat):</strong> retidos enquanto a conta estiver
              ativa e por 1 (um) ano após o encerramento;
            </li>
            <li>
              <strong>Registros de acesso (logs):</strong> mantidos por 6 (seis) meses, conforme
              exigência do Marco Civil da Internet (Art. 15, Lei nº 12.965/2014).
            </li>
          </ul>
          <p>
            Após o término do período de retenção, os dados serão anonimizados ou excluídos de
            forma segura, salvo quando houver obrigação legal de manutenção.
          </p>

          {/* 7. Direitos do Titular */}
          <h2>7. Direitos do Titular dos Dados</h2>
          <p>
            Em conformidade com o <strong>Art. 18 da LGPD</strong>, o titular dos dados pessoais
            tem direito a:
          </p>
          <ol>
            <li>
              <strong>Confirmação da existência de tratamento:</strong> saber se a Player.Action
              trata seus dados pessoais;
            </li>
            <li>
              <strong>Acesso aos dados:</strong> solicitar cópia dos dados pessoais que possuímos
              sobre você;
            </li>
            <li>
              <strong>Correção:</strong> solicitar a correção de dados incompletos, inexatos ou
              desatualizados;
            </li>
            <li>
              <strong>Anonimização, bloqueio ou eliminação:</strong> solicitar a anonimização,
              bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade com a
              LGPD;
            </li>
            <li>
              <strong>Portabilidade:</strong> solicitar a portabilidade dos seus dados a outro
              fornecedor de serviço;
            </li>
            <li>
              <strong>Eliminação com consentimento:</strong> solicitar a eliminação dos dados
              tratados com base em consentimento;
            </li>
            <li>
              <strong>Informação sobre compartilhamento:</strong> ser informado sobre as
              entidades com as quais seus dados são compartilhados;
            </li>
            <li>
              <strong>Revogação do consentimento:</strong> revogar o consentimento a qualquer
              momento, sem afetar a legalidade do tratamento anterior;
            </li>
            <li>
              <strong>Oposição:</strong> opor-se ao tratamento realizado com base em legítimo
              interesse, caso entenda que há violação à LGPD.
            </li>
          </ol>
          <p>
            Para exercer qualquer desses direitos, envie uma solicitação para{' '}
            <strong>dpo@playeraction.com.br</strong>. Responderemos em até{' '}
            <strong>15 (quinze) dias</strong>, conforme previsto na legislação.
          </p>

          {/* 8. Cookies */}
          <h2>8. Cookies e Tecnologias Similares</h2>
          <p>A Player.Action utiliza cookies e tecnologias similares para os seguintes fins:</p>

          <div className="overflow-x-auto not-prose my-6">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">
                    Tipo de Cookie
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">
                    Finalidade
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">
                    Duração
                  </th>
                </tr>
              </thead>
              <tbody className="text-gray-600">
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-800">Essenciais</td>
                  <td className="px-4 py-3">
                    Autenticação (next-auth session), preferências de idioma, segurança (CSRF)
                  </td>
                  <td className="px-4 py-3">Sessão</td>
                </tr>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-800">Funcionais</td>
                  <td className="px-4 py-3">
                    Preferência de tema (dark/light), configurações do dashboard
                  </td>
                  <td className="px-4 py-3">15 min (session storage)</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-800">Afiliados</td>
                  <td className="px-4 py-3">
                    Rastreamento de referência do programa de afiliados (affiliate tracker cookie)
                  </td>
                  <td className="px-4 py-3">30 dias</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-800">Analíticos</td>
                  <td className="px-4 py-3">
                    Análise de uso da Plataforma para melhorias de produto
                  </td>
                  <td className="px-4 py-3">12 meses</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p>
            Você pode gerenciar suas preferências de cookies diretamente nas configurações do
            seu navegador. Observe que a desativação de cookies essenciais poderá afetar o
            funcionamento da Plataforma.
          </p>

          {/* 9. Segurança dos Dados */}
          <h2>9. Segurança dos Dados</h2>
          <p>
            A Player.Action adota medidas técnicas e organizacionais para proteger os dados
            pessoais contra acesso não autorizado, destruição, perda, alteração ou qualquer
            forma de tratamento inadequado, incluindo:
          </p>
          <ul>
            <li>
              <strong>Criptografia em trânsito:</strong> todas as comunicações utilizam
              protocolo HTTPS/TLS;
            </li>
            <li>
              <strong>Autenticação segura:</strong> login via OAuth 2.0 (Google), sem
              armazenamento de senhas;
            </li>
            <li>
              <strong>Isolamento de dados financeiros:</strong> dados de pagamento são
              processados e armazenados exclusivamente pelo Stripe (PCI-DSS Level 1);
            </li>
            <li>
              <strong>Backups automatizados:</strong> backups regulares e criptografados do
              banco de dados;
            </li>
            <li>
              <strong>Controle de acesso:</strong> princípio do menor privilégio aplicado a
              todos os sistemas e colaboradores;
            </li>
            <li>
              <strong>Monitoramento:</strong> detecção de atividades suspeitas e respostas a
              incidentes de segurança.
            </li>
          </ul>
          <p>
            Em caso de incidente de segurança que possa causar risco ou dano relevante aos
            titulares, a Player.Action comunicará o fato à Autoridade Nacional de Proteção de
            Dados (ANPD) e aos titulares afetados, conforme previsto no Art. 48 da LGPD.
          </p>

          {/* 10. Alterações na Política */}
          <h2>10. Alterações nesta Política</h2>
          <p>
            Esta Política de Privacidade poderá ser atualizada periodicamente para refletir
            mudanças em nossas práticas de privacidade, nas funcionalidades da Plataforma ou na
            legislação aplicável.
          </p>
          <p>
            As alterações serão comunicadas por meio de notificação na Plataforma e/ou por
            e-mail. Recomendamos que revise esta política periodicamente. O uso continuado da
            Plataforma após a publicação de alterações constitui aceitação das mudanças.
          </p>

          {/* 11. Contato do DPO */}
          <h2>11. Contato do Encarregado (DPO)</h2>
          <p>
            Para questões relacionadas à proteção de dados pessoais, entre em contato com o
            Encarregado de Proteção de Dados (DPO) da Player.Action:
          </p>
          <div className="bg-gray-50 rounded-xl p-6 not-prose my-4">
            <p className="text-sm text-gray-700 leading-relaxed">
              <strong className="text-gray-900">Encarregado de Proteção de Dados</strong>
              <br />
              E-mail: <strong>dpo@playeraction.com.br</strong>
              <br />
              Prazo para resposta: até 15 (quinze) dias, conforme Art. 18, §5º da LGPD
            </p>
          </div>
          <p>
            Caso entenda que o tratamento de seus dados pessoais viola a LGPD, você também tem
            direito de apresentar reclamação à{' '}
            <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong>.
          </p>
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
            href="/politica-de-reembolso"
            className="flex-1 block p-4 rounded-xl border border-gray-100 hover:border-[#39ff6a] hover:bg-green-50/30 transition-all group"
          >
            <span className="text-xs font-semibold text-[#16a34a] uppercase tracking-wider">
              Veja também
            </span>
            <span className="block text-base font-semibold text-gray-900 mt-1 group-hover:text-[#16a34a] transition-colors">
              Política de Reembolso →
            </span>
          </Link>
        </div>

        {/* Last updated */}
        <div className="text-center text-sm text-gray-400 pb-8">
          <p>Última atualização: 11 de julho de 2026</p>
        </div>
      </main>
    </div>
  )
}
