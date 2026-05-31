import { Module }         from '@nestjs/common';
import { ConfigModule }   from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MetricsModule }  from './metrics/metrics.module';
import { AlertsModule }   from './alerts/alerts.module';
import { CatalogModule }  from './catalog/catalog.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      process.env.MONGO_URI || 'mongodb://localhost:27017/javamelody',
    ),
    MetricsModule,
    AlertsModule,
    CatalogModule,
  ],
})
export class AppModule {}
