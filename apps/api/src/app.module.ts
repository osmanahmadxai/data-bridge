import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { redisConnectionOptions } from './common/runtime-config';
import { ConnectionsModule } from './connections/connections.module';
import { DriversModule } from './drivers/drivers.module';
import { HooksModule } from './hooks/hooks.module';
import { SettingsModule } from './settings/settings.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    CommonModule,
    // SettingsModule + AuthModule are global; AuthModule registers the
    // app-wide guard, so every route below is protected unless marked @Public()
    SettingsModule,
    AuthModule,
    BullModule.forRoot({ connection: redisConnectionOptions() }),
    ConnectionsModule,
    DriversModule,
    HooksModule,
    WorkspacesModule,
  ],
})
export class AppModule {}
