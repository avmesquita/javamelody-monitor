import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogEntry, CatalogSchema } from './catalog.schema';
import { CatalogService }              from './catalog.service';
import { CatalogController }           from './catalog.controller';
import { AiService }                   from './ai.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CatalogEntry.name, schema: CatalogSchema }]),
  ],
  controllers: [CatalogController],
  providers:   [CatalogService, AiService],
  exports:     [CatalogService],
})
export class CatalogModule {}
