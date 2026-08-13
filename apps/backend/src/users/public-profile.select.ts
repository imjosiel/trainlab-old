/**
 * Allowlist de exposição do perfil público (D21 de
 * docs/implementation-plans/epic-nest-perfil-publico.md).
 *
 * `select` explícito, nunca `include` — e a diferença não é estilo. `include` é
 * allowlist de RELAÇÃO, não de CAMPO: ele traz todas as colunas da tabela
 * ligada. Foi assim que a rota legada passou a servir a anamnese médica inteira
 * (`injuryHistory`, `medicationDesc`, `healthIssuesDesc`…) para qualquer pessoa
 * sem autenticação — ver o achado A9.
 *
 * Com `select`, coluna nova no schema **não entra na resposta por acidente**.
 * Essa é a propriedade que importa aqui: falhar fechado.
 */
export const PUBLIC_PROFILE_SELECT = {
  // `id` do usuário fica fora de propósito: a página é endereçada por username
  // e nada no perfil público precisa do id interno.
  name: true,
  username: true,
  image: true,
  bio: true,
  roles: true,
  isPublic: true, // lido para decidir o 404; removido antes de responder
  createdAt: true,
  athleteProfiles: {
    select: {
      position: true,
      technicalLevel: true,
      yearsPlaying: true,
      sport: { select: { name: true, slug: true } },
      teams: { select: { name: true } },
    },
  },
} as const;

/**
 * Campos que NUNCA podem sair. Existe como constante para os testes afirmarem
 * ausência por lista, em vez de igualdade de objeto: assim, coluna sensível
 * adicionada ao schema no futuro quebra o teste em vez de passar calada.
 */
export const NEVER_PUBLIC = [
  // Anamnese
  'injuryHistory',
  'currentInjuries',
  'hasHealthIssues',
  'healthIssuesDesc',
  'takesMedication',
  'medicationDesc',
  'acceptedTerms',
  // Dados corporais
  'dateOfBirth',
  'height',
  'weight',
  'dominantFoot',
  // Anotações de treino
  'goals',
  'strengths',
  'weaknesses',
  'trainingFocus',
  'trainingDaysPerWeek',
  'trainingHoursPerDay',
  // Identificadores internos e contato
  'email',
  'emailVerified',
  'phone',
  'userId',
  'studentId',
  'sportId',
  'stripeCustomerId',
  'termsAcceptedAt',
  'privacyAcceptedAt',
  'systemRoles',
] as const;
