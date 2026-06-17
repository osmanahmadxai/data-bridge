import { Controller, Get } from '@nestjs/common';
import { listDrivers, toDriverInfo, type DriverInfo } from '@data-bridge/core/adapters';

@Controller('drivers')
export class DriversController {
  @Get()
  list(): DriverInfo[] {
    return listDrivers().map(toDriverInfo);
  }
}
