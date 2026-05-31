import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model }       from 'mongoose';
import { Alert, AlertDocument } from './alert.schema';

@Injectable()
export class AlertsService {
  constructor(
    @InjectModel(Alert.name) private model: Model<AlertDocument>,
  ) {}

  async recent(clientId?: number, limit = 50): Promise<AlertDocument[]> {
    const filter: any = clientId ? { clientId } : {};
    return this.model.find(filter).sort({ occurredAt: -1 }).limit(limit).lean().exec();
  }

  async save(data: Partial<Alert>): Promise<void> {
    await this.model.create(data);
  }
}
