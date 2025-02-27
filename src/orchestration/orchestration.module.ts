import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { BalanceService } from '../domain/balance/service/balance.service';
import { OrderService } from '../domain/order/service/order.service';
import { PaymentService } from '../domain/payment/service/payment.service';
import { ProductService } from '../domain/product/service/product.service';
import { CouponService } from '../domain/coupon/service/coupon.service';
import { CartService } from '../domain/cart/service/cart.service';
import { BalanceOrchestrator } from './orchestrators/balance/balance.orchestrator';
import { CartOrchestrator } from './orchestrators/cart/cart.orchestrator';
import { OrderOrchestrator } from './orchestrators/order/order.orchestrator';
import { PaymentOrchestrator } from './orchestrators/payment/payment.orchestrator';
import { ProductOrchestrator } from './orchestrators/product/product.orchestrator';
import { CouponOrchestrator } from './orchestrators/coupon/coupon.orchestrator';
import { BALANCE_REPOSITORY, CART_REPOSITORY, COUPON_REPOSITORY, ORDER_REPOSITORY, PAYMENT_REPOSITORY, PRODUCT_REPOSITORY } from 'src/common/constants/app.constants';
import { BalanceRepositoryPrisma } from 'src/domain/balance/repository/balance.repository.prisma';
import { OrderRepositoryPrisma } from 'src/domain/order/repository/order.repository.prisma';
import { PaymentRepositoryPrisma } from 'src/domain/payment/repository/payment.repository.prisma';
import { ProductRepositoryPrisma } from 'src/domain/product/repository/product.repository.impl';
import { CouponRepositoryPrisma } from 'src/domain/coupon/repository/coupon.repository.prisma';
import { CartRepositoryPrisma } from 'src/domain/cart/repository/cart.repository.prisma';
import { CustomLoggerService } from 'src/infrastructure/logging/logger.service';
import { DataPlatform } from 'src/infrastructure/external/data-platform';
import { PaymentStatisticsService } from 'src/domain/payment/service/payment-statistics.service';
import { RedisModule } from 'src/infrastructure/redis/redis.module';
import { CouponRedisRepository } from 'src/domain/coupon/repository/coupon.redis.repository';
import { RedisRedlock } from 'src/infrastructure/redis/redis.redlock';
import { KafkaModule } from 'src/infrastructure/kafka/kafka.module';
import { OutboxModule } from 'src/infrastructure/outbox/outbox.module';

@Module({
    imports: [
        EventEmitterModule.forRoot(),
        RedisModule,
        KafkaModule,
        OutboxModule
    ],
    providers: [
        PrismaService,
        BalanceOrchestrator,
        CartOrchestrator,
        OrderOrchestrator,
        PaymentOrchestrator,
        ProductOrchestrator,
        CouponOrchestrator,
        BalanceService,
        OrderService,
        PaymentService,
        PaymentStatisticsService,
        ProductService,
        CouponService,
        CartService,
        BalanceRepositoryPrisma,
        PaymentRepositoryPrisma,
        {provide: BALANCE_REPOSITORY, useClass: BalanceRepositoryPrisma},
        {provide: ORDER_REPOSITORY, useClass: OrderRepositoryPrisma},
        {provide: PAYMENT_REPOSITORY, useClass: PaymentRepositoryPrisma},
        {provide: PRODUCT_REPOSITORY, useClass: ProductRepositoryPrisma},
        {provide: COUPON_REPOSITORY, useClass: CouponRepositoryPrisma},
        {provide: CART_REPOSITORY, useClass: CartRepositoryPrisma},
        CustomLoggerService,
        DataPlatform,
        CouponRedisRepository,
        RedisRedlock,
        OrderService
    ],
    exports: [
        BalanceOrchestrator,
        CartOrchestrator,
        OrderOrchestrator,
        PaymentOrchestrator,
        ProductOrchestrator,
        CouponOrchestrator,
        BalanceRepositoryPrisma,
        OrderService
    ]
})
export class OrchestrationModule {}