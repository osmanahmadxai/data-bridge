import { Controller, Get } from '@nestjs/common';
import { listDrivers, toDriverInfo, type DriverInfo } from '@syncle/core/adapters';

@Controller('drivers')
export class DriversController {
  @Get()
  list(): DriverInfo[] {
    return listDrivers().map(toDriverInfo);
  }
}
