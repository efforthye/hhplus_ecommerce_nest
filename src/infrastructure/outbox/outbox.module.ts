import { Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { OutboxScheduler } from './outbox.scheduler';
import { KafkaModule } from '../kafka/kafka.module';
import { PrismaModule } from '../database/prisma.module';

@Module({
    imports: [
        KafkaModule,
        PrismaModule
    ],
    providers: [OutboxService, OutboxScheduler],
    exports: [OutboxService]
})
export class OutboxModule {}