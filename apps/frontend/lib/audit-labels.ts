/**
 * lib/audit-labels.ts
 *
 * Somente labels PT-BR para a tela de auditoria (client-safe).
 * Porte fiel de `lib/audit.ts` do legado — sem Prisma, sem server-only.
 * A escrita de logs mora no backend Nest; aqui só exibição.
 */

// Mapa de ações para labels legíveis em PT-BR
export const AUDIT_ACTION_LABELS: Record<string, string> = {
    // Configurações
    SETTINGS_UPDATED:           'Configurações financeiras atualizadas',
    // Relatórios
    REPORT_GENERATED:           'Relatório mensal gerado',
    REPORT_UPDATED:             'Relatório mensal atualizado',
    REPORT_PUBLISHED:           'Relatório mensal publicado',
    // Usuários
    USER_ROLE_CHANGED:          'Papel de usuário alterado',
    USER_SYSTEM_ROLE_CHANGED:   'Papel de sistema alterado',
    // Parceiros
    PARTNER_APPROVED:           'Parceiro aprovado',
    PARTNER_REJECTED:           'Parceiro rejeitado',
    PARTNER_UPDATED:            'Parceiro atualizado',
    // Tiers
    TIER_CREATED:               'Tier criado',
    TIER_UPDATED:               'Tier atualizado',
    TIER_DELETED:               'Tier excluído',
    // Esportes
    SPORT_CREATED:              'Esporte criado',
    SPORT_UPDATED:              'Esporte atualizado',
    SPORT_DELETED:              'Esporte excluído',
}

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
    PlatformFinanceSettings:    'Configurações Financeiras',
    MonthlyReport:              'Relatório Mensal',
    User:                       'Usuário',
    PartnerAccount:             'Parceiro',
    PartnerTier:                'Tier de Parceiro',
    Sport:                      'Esporte',
}
