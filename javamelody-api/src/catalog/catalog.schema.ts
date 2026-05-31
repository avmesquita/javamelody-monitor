import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type CatalogStatus = 'open' | 'investigating' | 'resolved';

export class AiAnalysis {
  @ApiProperty() probableCause:  string;
  @ApiProperty({ type: [String] }) suggestedFixes: string[];
  @ApiProperty() severity:       string;
  @ApiProperty() category:       string;
  @ApiProperty() context:        string;
  @ApiProperty() analyzedAt:     Date;
  @ApiProperty() model:          string;
}

export class DevSolution {
  @ApiProperty() description: string;
  @ApiProperty() author:      string;
  @ApiProperty() resolvedAt:  Date;
}

@Schema({ collection: 'catalog', timestamps: true })
export class CatalogEntry {
  @ApiProperty()
  @Prop({ required: true, unique: true, index: true })
  hash: string;

  @ApiProperty()
  @Prop({ required: true })
  exceptionType: string;

  @ApiProperty()
  @Prop({ required: true })
  uri: string;

  @ApiProperty()
  @Prop({ required: true })
  statusHttp: number;

  @ApiProperty()
  @Prop({ required: true })
  clientId: number;

  @ApiProperty()
  @Prop({ required: true })
  clientName: string;

  @ApiProperty()
  @Prop({ type: String, default: '' })
  stackTrace: string;

  @ApiProperty()
  @Prop({ type: String, default: '' })
  errorMessage: string;

  @ApiProperty()
  @Prop({ default: 1 })
  occurrences: number;

  @ApiProperty()
  @Prop({ required: true })
  firstSeenAt: Date;

  @ApiProperty()
  @Prop({ required: true })
  lastSeenAt: Date;

  // Campos com union type (string | null) precisam de type explícito
  @ApiProperty({ type: Object, nullable: true })
  @Prop({ type: Object, default: null })
  aiAnalysis: AiAnalysis | null;

  @ApiProperty()
  @Prop({ type: Boolean, default: false })
  aiPending: boolean;

  @ApiProperty({ nullable: true })
  @Prop({ type: String, default: null })
  aiError: string | null;

  @ApiProperty({ type: Object, nullable: true })
  @Prop({ type: Object, default: null })
  devSolution: DevSolution | null;

  @ApiProperty({ enum: ['open', 'investigating', 'resolved'] })
  @Prop({ type: String, default: 'open', index: true })
  status: CatalogStatus;

  @ApiProperty({ nullable: true })
  @Prop({ type: String, default: null })
  notes: string | null;
}

export type CatalogEntryDocument = CatalogEntry & Document;
export const CatalogSchema = SchemaFactory.createForClass(CatalogEntry);

CatalogSchema.index({ clientId: 1, status: 1 });
CatalogSchema.index({ lastSeenAt: -1 });
CatalogSchema.index({ 'aiAnalysis.severity': 1 });
