import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma client lifecycle, managed by Nest. Backs the application's own
 * metadata store (saved connections) only.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger('Prisma');

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to metadata store');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
