# Epic: Motor de Progressão IA (RAG) & Integração de Vídeo (V2)

O objetivo desta grande atualização é transformar o atual "Gerador Estático de Treinos" em um **Ecossistema Dinâmico**. A IA passará a analisar o histórico mensal do aluno (Aderência, Feedbacks e Anotações do Treinador - RAG) para gerar treinos evolutivos. Além disso, os treinos em texto serão enriquecidos com **Vídeos HLS** hospedados no Cloudinary, enviados pelo treinador via Drag & Drop.

## User Review Required
> [!IMPORTANT]
> **Criação da Conta Cloudinary:** Será necessário que você crie uma conta gratuita no [Cloudinary](https://cloudinary.com) e nos forneça as variáveis de ambiente (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) no arquivo `.env` para habilitarmos o upload e o stream de vídeo a custo zero no MVP.

---

## Proposed Changes

### 1. Migração de Banco de Dados (Prisma Schema)
Precisamos preparar o terreno para a IA ter "memória" e para os vídeos existirem.
#### [MODIFY] `prisma/schema.prisma`
- **Modelo `StudentNote` (NOVO):** Criar tabela vinculada ao `Student` e `Trainer` contendo as notas contínuas ("Perna pesada", "Melhorou agilidade"). A IA lerá essas notas no fim do mês.
- **Modelo `Exercise`:** Adicionar colunas opcionais `videoUrl` e `videoPublicId` (para controle do Cloudinary).
- **Modelo `TrainingSession`:** Garantir campos robustos de `athleteFeedback` (ex: nota de 1 a 5 de cansaço).

### 2. O Cérebro da IA (Context Retrieval & JSON Mode)
A rota de IA vai deixar de cuspir um texto gigante na tela e passará a cruzar os dados do mês estruturadamente.
#### [MODIFY] `app/api/training-plans/route.js`
- **O Scanner (RAG):** Antes de ligar para o Groq/Claude, o backend fará fetch de:
  - Sessões concluídas nos últimos 30 dias (Taxa de Aderência).
  - Últimas 5 `StudentNotes` cadastradas pelo treinador.
  - `athleteFeedback` do plano anterior.
- **JSON Mode:** O Prompt será alterado para forçar a IA a responder num JSON estrito contendo os `IDs` dos exercícios da base de dados do Treinador, garantindo o "Match" perfeito do Vídeo com o Texto.

### 3. Biblioteca do Treinador (Drag & Drop)
Para a experiência ser fluida, o treinador não inserirá links de YouTube, ele vai arrastar o arquivo do celular/PC dele.
#### [NEW] `app/api/upload/route.js`
- Rota para geração de assinatura segura segura com o Cloudinary API.
#### [MODIFY/NEW] `app/[locale]/dashboard/exercises/page.js`
- Criação do Uploader de Vídeo usando `react-dropzone`.
- Timeline de Componentes baseados em cartão do Shadcn UI com *autoplay muted* no *hover*.
#### [NEW] `app/[locale]/dashboard/students/[id]/notes/page.js`
- Uma aba nova no perfil do aluno para o Treinador ir escrevendo as anotações semanais que vão alimentar a IA no mês seguinte.

### 4. A Experiência do Aluno (Treino Interativo)
O aluno vai clicar no treino do dia e os cartões de exercícios se expandirão em vídeos fluidos.
#### [MODIFY] `app/[locale]/dashboard/active-session/[id]/page.js`
- Refatoração do renderizador de Treinos. Em vez de ler Markdown cru, ele vai iterar o JSON gerado pela IA.
- Se houver `videoUrl`, exibir o componente de player nativo do navegador/HLS para o exercício, junto com as séries e reps.

---

## Verification Plan

### Manual Verification
1. **Banco Atualizado:** Rodar `npx prisma db push` e verificar se as tabelas de `StudentNote` e atualização de `Exercise` suportam vídeos sem quebrar dados existentes.
2. **Upload de Teste:** O Treinador arrasta um vídeo .mp4 pro painel. Verifica-se na dashboard do Cloudinary se o arquivo subiu e se o banco salvou a URL de conversão mágica (ex: altera `.mp4` para HLS no runtime).
3. **Teste de Amnésia (RAG):** Cadastrar uma nota "Aluno quebrou o pé direito". Pedir para a IA gerar o plano e confirmar que ela adapta e isola os treinos superiores explicitamente baseada na nota.
4. **Visualização do Aluno:** Entrar com o token do aluno, abrir a rotina e verificar se o modal de vídeo reproduz nativamente no iOS/Android/Web.
