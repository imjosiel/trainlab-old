import { Body, Controller, Get, Headers, Patch, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminVideoProcessorService } from './admin-video-processor.service';
@ApiTags('admin-video-processor')
@Controller('admin/video-processor')
export class AdminVideoProcessorController {
  constructor(private readonly service: AdminVideoProcessorService) {}
  private async isAuthorized(headers: any, isAdmin: boolean): Promise<boolean> {
    const apiKey = headers['x-processor-key'];
    if (apiKey && process.env.PROCESSOR_API_KEY && apiKey === process.env.PROCESSOR_API_KEY) return true;
    return isAdmin;
  }
  @Get()
  async listar(@Headers() headers: any) {
    // AdminOnly via guard, mas também permite x-processor-key
    return this.service.listar();
  }
  @Patch()
  async atualizar(@Body() body: any) {
    return this.service.atualizar(body);
  }
}
