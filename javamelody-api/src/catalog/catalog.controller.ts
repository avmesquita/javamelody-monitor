import {
  Controller, Get, Post, Patch, Param, Body,
  Query, DefaultValuePipe, ParseIntPipe, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBody } from '@nestjs/swagger';
import type { IngestPayload, UpdateStatusPayload } from './catalog.service';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@Controller('api/catalog')
export class CatalogController {
  constructor(private readonly svc: CatalogService) {}

  /**
   * Ingere um erro do BFF — cria ou incrementa ocorrências
   * POST /api/catalog/ingest
   */
  @Post('ingest')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ingere um erro (usado pelo BFF)' })
  ingest(@Body() payload: IngestPayload) {
    return this.svc.ingest(payload);
  }

  /**
   * Estatísticas gerais do catálogo
   * GET /api/catalog/stats
   */
  @Get('stats')
  @ApiOperation({ summary: 'Totais por status e severidade' })
  stats() {
    return this.svc.stats();
  }

  /**
   * Lista entradas com filtros
   * GET /api/catalog?clientId=1&status=open&severity=critical&search=NullPointer&limit=20&skip=0
   */
  @Get()
  @ApiOperation({ summary: 'Lista o catálogo de erros' })
  @ApiQuery({ name: 'clientId',  required: false, type: Number })
  @ApiQuery({ name: 'status',    required: false, enum: ['open', 'investigating', 'resolved'] })
  @ApiQuery({ name: 'severity',  required: false, enum: ['low', 'medium', 'high', 'critical'] })
  @ApiQuery({ name: 'search',    required: false })
  @ApiQuery({ name: 'limit',     required: false, type: Number })
  @ApiQuery({ name: 'skip',      required: false, type: Number })
  list(
    @Query('clientId') clientId?: string,
    @Query('status')   status?:   string,
    @Query('severity') severity?: string,
    @Query('search')   search?:   string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('skip',  new DefaultValuePipe(0),  ParseIntPipe) skip?:  number,
  ) {
    return this.svc.list({
      clientId: clientId ? parseInt(clientId) : undefined,
      status:   status   as any,
      severity,
      search,
      limit,
      skip,
    });
  }

  /**
   * Detalhe de uma entrada
   * GET /api/catalog/:id
   */
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe completo de uma entrada' })
  findOne(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  /**
   * Atualiza status e registra solução do dev
   * PATCH /api/catalog/:id/status
   */
  @Patch(':id/status')
  @ApiOperation({ summary: 'Atualiza status e registra solução' })
  @ApiBody({
    schema: {
      example: {
        status: 'resolved',
        devSolution: { description: 'Adicionado null check no método X', author: 'dev@empresa.com' },
        notes: 'Problema recorrente após deploy da versão 2.3',
      },
    },
  })
  updateStatus(@Param('id') id: string, @Body() payload: UpdateStatusPayload) {
    return this.svc.updateStatus(id, payload);
  }

  /**
   * Re-analisa com IA sob demanda
   * POST /api/catalog/:id/reanalyze
   */
  @Post(':id/reanalyze')
  @HttpCode(200)
  @ApiOperation({ summary: 'Re-analisa a entrada com IA' })
  async reanalyze(@Param('id') id: string) {
    await this.svc.reanalyze(id);
    return { ok: true, message: 'Análise disparada em background.' };
  }
}
