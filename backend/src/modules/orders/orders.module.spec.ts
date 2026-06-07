import 'reflect-metadata';
import { ProductsModule } from '../products/products.module';
import { OrdersModule } from './orders.module';

describe('OrdersModule graph', () => {
  it('не теряет ProductsModule при загрузке через Products -> EsimProvider -> Orders cycle', () => {
    expect(ProductsModule).toBeDefined();

    const imports = Reflect.getMetadata('imports', OrdersModule) ?? [];
    const resolvedImports = imports.map((entry: any) =>
      entry?.forwardRef ? entry.forwardRef() : entry,
    );

    expect(resolvedImports[0]).toBe(ProductsModule);
  });
});
