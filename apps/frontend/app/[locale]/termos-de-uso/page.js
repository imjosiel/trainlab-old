import Link from 'next/link'

export const metadata = {
  title: 'Termos de Uso | Player.Action',
  description:
    'Termos de Uso da plataforma Player.Action — condições gerais de uso, direitos e obrigações dos usuários, pagamentos, cancelamentos e política de propriedade intelectual.',
}

export default function TermosDeUsoPage() {
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
            Termos de Uso
          </h1>
          <p className="mt-3 text-lg text-gray-500">
            Leia atentamente os termos e condições de uso da plataforma Player.Action.
          </p>
        </div>

        {/* Legal sections */}
        <div className="prose prose-gray prose-lg max-w-none [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:border-l-4 [&_h2]:border-[#39ff6a] [&_h2]:pl-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-800 [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:text-gray-600 [&_p]:leading-relaxed [&_li]:text-gray-600 [&_li]:leading-relaxed [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_strong]:text-gray-800">

          {/* 1. Definições */}
          <h2>1. Definições</h2>
          <p>
            Para os fins destes Termos de Uso, aplicam-se as seguintes definições:
          </p>
          <ul>
            <li>
              <strong>Plataforma:</strong> o sistema SaaS Player.Action, acessível via web, que
              oferece ferramentas para criação, gestão e comercialização de treinos esportivos
              personalizados, com recursos de inteligência artificial, agendamento, comunicação e
              processamento de pagamentos.
            </li>
            <li>
              <strong>Treinador/Parceiro:</strong> pessoa física ou jurídica que se cadastra na
              Plataforma para criar, oferecer e gerenciar planos de treino, consultorias e
              aulas para Alunos, utilizando os recursos disponibilizados pela Player.Action.
            </li>
            <li>
              <strong>Aluno:</strong> pessoa física que se cadastra na Plataforma para contratar
              e acessar planos de treino, aulas e consultorias oferecidos por Treinadores/Parceiros.
            </li>
            <li>
              <strong>Afiliado:</strong> pessoa física ou jurídica cadastrada no programa de
              afiliados da Plataforma, que promove os serviços da Player.Action e/ou de
              Treinadores/Parceiros, recebendo comissão sobre assinaturas geradas por meio de
              seus links de referência.
            </li>
            <li>
              <strong>Usuário:</strong> qualquer pessoa que acesse ou utilize a Plataforma, em
              qualquer capacidade (Treinador, Aluno, Afiliado ou visitante).
            </li>
          </ul>

          {/* 2. Objeto do Serviço */}
          <h2>2. Objeto do Serviço</h2>
          <p>
            A Player.Action é uma plataforma de intermediação tecnológica que conecta
            Treinadores/Parceiros a Alunos interessados em treinos esportivos personalizados. A
            Plataforma disponibiliza ferramentas para:
          </p>
          <ul>
            <li>Criação e gestão de planos de treino com auxílio de inteligência artificial;</li>
            <li>Upload e organização de bibliotecas de vídeos de exercícios;</li>
            <li>Acompanhamento da evolução dos Alunos via dashboards;</li>
            <li>Agendamento de aulas presenciais e consultorias online;</li>
            <li>Comunicação direta entre Treinadores e Alunos via chat integrado;</li>
            <li>Processamento de pagamentos recorrentes e pontuais.</li>
          </ul>
          <p>
            <strong>A Player.Action não é prestadora de serviços esportivos.</strong> A relação
            de ensino e treinamento é estabelecida diretamente entre o Treinador/Parceiro e o
            Aluno, sendo a Plataforma mera intermediadora tecnológica.
          </p>

          {/* 3. Cadastro e Responsabilidades */}
          <h2>3. Cadastro e Responsabilidades</h2>
          <h3>3.1. Cadastro</h3>
          <p>
            Para utilizar os serviços da Plataforma, o Usuário deve criar uma conta por meio de
            autenticação via Google (OAuth 2.0). Ao realizar o cadastro, o Usuário declara que:
          </p>
          <ul>
            <li>As informações fornecidas são verdadeiras, completas e atualizadas;</li>
            <li>Possui capacidade civil plena ou, sendo menor de 18 anos, conta com autorização de responsável legal;</li>
            <li>No caso de Treinadores/Parceiros, possui formação e/ou qualificação adequada para prestar os serviços esportivos oferecidos.</li>
          </ul>

          <h3>3.2. Responsabilidades do Usuário</h3>
          <p>O Usuário é integralmente responsável por:</p>
          <ul>
            <li>Manter a segurança e o sigilo de suas credenciais de acesso;</li>
            <li>Todas as atividades realizadas em sua conta;</li>
            <li>O conteúdo que publica, compartilha ou transmite por meio da Plataforma;</li>
            <li>O cumprimento de todas as leis e regulamentos aplicáveis à sua atividade;</li>
            <li>No caso de Treinadores, a qualidade e segurança dos treinos prescritos.</li>
          </ul>

          <h3>3.3. Responsabilidades da Plataforma</h3>
          <p>A Player.Action compromete-se a:</p>
          <ul>
            <li>Manter a Plataforma disponível e funcional, ressalvadas manutenções programadas e eventos de força maior;</li>
            <li>Proteger os dados dos Usuários conforme a Lei Geral de Proteção de Dados (LGPD);</li>
            <li>Processar pagamentos de forma segura e transparente por meio do Stripe Connect;</li>
            <li>Fornecer suporte técnico adequado aos Usuários.</li>
          </ul>

          {/* 4. Pagamentos e Comissões */}
          <h2>4. Pagamentos e Comissões</h2>
          <h3>4.1. Modelo de Receita</h3>
          <p>
            A Player.Action opera no modelo de marketplace, intermediando pagamentos entre Alunos
            e Treinadores/Parceiros. Os pagamentos são processados exclusivamente via{' '}
            <strong>Stripe Connect</strong>, garantindo segurança, transparência e conformidade
            com regulamentações financeiras.
          </p>

          <h3>4.2. Comissões da Plataforma</h3>
          <p>
            Sobre cada transação de assinatura realizada na Plataforma, a Player.Action retém um
            percentual como taxa de serviço, conforme o plano (tier) contratado pelo
            Treinador/Parceiro. O percentual de comissão é definido no momento da adesão ao plano
            e está detalhado na página de planos.
          </p>

          <h3>4.3. Valor por Hora (hourlyRate)</h3>
          <p>
            Treinadores/Parceiros que oferecem aulas avulsas ou consultorias por hora definem
            livremente seu valor por hora (<em>hourlyRate</em>). O valor integral de aulas
            cobradas por hora é repassado ao Treinador/Parceiro, sem retenção de comissão pela
            Plataforma, sendo devidas apenas as taxas de processamento do Stripe.
          </p>

          <h3>4.4. Repasses</h3>
          <p>
            Os repasses aos Treinadores/Parceiros são realizados automaticamente pelo Stripe
            Connect, conforme o cronograma e condições do próprio Stripe. A Player.Action não
            se responsabiliza por eventuais atrasos causados pelo processador de pagamentos.
          </p>

          {/* 5. Direito de Arrependimento */}
          <h2>5. Direito de Arrependimento</h2>
          <p>
            Em conformidade com o <strong>Art. 49 do Código de Defesa do Consumidor (CDC)</strong>,
            o Aluno que contratar qualquer plano ou serviço na Plataforma poderá exercer seu
            direito de arrependimento no prazo de <strong>7 (sete) dias corridos</strong>,
            contados a partir da data da contratação, sem necessidade de justificativa.
          </p>
          <p>Para exercer o direito de arrependimento, o Aluno deve:</p>
          <ol>
            <li>Enviar uma solicitação para o e-mail <strong>contato@playeraction.com.br</strong>;</li>
            <li>Informar o nome completo, e-mail de cadastro e o plano contratado;</li>
            <li>A solicitação será processada em até <strong>5 (cinco) dias úteis</strong>.</li>
          </ol>
          <p>
            O reembolso será realizado integralmente, utilizando o mesmo método de pagamento da
            compra original.
          </p>

          {/* 6. Cancelamento de Assinaturas */}
          <h2>6. Cancelamento de Assinaturas</h2>
          <p>
            O Aluno poderá cancelar sua assinatura a qualquer momento diretamente pela
            Plataforma ou entrando em contato com o suporte. Ao cancelar:
          </p>
          <ul>
            <li>
              O acesso ao conteúdo e funcionalidades do plano será mantido até o{' '}
              <strong>final do período já pago</strong>;
            </li>
            <li>Não haverá cobrança de multa ou taxa de cancelamento;</li>
            <li>Não haverá reembolso proporcional do período já usufruído, salvo nos casos de direito de arrependimento (cláusula 5);</li>
            <li>
              O Treinador/Parceiro também poderá cancelar seu plano na Plataforma, caso em que
              os Alunos vinculados manterão acesso até o fim do período vigente.
            </li>
          </ul>

          {/* 7. Propriedade Intelectual */}
          <h2>7. Propriedade Intelectual</h2>
          <h3>7.1. Conteúdo da Plataforma</h3>
          <p>
            Todos os direitos de propriedade intelectual sobre a Plataforma Player.Action —
            incluindo, mas não se limitando a, marca, logotipos, layout, código-fonte,
            funcionalidades e design — pertencem exclusivamente à Player.Action ou seus
            licenciadores.
          </p>

          <h3>7.2. Conteúdo do Treinador</h3>
          <p>
            O Treinador/Parceiro mantém a titularidade sobre todo conteúdo original que produzir
            e publicar na Plataforma (vídeos, textos, imagens). Ao publicar conteúdo na
            Plataforma, o Treinador concede à Player.Action uma licença não exclusiva,
            mundial, gratuita e transferível para hospedar, exibir e distribuir o conteúdo
            exclusivamente dentro da Plataforma.
          </p>

          <h3>7.3. Conteúdo Gerado por Inteligência Artificial</h3>
          <p>
            A Plataforma disponibiliza ferramentas de IA para auxiliar na elaboração de planos de
            treino. O conteúdo gerado por IA é fornecido como <strong>sugestão</strong> e deve ser
            revisado e validado pelo Treinador/Parceiro antes de ser utilizado. A Player.Action:
          </p>
          <ul>
            <li>
              Não garante a precisão, adequação ou segurança dos conteúdos gerados por IA;
            </li>
            <li>
              Não se responsabiliza por lesões, danos ou prejuízos decorrentes do uso de
              conteúdo gerado por IA sem a devida validação profissional;
            </li>
            <li>
              O conteúdo gerado por IA, uma vez revisado e adotado pelo Treinador, passa a
              integrar o conteúdo do Treinador para todos os efeitos legais.
            </li>
          </ul>

          {/* 8. Limitação de Responsabilidade */}
          <h2>8. Limitação de Responsabilidade</h2>
          <p>
            A Player.Action, na qualidade de intermediadora tecnológica, <strong>não se
            responsabiliza</strong> por:
          </p>
          <ul>
            <li>
              Qualidade, adequação, segurança ou resultado dos treinos, aulas e consultorias
              oferecidos pelos Treinadores/Parceiros;
            </li>
            <li>Lesões físicas ou danos à saúde de Alunos decorrentes da execução de treinos;</li>
            <li>Descumprimento de obrigações por parte de Treinadores ou Alunos;</li>
            <li>
              Indisponibilidade temporária da Plataforma por motivos técnicos, manutenções ou
              eventos de força maior;
            </li>
            <li>
              Conteúdo publicado por Usuários que viole direitos de terceiros;
            </li>
            <li>
              Decisões profissionais tomadas com base em sugestões geradas por IA.
            </li>
          </ul>
          <p>
            Em qualquer hipótese, a responsabilidade total da Player.Action ficará limitada ao
            valor efetivamente pago pelo Usuário nos <strong>12 (doze) meses</strong> anteriores
            ao evento que deu origem à reclamação.
          </p>

          {/* 9. Suspensão e Encerramento de Contas */}
          <h2>9. Suspensão e Encerramento de Contas</h2>
          <p>
            A Player.Action reserva-se o direito de suspender ou encerrar a conta de qualquer
            Usuário, mediante notificação prévia sempre que possível, nas seguintes hipóteses:
          </p>
          <ul>
            <li>Violação destes Termos de Uso ou da Política de Privacidade;</li>
            <li>Utilização da Plataforma para fins ilegais, fraudulentos ou abusivos;</li>
            <li>Publicação de conteúdo ofensivo, discriminatório, difamatório ou que viole direitos de terceiros;</li>
            <li>Fornecimento de informações falsas no cadastro;</li>
            <li>Inatividade da conta por período superior a 12 (doze) meses;</li>
            <li>Inadimplência reiterada por parte de Treinadores/Parceiros;</li>
            <li>Solicitação judicial ou de autoridade competente.</li>
          </ul>
          <p>
            Em caso de encerramento da conta, o Usuário terá direito a acessar e exportar seus
            dados pessoais pelo prazo de <strong>30 (trinta) dias</strong> após a notificação,
            conforme previsto na LGPD.
          </p>

          {/* 10. Alterações nos Termos */}
          <h2>10. Alterações nos Termos</h2>
          <p>
            A Player.Action poderá atualizar estes Termos de Uso a qualquer momento. As
            alterações serão comunicadas aos Usuários por meio de notificação na Plataforma
            e/ou por e-mail, com antecedência mínima de <strong>15 (quinze) dias</strong> antes
            da entrada em vigor.
          </p>
          <p>
            O uso continuado da Plataforma após a data de vigência das alterações implica a
            aceitação integral dos novos termos.
          </p>

          {/* 11. Lei Aplicável e Foro */}
          <h2>11. Lei Aplicável e Foro</h2>
          <p>
            Estes Termos de Uso são regidos pela <strong>legislação da República Federativa do
            Brasil</strong>, incluindo, mas não se limitando a:
          </p>
          <ul>
            <li>Lei nº 8.078/1990 — Código de Defesa do Consumidor (CDC);</li>
            <li>Lei nº 13.709/2018 — Lei Geral de Proteção de Dados (LGPD);</li>
            <li>Lei nº 12.965/2014 — Marco Civil da Internet;</li>
            <li>Lei nº 10.406/2002 — Código Civil Brasileiro.</li>
          </ul>
          <p>
            Fica eleito o foro da Comarca de São Paulo, Estado de São Paulo, como competente
            para dirimir quaisquer questões decorrentes destes Termos de Uso, com exclusão de
            qualquer outro, por mais privilegiado que seja.
          </p>

          {/* 12. Disposições Gerais */}
          <h2>12. Disposições Gerais</h2>
          <ul>
            <li>
              A eventual tolerância quanto ao descumprimento de qualquer disposição destes
              Termos não constituirá renúncia ao direito de exigi-la;
            </li>
            <li>
              Se qualquer cláusula destes Termos for considerada inválida ou inexequível, as
              demais permanecerão em pleno vigor e efeito;
            </li>
            <li>
              Estes Termos constituem o acordo integral entre o Usuário e a Player.Action em
              relação ao uso da Plataforma.
            </li>
          </ul>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100 my-12" />

        {/* Related links */}
        <div className="flex flex-col sm:flex-row gap-4 mb-12">
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
          <p>Última atualização: 6 de julho de 2026</p>
          <p className="mt-1">Data de vigência: 6 de julho de 2026</p>
        </div>
      </main>
    </div>
  )
}
