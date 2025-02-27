import { forwardRef, Module } from '@nestjs/common';
import { OrderService } from './service/order.service';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { OrderController } from 'src/interfaces/controllers/order/order.controller';
import { OrderRepositoryPrisma } from 'src/domain/order/repository/order.repository.prisma';
import { COUPON_REPOSITORY, ORDER_REPOSITORY, PRODUCT_REPOSITORY } from 'src/common/constants/app.constants';
import { ProductModule } from '../product/product.module';
import { CouponModule } from '../coupon/coupon.module';
import { DatabaseModule } from 'src/infrastructure/database/database.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DataPlatform } from 'src/infrastructure/external/data-platform';
import { ProductRepositoryPrisma } from '../product/repository/product.repository.impl';
import { CouponRepositoryPrisma } from '../coupon/repository/coupon.repository.prisma';
import { KafkaModule } from 'src/infrastructure/kafka/kafka.module';
import { OutboxModule } from 'src/infrastructure/outbox/outbox.module';

@Module({
    imports: [
        ProductModule,
        forwardRef(() => CouponModule),
        EventEmitterModule.forRoot(),
        KafkaModule,
        OutboxModule
    ],
    controllers: [OrderController],
    providers: [
        OrderService,
        {
            provide: ORDER_REPOSITORY,
            useClass: OrderRepositoryPrisma,
        },
        PrismaService,
        DataPlatform,
        {
            provide: PRODUCT_REPOSITORY,
            useClass: ProductRepositoryPrisma
        },
        {
            provide: COUPON_REPOSITORY,
            useClass: CouponRepositoryPrisma
        }
    ],
    exports: [OrderService, ORDER_REPOSITORY],
})
export class OrderModule {}
