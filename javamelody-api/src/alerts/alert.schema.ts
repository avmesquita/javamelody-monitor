import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

@Schema({ collection: 'alerts', timestamps: false })
export class Alert {
  @ApiProperty() @Prop({ required: true, index: true }) clientId:   number;
  @ApiProperty() @Prop({ required: true })              clientName: string;
  @ApiProperty() @Prop({ required: true, index: true }) occurredAt: Date;
  @ApiProperty() @Prop({ required: true })              fromStatus: string; // ok | warn | err
  @ApiProperty() @Prop({ required: true })              toStatus:   string;
  @ApiProperty() @Prop()                                cpu:        number;
  @ApiProperty() @Prop()                                heap:       number;
  @ApiProperty() @Prop()                                message:    string;
}

export type AlertDocument = Alert & Document;
export const AlertSchema  = SchemaFactory.createForClass(Alert);

//AlertSchema.index({ clientId: 1, occurredAt: -1 });
//AlertSchema.index({ occurredAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 }); // 180 dias
