import { forwardRef, Module } from '@nestjs/common';
import { OrderService } from './service/order.service';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { OrderController } from 'src/interfaces/controllers/order/order.controller';
import { OrderRepositoryPrisma } from 'src/domain/order/repository/order.repository.prisma';
import { ORDER_REPOSITORY } from 'src/common/constants/app.constants';
import { ProductModule } from '../product/product.module';
import { CouponModule } from '../coupon/coupon.module';
import { DatabaseModule } from 'src/infrastructure/database/database.module';

@Module({
    imports: [
        ProductModule,
        forwardRef(() => CouponModule)
    ],
    controllers: [OrderController],
    providers: [
        OrderService,
        {
            provide: ORDER_REPOSITORY,
            useClass: OrderRepositoryPrisma,
        },
        PrismaService,
    ],
    exports: [OrderService, ORDER_REPOSITORY],
})
export class OrderModule {}
