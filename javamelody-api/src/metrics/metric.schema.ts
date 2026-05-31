import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

// ── Sub-documento: snapshot de erros HTTP/SQL ─────────────────────────────────
export class ErrorSnapshot {
  @ApiProperty() uri:    string;
  @ApiProperty() hits:   number;
  @ApiProperty() avgMs:  number;
  @ApiProperty() maxMs:  number;
  @ApiProperty() errors: number;
  @ApiProperty() type:   'http' | 'sql';
}

// ── Documento principal: ponto de série temporal ───────────────────────────────
@Schema({ collection: 'metrics', timestamps: false })
export class Metric {
  @ApiProperty()
  @Prop({ required: true, index: true })
  clientId: number;

  @ApiProperty()
  @Prop({ required: true })
  clientName: string;

  @ApiProperty()
  @Prop({ required: true, index: true })
  collectedAt: Date;

  // ── Métricas de sistema ──────────────────────────────────────────────────────
  @ApiProperty() @Prop() cpu:      number;
  @ApiProperty() @Prop() heap:     number;
  @ApiProperty() @Prop() heapUsed: number;
  @ApiProperty() @Prop() heapMax:  number;
  @ApiProperty() @Prop() sessions: number;
  @ApiProperty() @Prop() threads:  number;
  @ApiProperty() @Prop() status:   string; // ok | warn | err

  // ── Contadores de requisições ────────────────────────────────────────────────
  @ApiProperty() @Prop() httpHits:      number;
  @ApiProperty() @Prop() httpErrors:    number;
  @ApiProperty() @Prop() httpAvgMs:     number;
  @ApiProperty() @Prop() sqlHits:       number;
  @ApiProperty() @Prop() sqlErrors:     number;
  @ApiProperty() @Prop() sqlAvgMs:      number;
  @ApiProperty() @Prop() springHits:    number;
  @ApiProperty() @Prop() springErrors:  number;
  @ApiProperty() @Prop() jsfHits:       number;
  @ApiProperty() @Prop() jsfErrors:     number;

  // ── Snapshot de erros (só salvo quando errors > 0) ──────────────────────────
  @ApiProperty({ type: [ErrorSnapshot] })
  @Prop({ type: [Object], default: [] })
  httpErrorSnapshot: ErrorSnapshot[];

  @ApiProperty({ type: [ErrorSnapshot] })
  @Prop({ type: [Object], default: [] })
  sqlErrorSnapshot: ErrorSnapshot[];
}

export type MetricDocument = Metric & Document;
export const MetricSchema  = SchemaFactory.createForClass(Metric);

// Índice composto para queries de série temporal
//MetricSchema.index({ clientId: 1, collectedAt: -1 });
// TTL: remove documentos com mais de 90 dias automaticamente
//MetricSchema.index({ collectedAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });
