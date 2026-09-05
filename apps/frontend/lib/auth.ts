/**
 * lib/auth.ts
 * Configuração do NextAuth — providers, callbacks, eventos e seed.
 */

import { PrismaAdapter } from '@auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import { prisma } from '@/lib/prisma'
import { ROLES, SYSTEM_ROLES, ADMIN_SYSTEM_ROLES, DEFAULT_SPORTS } from '@/lib/constants'
import type { AuthOptions } from 'next-auth'

// ── Tiers padrão — seeded quando o primeiro admin é criado ────────────────────
const DEFAULT_PARTNER_TIERS = [
  {
    slug:                    'starter',
    name:                    'Starter',
    description:             'Plano base gratuito para treinadores parceiros.',
    commissionRate:           0.60,
    minPrice:                99.90,
    maxAthletes:             null,   // Sem limite — quanto mais alunos, mais receita
    maxPlansPerMonth:        10,     // 10 planos por aluno/mês (redistribuível)
    allowFlexibleDistribution: true,
    payoutSchedule:          'monthly',
    payoutDelayDays:         7,
    isActive:                true,
  },
] as const

// ── Seed de defaults da plataforma ────────────────────────────────────────────
async function seedPlatformDefaults(): Promise<void> {
  // Partner tiers
  try {
    const existingSlugs = new Set(
      (await prisma.partnerTier.findMany({ select: { slug: true } })).map(t => t.slug)
    )
    for (const tier of DEFAULT_PARTNER_TIERS) {
      if (existingSlugs.has(tier.slug)) continue
      const { payoutSchedule, payoutDelayDays, ...coreFields } = tier
      try {
        await prisma.partnerTier.create({ data: { ...tier } })
      } catch {
        await prisma.partnerTier.create({ data: coreFields })
      }
    }
  } catch (err) {
    console.error('[AUTH] Seed partner tiers falhou:', err)
  }

  // Sports
  try {
    for (const sport of DEFAULT_SPORTS) {
        await prisma.sport.upsert({
        where:  { slug: sport.slug },
        create: { ...sport, isActive: true, positions: [...sport.positions] },
        update: { isActive: true, name: sport.name, positions: [...sport.positions] },
      })
    }
  } catch (err) {
    console.error('[AUTH] Seed sports falhou:', err)
  }

  // Platform finance settings
  try {
    await prisma.platformFinanceSettings.upsert({
      where:  { id: 'singleton' },
      create: {
        stripePercentFee:      0.0399,
        stripeFixedFeeInCents: 39,
        usdToBrlRate:          5.85,
        distributionRules: [
          { label: 'Caixa da Empresa',     percentage: 0.40 },
          { label: 'Distribuição — Você',  percentage: 0.30 },
          { label: 'Distribuição — Sócio', percentage: 0.30 },
        ],
      },
      update: {},
    })
  } catch (err) {
    console.error('[AUTH] Seed finance settings falhou:', err)
  }
}

// ── authOptions ───────────────────────────────────────────────────────────────
export const authOptions: AuthOptions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma) as any,
  secret:  process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // Meet/Calendar desativado (fatia 37): sem o scope calendar.events
          // o Google não exige verificação de app. Para reativar o Meet,
          // descomente a linha do scope completo abaixo.
          scope:       'openid email profile',
          // scope:       'openid email profile https://www.googleapis.com/auth/calendar.events',
          access_type: 'offline',
          prompt:      'consent',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, trigger }) {
      // Seed inicial do token
      if (user) {
        const u = user as unknown as Record<string, unknown>
        token.id = u.id as string
        token.roles         = (u['roles'] as string[]) || [ROLES.PENDING]
        token.systemRoles   = (u['systemRoles'] as string[]) || [SYSTEM_ROLES.USER]
        // subscriptionStatus/Plan/stripeCustomerId agora vivem em UserSubscription
        // Não disponível no adapter diretamente — será carregado no primeiro needsRefresh
        token.subscriptionStatus = null
        token.subscriptionPlan   = null
        token.stripeCustomerId   = null
        token.dbCheckedAt        = Date.now()

        // ── Sincroniza tokens OAuth do Google na Account ───────────────────────
        // O PrismaAdapter do NextAuth NÃO atualiza tokens em re-login.
        // Sem isso, usuários que logaram antes do scope calendar.app.created
        // ficam com tokens antigos e o Meet nunca funciona.
        if (account?.provider === 'google' && token.id) {
          try {
            await prisma.account.updateMany({
              where: { userId: token.id, provider: 'google' },
              data: {
                access_token:  account.access_token  ?? undefined,
                refresh_token: account.refresh_token ?? undefined,
                expires_at:    account.expires_at    ?? undefined,
                scope:         account.scope         ?? undefined,
                id_token:      account.id_token      ?? undefined,
              },
            })
          } catch (e) {
            console.error('[AUTH] Erro ao sincronizar tokens Google:', e)
          }
        }
      }

      const FIFTEEN_MINUTES = 15 * 60 * 1000
      const lastCheck = token.dbCheckedAt ?? 0
      const needsRefresh =
        !token.roles ||
        token.roles.length === 0 ||
        trigger === 'update' ||
        Date.now() - lastCheck > FIFTEEN_MINUTES
        // BUG-19 fix: removido token.roles.includes(ROLES.PENDING) — causava DB hit
        // em toda requisição de usuário pendente, ignorando o TTL de 15 min.
        // O trigger === 'update' já cobre a transição de PENDING → role real após onboarding.

      if (needsRefresh && token.id) {
        try {
          const freshUser = await prisma.user.findUnique({
            where:  { id: token.id },
            select: {
              id:          true,
              roles:       true,
              systemRoles: true,
              subscription: {
                select: { status: true, plan: true, stripeCustomerId: true },
              },
            },
          })

          if (!freshUser) {
            console.warn(`[AUTH] JWT inválido: usuário ${token.id} não existe. Invalidando sessão.`)
            return {} // token vazio = sessão inválida
          }

          token.roles              = freshUser.roles           || [ROLES.PENDING]
          token.systemRoles        = (freshUser.systemRoles as string[]) || [SYSTEM_ROLES.USER]
          token.subscriptionStatus = freshUser.subscription?.status   ?? null
          token.subscriptionPlan   = freshUser.subscription?.plan     ?? null
          token.stripeCustomerId   = freshUser.subscription?.stripeCustomerId ?? null
          token.dbCheckedAt        = Date.now()

          // Safety First Admin: promove se não existir nenhum admin
          if (!token.systemRoles?.includes(SYSTEM_ROLES.ADMIN)) {
            const anyAdmin = await prisma.user.findFirst({
              where: { systemRoles: { has: SYSTEM_ROLES.ADMIN } }
            })
            if (!anyAdmin) {
              const updated = await prisma.user.update({
                where: { id: token.id },
                data:  { systemRoles: { set: [SYSTEM_ROLES.ADMIN] }, roles: { set: [ROLES.PROFESSIONAL, ROLES.INDIVIDUAL] as import('@prisma/client').UserRole[] } }
              })
              token.systemRoles = updated.systemRoles as string[]
              token.roles       = updated.roles
              await seedPlatformDefaults()
            }
          }

          // Auto-seed de sports para novos bancos (fire-and-forget, admin only)
          const isCurrentAdmin = token.systemRoles?.some(r => ADMIN_SYSTEM_ROLES.includes(r as typeof ADMIN_SYSTEM_ROLES[number]))
          if (isCurrentAdmin) {
            prisma.sport.count({ where: { isActive: true } }).then(count => {
              if (count === 0) seedPlatformDefaults().catch(e => console.error('[AUTH] Auto-seed falhou:', e))
            }).catch(() => {})
          }
        } catch (err) {
          console.error('[AUTH] Erro ao verificar usuário no banco:', err)
        }
      }

      return token
    },

    async session({ session, token }) {
      if (!token?.id) return null as unknown as typeof session
      if (session?.user) {
        session.user.id              = token.id as string
        session.user.roles           = token.roles ?? [ROLES.PENDING]
        session.user.systemRoles     = token.systemRoles ?? [SYSTEM_ROLES.USER]
        session.user.isAdmin         = ADMIN_SYSTEM_ROLES.some(r => token.systemRoles?.includes(r))
        session.user.subscriptionStatus = token.subscriptionStatus
        session.user.subscriptionPlan   = token.subscriptionPlan
        session.user.stripeCustomerId   = token.stripeCustomerId
      }
      return session
    },
  },

  events: {
    async createUser({ user }) {
      try {
        // ── Geração de @username único ─────────────────────────────────────────
        let baseName = ''
        if (user.name) {
          baseName = user.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
        } else if (user.email) {
          baseName = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
        }
        if (!baseName) baseName = 'atleta'
        baseName = baseName.substring(0, 15)

        let username = baseName
        try {
          let isUnique = false
          let suffix = 1
          let attempts = 0
          while (!isUnique && attempts < 50) {
            attempts++
            const exists = await prisma.user.findUnique({ where: { username } })
            if (!exists) { isUnique = true } else { username = `${baseName}${suffix++}` }
          }
          if (!isUnique) username = `${baseName}${Date.now() % 100000}`
        } catch {
          username = `${baseName}${Date.now() % 100000}`
        }

        // ── Promoção a admin (com transaction para evitar race condition) ──────
        let wasPromoted = false
        try {
          await prisma.$transaction(async (tx) => {
            const adminExists = await tx.user.findFirst({ where: { systemRoles: { has: SYSTEM_ROLES.ADMIN } } })
            const updateData: import('@prisma/client').Prisma.UserUpdateInput = { username }
            if (!adminExists) {
              updateData['systemRoles'] = { set: [SYSTEM_ROLES.ADMIN] as import('@prisma/client').SystemRole[] }
              updateData['roles']       = { set: [ROLES.PROFESSIONAL, ROLES.INDIVIDUAL] as import('@prisma/client').UserRole[] }
            }
            await tx.user.update({ where: { id: user.id }, data: updateData })
          })

          const promoted = await prisma.user.findUnique({ where: { id: user.id }, select: { systemRoles: true } })
          wasPromoted = promoted?.systemRoles?.includes(SYSTEM_ROLES.ADMIN) ?? false
        } catch (txErr) {
          console.error('[AUTH] Erro na transaction createUser:', txErr)
        }

        // ── Seed + PartnerAccount para o primeiro admin ────────────────────────
        if (wasPromoted) {
          try {
            await seedPlatformDefaults()
            const starterTier = await prisma.partnerTier.findFirst({ where: { slug: 'starter', isActive: true } })
            await prisma.partnerAccount.create({
              data: {
                userId:      user.id,
                status:      'approved',
                motivation:  'Conta do administrador da plataforma',
                partnerTier: 'starter',
                ...(starterTier ? { tierId: starterTier.id } : {}),
              }
            })
            // BUG-18 fix: garante que o admin tenha o role PARTNER_B2B para acessar o dashboard B2B
            await prisma.user.update({
              where: { id: user.id },
              data:  { roles: { push: ROLES.PARTNER as import('@prisma/client').UserRole } },
            })
          } catch (err) {
            console.error('[AUTH] Erro ao criar PartnerAccount do admin:', err)
          }
        }

        // ── Merge de convite pendente ──────────────────────────────────────────
        if (user.email) {
          try {
            const invite = await prisma.athleteInvite.findFirst({
              where:   { email: user.email.toLowerCase(), accepted: false },
              include: { trainer: { select: { name: true, id: true } } },
            })
            if (invite) {
              const trainerName = invite.trainer?.name || 'seu treinador'
              const studentProfile = invite.studentId
                ? await prisma.student.findUnique({
                    where: { id: invite.studentId },
                    include: { athleteProfiles: { include: { sport: true }, take: 1 } }
                  }).catch(() => null)
                : null

              const sportName = studentProfile?.athleteProfiles[0]?.sport?.name
              const sportInfo = sportName ? ` no esporte ${sportName}` : ''

              await prisma.notification.create({
                data: {
                  userId:  user.id,
                  type:    'STUDENT_INVITE',
                  title:   `${trainerName} te convidou!`,
                  message: `O treinador ${trainerName} já te cadastrou${sportInfo}. Conclua seu perfil para se conectar.`,
                }
              })

              if (invite.studentId) {
                await prisma.student.update({ where: { id: invite.studentId }, data: { userId: user.id } })
              }
            }
          } catch (inviteErr) {
            console.error('[AUTH] Erro ao verificar convite pendente:', inviteErr)
          }
        }
      } catch (outerErr) {
        console.error('[AUTH:createUser] erro inesperado (não propagado):', outerErr)
      }
    },
  },

  pages: {
    signIn: '/',
    error:  '/',
  },
  session: {
    strategy: 'jwt',
    maxAge:   30 * 24 * 60 * 60, // 30 dias
  },
}

export default authOptions
