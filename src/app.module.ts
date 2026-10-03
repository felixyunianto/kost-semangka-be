import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { UsersModule } from "./modules/users/users.module";
import { AuthModule } from "./modules/auth/auth.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PropertyModule } from './modules/properties/property.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { OccupantsModule } from './modules/occupants/occupants.module';
import { BillsModule } from './modules/bills/bills.module';
import { ScheduleModule } from "@nestjs/schedule";
import { PaymentsModule } from './modules/payments/payments.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { FinancesModule } from './modules/finances/finances.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 10,
      },
    ]),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    PropertyModule,
    RoomsModule,
    OccupantsModule,
    BillsModule,
    PaymentsModule,
    DashboardModule,
    FinancesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
