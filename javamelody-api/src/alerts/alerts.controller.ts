import { Controller, Get, Param, Query, ParseIntPipe, DefaultValuePipe, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';

@ApiTags('alerts')
@Controller('api/history/alerts')
export class AlertsController {
  constructor(private readonly svc: AlertsService) {}

  /**
   * Alertas recentes de todos ou de um cliente
   * GET /api/history/alerts?clientId=1&limit=50
   */
  @Get()
  @ApiOperation({ summary: 'Alertas de mudança de status' })
  @ApiQuery({ name: 'clientId', required: false, type: Number })
  @ApiQuery({ name: 'limit',    required: false, type: Number })
  recent(
    @Query('clientId') clientId?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.svc.recent(clientId ? parseInt(clientId) : undefined, limit);
  }
}
