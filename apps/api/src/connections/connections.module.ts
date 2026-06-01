import { Module } from '@nestjs/common';
import { CryptoService } from '../common/crypto.service';
import { PrismaService } from '../common/prisma.service';
import { AdapterPoolService } from './adapter-pool.service';
import { ConnectionStoreService } from './connection-store.service';
import { ConnectionsController } from './connections.controller';

@Module({
  controllers: [ConnectionsController],
  providers: [
    PrismaService,
    CryptoService,
    ConnectionStoreService,
    AdapterPoolService,
  ],
  exports: [ConnectionStoreService, AdapterPoolService],
})
export class ConnectionsModule {}
