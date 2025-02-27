import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { KafkaService } from '../kafka/kafka.service';
import { CustomLoggerService } from '../logging/logger.service';

@Injectable()
export class OutboxService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly kafkaService: KafkaService,
        private readonly logger: CustomLoggerService
    ) {}

    async processEvents() {
        try {
            this.logger.log('Starting to process outbox events...');
            
            const pendingEvents = await this.prisma.outboxEvent.findMany({
                where: {
                    status: 'INIT',
                    OR: [
                        { status: 'PENDING' },
                        { 
                            status: 'FAILED',
                            retryCount: { lt: 3 }
                        }
                    ],
                    updatedAt: {
                        lt: new Date(Date.now() - 5 * 60 * 1000) // 현재 시간에서 5분 전
                    }
                },
                orderBy: { createdAt: 'asc' },
                take: 10
            });

            this.logger.log(`Found ${pendingEvents.length} pending events`);

            for (const event of pendingEvents) {
                try {
                    // 이미 퍼블리시 된 이벤트는 처리하지 않도록 방어
                    if (event.status === 'PUBLISHED') {
                        this.logger.log(`Event ${event.id} is already published. Skipping.`);
                        continue;
                    }
    
                    this.logger.log(`Processing event: ${JSON.stringify({
                        id: event.id,
                        type: event.eventType,
                        aggregateId: event.aggregateId
                    })}`);

                    await this.kafkaService.emit(event.eventType, event.payload);
                    
                    await this.prisma.outboxEvent.update({
                        where: { id: event.id },
                        data: {
                            status: 'PUBLISHED',
                            updatedAt: new Date()
                        }
                    });

                    this.logger.log(`Successfully processed event ${event.id}`);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    const errorStack = error instanceof Error ? error.stack : '';
                    
                    this.logger.error(`Failed to process event ${event.id}. Error: ${errorMessage}`, errorStack);
                    
                    await this.prisma.outboxEvent.update({
                        where: { id: event.id },
                        data: {
                            status: 'FAILED',
                            error: errorMessage,
                            retryCount: { increment: 1 },
                            updatedAt: new Date()
                        }
                    });
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorStack = error instanceof Error ? error.stack : '';
            this.logger.error(`Error in processEvents: ${errorMessage}`, errorStack);
            throw error;
        }
    }

    async createEvent(data: {
        aggregateId: string;
        aggregateType: string;
        eventType: string;
        payload: any;
    }) {
        try {
            this.logger.log(`Creating outbox event: ${JSON.stringify(data)}`);
            return await this.prisma.outboxEvent.create({
                data: {
                    ...data,
                    status: 'PENDING'
                }
            });
        } catch (error) {
            this.logger.error(`Failed to create outbox event: ${error.message}`, error.stack);
            throw error;
        }
    }
}