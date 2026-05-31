import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model }       from 'mongoose';
import { Metric, MetricDocument } from './metric.schema';

export interface TimeSeriesQuery {
  clientId?: number;
  from?:     Date;
  to?:       Date;
  limit?:    number;
}

@Injectable()
export class MetricsService {
  constructor(
    @InjectModel(Metric.name) private model: Model<MetricDocument>,
  ) {}

  // ── Últimas N amostras por cliente ────────────────────────────────────────
  async latest(clientId: number, limit = 60): Promise<MetricDocument[]> {
    return this.model
      .find({ clientId })
      .sort({ collectedAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  // ── Série temporal com range de datas ─────────────────────────────────────
  async timeSeries(query: TimeSeriesQuery): Promise<MetricDocument[]> {
    const filter: any = {};
    if (query.clientId) filter.clientId = query.clientId;
    if (query.from || query.to) {
      filter.collectedAt = {};
      if (query.from) filter.collectedAt.$gte = query.from;
      if (query.to)   filter.collectedAt.$lte = query.to;
    }
    return this.model
      .find(filter)
      .sort({ collectedAt: -1 })
      .limit(query.limit ?? 500)
      .lean()
      .exec();
  }

  // ── Snapshot mais recente de erros (quando há erros) ──────────────────────
  async latestErrors(clientId: number): Promise<MetricDocument | null> {
    return this.model
      .findOne({
        clientId,
        $or: [
          { httpErrors: { $gt: 0 } },
          { sqlErrors:  { $gt: 0 } },
        ],
      })
      .sort({ collectedAt: -1 })
      .lean()
      .exec();
  }

  // ── Resumo agregado por hora (para gráficos de tendência) ─────────────────
  async hourlyAggregation(clientId: number, hours = 24): Promise<any[]> {
    const since = new Date(Date.now() - hours * 3_600_000);
    return this.model.aggregate([
      { $match: { clientId, collectedAt: { $gte: since } } },
      {
        $group: {
          _id: {
            year:  { $year:   '$collectedAt' },
            month: { $month:  '$collectedAt' },
            day:   { $dayOfMonth: '$collectedAt' },
            hour:  { $hour:   '$collectedAt' },
          },
          avgCpu:       { $avg: '$cpu' },
          maxCpu:       { $max: '$cpu' },
          avgHeap:      { $avg: '$heap' },
          maxHeap:      { $max: '$heap' },
          totalHttpErr: { $sum: '$httpErrors' },
          totalSqlErr:  { $sum: '$sqlErrors' },
          samples:      { $sum: 1 },
          from:         { $min: '$collectedAt' },
        },
      },
      { $sort: { from: 1 } },
    ]);
  }

  // ── Usado pelo BFF para salvar ────────────────────────────────────────────
  async save(data: Partial<Metric>): Promise<void> {
    await this.model.create(data);
  }
}
