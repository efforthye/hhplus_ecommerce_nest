import { Module, forwardRef } from '@nestjs/common';
import { CouponService } from './service/coupon.service';
import { COUPON_REPOSITORY } from 'src/common/constants/app.constants';
import { CouponRepositoryPrisma } from './repository/coupon.repository.prisma';
import { DatabaseModule } from 'src/infrastructure/database/database.module';
import { OrderModule } from '../order/order.module';
import { BalanceModule } from '../balance/balance.module';
import { RedisModule } from 'src/infrastructure/redis/redis.module';
import { RedisRedlock } from 'src/infrastructure/redis/redis.redlock';
import { CouponIssueScheduler } from './service/coupon-issue.scheduler';
import { CouponRedisRepository } from './repository/coupon.redis.repository';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
    imports: [
        DatabaseModule, 
        forwardRef(() => OrderModule), 
        BalanceModule, 
        RedisModule,
        ScheduleModule.forRoot(),
        EventEmitterModule.forRoot()
    ],
    providers: [
        CouponService, // 비즈니스 로직 관리
        CouponIssueScheduler,
        CouponRedisRepository,
        RedisRedlock,
        { provide: COUPON_REPOSITORY, useClass: CouponRepositoryPrisma }
    ],
    exports: [CouponService, COUPON_REPOSITORY],
})
export class CouponModule {}
