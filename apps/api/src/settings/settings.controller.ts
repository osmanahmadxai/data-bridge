import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  appSettingsSchema,
  type AppSettings,
  type AppSettingsDTO,
} from '@data-bridge/core';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SettingsStoreService } from './settings-store.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly store: SettingsStoreService) {}

  @Get()
  get(): Promise<AppSettings> {
    return this.store.resolved();
  }

  @Put()
  update(
    @Body(new ZodValidationPipe(appSettingsSchema)) dto: AppSettingsDTO,
  ): Promise<AppSettings> {
    return this.store.update(dto);
  }
}
