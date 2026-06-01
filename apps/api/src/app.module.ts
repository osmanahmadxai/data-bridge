import { Module } from '@nestjs/common';
import { ConnectionsModule } from './connections/connections.module';
import { DriversModule } from './drivers/drivers.module';

@Module({
  imports: [ConnectionsModule, DriversModule],
})
export class AppModule {}
