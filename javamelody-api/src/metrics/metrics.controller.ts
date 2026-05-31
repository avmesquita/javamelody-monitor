import { Controller, Get, Param, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@Controller('api/history')
export class MetricsController {
  constructor(private readonly svc: MetricsService) {}

  /**
   * Últimas N amostras de um cliente — usado pelo Angular para o gráfico de heap
   * GET /api/history/clients/:id/latest?limit=60
   */
  @Get('clients/:id/latest')
  @ApiOperation({ summary: 'Últimas amostras de um cliente' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  latest(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit', new DefaultValuePipe(60), ParseIntPipe) limit: number,
  ) {
    return this.svc.latest(id, limit);
  }

  /**
   * Série temporal com filtro de datas
   * GET /api/history/clients/:id/series?from=2026-05-01&to=2026-05-29&limit=500
   */
  @Get('clients/:id/series')
  @ApiOperation({ summary: 'Série temporal de métricas' })
  @ApiQuery({ name: 'from',  required: false })
  @ApiQuery({ name: 'to',    required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  series(
    @Param('id', ParseIntPipe) id: number,
    @Query('from') from?: string,
    @Query('to')   to?:   string,
    @Query('limit', new DefaultValuePipe(500), ParseIntPipe) limit?: number,
  ) {
    return this.svc.timeSeries({
      clientId: id,
      from:  from ? new Date(from) : undefined,
      to:    to   ? new Date(to)   : undefined,
      limit,
    });
  }

  /**
   * Agregação horária — para gráfico de tendência de CPU/Heap/Erros
   * GET /api/history/clients/:id/hourly?hours=24
   */
  @Get('clients/:id/hourly')
  @ApiOperation({ summary: 'Médias horárias (CPU, Heap, Erros)' })
  @ApiQuery({ name: 'hours', required: false, type: Number })
  hourly(
    @Param('id', ParseIntPipe) id: number,
    @Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours: number,
  ) {
    return this.svc.hourlyAggregation(id, hours);
  }

  /**
   * Último snapshot com erros HTTP/SQL
   * GET /api/history/clients/:id/errors/latest
   */
  @Get('clients/:id/errors/latest')
  @ApiOperation({ summary: 'Último snapshot de erros registrado' })
  latestErrors(@Param('id', ParseIntPipe) id: number) {
    return this.svc.latestErrors(id);
  }

  /**
   * Série temporal de todos os clientes (para o grid)
   * GET /api/history/clients/all/latest?limit=12
   */
  @Get('clients/all/latest')
  @ApiOperation({ summary: 'Últimas amostras de todos os clientes' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  allLatest(
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
  ) {
    return this.svc.timeSeries({ limit });
  }
}
