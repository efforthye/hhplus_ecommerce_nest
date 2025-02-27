import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxService } from './outbox.service';
import { CustomLoggerService } from '../logging/logger.service';

@Injectable()
export class OutboxScheduler {
    constructor(
        private readonly outboxService: OutboxService,
        private readonly logger: CustomLoggerService
    ) {}

    @Cron(CronExpression.EVERY_5_MINUTES, { // EVERY_10_SECONDS
        name: 'process-outbox-events'
    })
    async handleOutboxEvents() {
        try {
            this.logger.log('Starting scheduled outbox processing...');
            await this.outboxService.processEvents();
            this.logger.log('Finished scheduled outbox processing');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorStack = error instanceof Error ? error.stack : '';
            this.logger.error(`Failed to process outbox events in scheduler: ${errorMessage}`, errorStack);
        }
    }
}