import { Module, forwardRef } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsExportService } from './products-export.service';
import { ProductsController } from './products.controller';
import { EsimProviderModule } from '../esim-provider/esim-provider.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [
    forwardRef(() => EsimProviderModule),
    SystemSettingsModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsExportService],
  exports: [ProductsService],
})
export class ProductsModule {}
