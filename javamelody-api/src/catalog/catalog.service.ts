import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { CatalogEntry, CatalogEntryDocument, CatalogStatus, DevSolution } from './catalog.schema';
import { AiService } from './ai.service';

export interface IngestPayload {
  clientId:      number;
  clientName:    string;
  exceptionType: string;
  uri:           string;
  statusHttp:    number;
  stackTrace?:   string;
  errorMessage?: string;
}

export interface UpdateStatusPayload {
  status:       CatalogStatus;
  devSolution?: Omit<DevSolution, 'resolvedAt'>;
  notes?:       string;
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    @InjectModel(CatalogEntry.name) private model: Model<CatalogEntryDocument>,
    private readonly ai: AiService,
  ) {}

  // ── Hash: tipo_exception + uri_normalizada + status ──────────────────────
  private buildHash(exceptionType: string, uri: string, statusHttp: number): string {
    // Normaliza a URI removendo IDs numéricos e UUIDs para agrupar padrões
    // ex: /api/faturas/12345 → /api/faturas/:id
    const normalizedUri = uri
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
      .replace(/\/\d+/g, '/:id');

    const raw = `${exceptionType}::${normalizedUri}::${statusHttp}`;
    return createHash('sha256').update(raw).digest('hex').substring(0, 16);
  }

  // ── Ingere um erro — cria entrada ou incrementa ocorrências ──────────────
  async ingest(payload: IngestPayload): Promise<{ isNew: boolean; entry: CatalogEntryDocument }> {
    const hash = this.buildHash(payload.exceptionType, payload.uri, payload.statusHttp);
    const now  = new Date();

    const existing = await this.model.findOne({ hash });

    if (existing) {
      // Já conhecido — apenas atualiza contadores
      existing.occurrences += 1;
      existing.lastSeenAt   = now;
      // Atualiza stack trace se não tinha antes
      if (!existing.stackTrace && payload.stackTrace) {
        existing.stackTrace = payload.stackTrace;
      }
      await existing.save();
      return { isNew: false, entry: existing };
    }

    // Novo tipo de erro — cria e dispara análise IA
    const entry = await this.model.create({
      hash,
      exceptionType: payload.exceptionType,
      uri:           payload.uri,
      statusHttp:    payload.statusHttp,
      clientId:      payload.clientId,
      clientName:    payload.clientName,
      stackTrace:    payload.stackTrace    || '',
      errorMessage:  payload.errorMessage  || '',
      occurrences:   1,
      firstSeenAt:   now,
      lastSeenAt:    now,
      status:        'open',
      aiPending:     true,
      aiAnalysis:    null,
      aiError:       null,
      devSolution:   null,
      notes:         null,
    });

    // Análise IA assíncrona — não bloqueia o retorno
    this.analyzeAsync(entry).catch(err =>
      this.logger.error(`Falha na análise IA para ${hash}: ${err.message}`)
    );

    return { isNew: true, entry };
  }

  // ── Análise IA — executada em background ─────────────────────────────────
  async analyzeAsync(entry: CatalogEntryDocument): Promise<void> {
    this.logger.log(`Analisando com IA: ${entry.hash} (${entry.exceptionType})`);
    try {
      const analysis = await this.ai.analyze(entry);
      await this.model.updateOne({ _id: entry._id }, {
        $set: { aiAnalysis: analysis, aiPending: false, aiError: null },
      });
      this.logger.log(`IA concluída: ${entry.hash} — ${analysis.severity} / ${analysis.category}`);
    } catch (err) {
      await this.model.updateOne({ _id: entry._id }, {
        $set: { aiPending: false, aiError: err.message },
      });
    }
  }

  // ── Re-análise sob demanda ────────────────────────────────────────────────
  async reanalyze(id: string): Promise<void> {
    const entry = await this.model.findById(id);
    if (!entry) throw new Error('Entrada não encontrada');
    await this.model.updateOne({ _id: id }, { $set: { aiPending: true, aiError: null } });
    await this.analyzeAsync(entry);
  }

  // ── Listagem com filtros ──────────────────────────────────────────────────
  async list(filters: {
    clientId?:  number;
    status?:    CatalogStatus;
    severity?:  string;
    search?:    string;
    limit?:     number;
    skip?:      number;
  }): Promise<{ total: number; entries: CatalogEntryDocument[] }> {
    const query: any = {};

    if (filters.clientId) query.clientId = filters.clientId;
    if (filters.status)   query.status   = filters.status;
    if (filters.severity) query['aiAnalysis.severity'] = filters.severity;
    if (filters.search) {
      query.$or = [
        { exceptionType: { $regex: filters.search, $options: 'i' } },
        { uri:           { $regex: filters.search, $options: 'i' } },
        { errorMessage:  { $regex: filters.search, $options: 'i' } },
      ];
    }

    const [total, entries] = await Promise.all([
      this.model.countDocuments(query),
      this.model.find(query)
        .sort({ lastSeenAt: -1 })
        .skip(filters.skip || 0)
        .limit(filters.limit || 20)
        .lean()
        .exec(),
    ]);

    return { total, entries };
  }

  async findById(id: string): Promise<CatalogEntryDocument | null> {
    return this.model.findById(id).exec();
  }

  // ── Atualiza status e solução do dev ─────────────────────────────────────
  async updateStatus(id: string, payload: UpdateStatusPayload): Promise<CatalogEntryDocument | null> {
    const update: any = { status: payload.status };

    if (payload.notes !== undefined) update.notes = payload.notes;

    if (payload.devSolution && payload.status === 'resolved') {
      update.devSolution = {
        ...payload.devSolution,
        resolvedAt: new Date(),
      };
    }

    return this.model.findByIdAndUpdate(id, { $set: update }, { new: true }).exec();
  }

  // ── Estatísticas para o dashboard ────────────────────────────────────────
  async stats(): Promise<any> {
    return this.model.aggregate([
      {
        $group: {
          _id: null,
          total:        { $sum: 1 },
          open:         { $sum: { $cond: [{ $eq: ['$status', 'open'] },         1, 0] } },
          investigating:{ $sum: { $cond: [{ $eq: ['$status', 'investigating'] }, 1, 0] } },
          resolved:     { $sum: { $cond: { if: { $eq: ['$status', 'resolved'] }, then: 1, else: 0 } },},
          critical:     { $sum: { $cond: [{ $eq: ['$aiAnalysis.severity', 'critical'] }, 1, 0] } },
          high:         { $sum: { $cond: [{ $eq: ['$aiAnalysis.severity', 'high'] },     1, 0] } },
          totalOccurrences: { $sum: '$occurrences' },
        },
      },
    ]).then(r => r[0] || {});
  }
}
