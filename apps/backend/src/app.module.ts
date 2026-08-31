import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { ErrorContractFilter } from '@/common/error-contract.filter';

import { MeController } from '@/auth/me.controller';
import { NextAuthJwtGuard } from '@/auth/next-auth-jwt.guard';
import { RolesGuard } from '@/auth/roles.guard';
import { AffiliatesModule } from '@/affiliates/affiliates.module';
import { AppointmentsModule } from '@/appointments/appointments.module';
import { BillingModule } from '@/billing/billing.module';
import { CreditsModule } from '@/credits/credits.module';
import { ExercisesModule } from '@/exercises/exercises.module';
import { HealthController } from '@/health/health.controller';
import { MessagesModule } from '@/messages/messages.module';
import { NotificationsModule } from '@/notifications/notifications.module';
import { PartnerConnectModule } from '@/partner-connect/partner-connect.module';
import { PartnerTiersModule } from '@/partner-tiers/partner-tiers.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { RealtimeModule } from '@/realtime/realtime.module';
import { AdminModule } from '@/admin/admin.module';
import { SportsModule } from '@/sports/sports.module';
import { StudentNotesModule } from '@/students/student-notes.module';
import { StudentsModule } from '@/students/students.module';
import { TeamsModule } from '@/teams/teams.module';
import { InvitesModule } from '@/invites/invites.module';
import { DashboardModule } from '@/dashboard/dashboard.module';
import { TrainingPlansModule } from '@/training-plans/training-plans.module';
import { UploadModule } from '@/upload/upload.module';
import { UsersModule } from '@/users/users.module';

@Module({
  imports: [
    // O Nest não carrega .env por conta própria — sem isto o guard não encontra
    // NEXTAUTH_SECRET e nega toda requisição pelo ramo fail-closed. Popula
    // process.env, que é de onde o guard lê.
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RealtimeModule,
    SportsModule,
    NotificationsModule,
    MessagesModule,
    AppointmentsModule,
    PartnerTiersModule,
    BillingModule,
    UsersModule,
    StudentsModule,
    StudentNotesModule,
    AdminModule,
    CreditsModule,
    TrainingPlansModule,
    DashboardModule,
    TeamsModule,
    UploadModule,
    InvitesModule,
    PartnerConnectModule,
    AffiliatesModule,
    ExercisesModule,
  ],
  controllers: [HealthController, MeController],
  providers: [
    // APP_GUARD é o ponto inteiro da fatia 1: roda antes de todo handler,
    // incluindo os que ainda não foram escritos. Rota nova nasce protegida.
    //
    // A ORDEM IMPORTA e é a garantia do D11: auth primeiro (dono do 401),
    // roles depois (dono do 403). Invertida, uma rota de admin acessada sem
    // sessão responderia 403 em vez de 401.
    { provide: APP_GUARD, useClass: NextAuthJwtGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Mesmo espírito do guard global: o contrato `{ error }` deixa de depender
    // de cada lugar que lança se lembrar dele, e passa a valer para todo erro —
    // inclusive os que nascem fora do nosso código, como o 404 do router.
    { provide: APP_FILTER, useClass: ErrorContractFilter },
  ],
})
export class AppModule {}
