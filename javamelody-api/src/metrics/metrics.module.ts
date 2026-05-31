import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Metric, MetricSchema } from './metric.schema';
import { MetricsService }       from './metrics.service';
import { MetricsController }    from './metrics.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: Metric.name, schema: MetricSchema }])],
  controllers: [MetricsController],
  providers:   [MetricsService],
  exports:     [MetricsService],
})
export class MetricsModule {}
