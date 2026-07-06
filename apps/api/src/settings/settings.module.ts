import { Global, Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsStoreService } from './settings-store.service';

// @Global so AuthService (and anything else) can read settings without importing
// this module explicitly. PrismaService comes from the global CommonModule.
@Global()
@Module({
  controllers: [SettingsController],
  providers: [SettingsStoreService],
  exports: [SettingsStoreService],
})
export class SettingsModule {}
