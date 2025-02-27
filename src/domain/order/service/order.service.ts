import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { OrderRepository } from '../repository/order.repository';
import { ProductRepository } from 'src/domain/product/repository/product.repository';
import { CouponRepository } from 'src/domain/coupon/repository/coupon.repository';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { Order, OrderStatus, Prisma } from '@prisma/client';
import { CreateOrderDto } from 'src/interfaces/dto/order.dto';
import { COUPON_REPOSITORY, ORDER_REPOSITORY, PRODUCT_REPOSITORY } from 'src/common/constants/app.constants';
import { CustomLoggerService } from 'src/infrastructure/logging/logger.service';
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';
import { DataPlatform } from 'src/infrastructure/external/data-platform';
import { KafkaService } from 'src/infrastructure/kafka/kafka.service';
import { OutboxService } from 'src/infrastructure/outbox/outbox.service';

@Injectable()
export class OrderService {
    constructor(
        @Inject(ORDER_REPOSITORY) private readonly orderRepository: OrderRepository,
        @Inject(PRODUCT_REPOSITORY) private readonly productRepository: ProductRepository,
        @Inject(COUPON_REPOSITORY) private readonly couponRepository: CouponRepository,
        private readonly prisma: PrismaService,
        private readonly logger: CustomLoggerService,
        private readonly dataPlatform: DataPlatform,
        private readonly kafkaService: KafkaService,
        private readonly outboxService: OutboxService
    ) {
        this.logger.setTarget(HttpExceptionFilter.name);
    }

    async createOrder(userId: number, createOrderDto: CreateOrderDto): Promise<Order> {
        const order = await this.prisma.$transaction(async (tx) => {
            // 상품 및 재고 확인
            const orderItemsWithProduct = await Promise.all(
                createOrderDto.items.map(async (item) => {
                    const product = await this.productRepository.findById(item.productId);
                    if (!product || !product.isActive) {
                        throw new NotFoundException(`Product ${item.productId} not found or inactive`);
                    }

                    const variant = product.variants.find(v => v.id === item.variantId);
                    if (!variant || variant.stockQuantity < item.quantity) {
                        throw new BadRequestException(`Insufficient stock for product ${item.productId} variant ${item.variantId}`);
                    }

                    return {
                        product,
                        variant,
                        quantity: item.quantity
                    };
                })
            );

            // 총 금액 계산
            const totalAmount = orderItemsWithProduct.reduce((sum, item) => {
                return sum + (Number(item.variant.price) * item.quantity);
            }, 0);

            // 쿠폰 적용
            let discountAmount = 0;
            let couponConnect: any = undefined;
            if (createOrderDto.couponId) {
                try {
                    const userCoupon = await this.couponRepository.findExistingUserCoupon(
                        userId,
                        createOrderDto.couponId,
                        tx
                    );

                    if (userCoupon) {
                        const coupon = await tx.coupon.findUnique({
                            where: { id: userCoupon.couponId }
                        });

                        if (coupon && Number(coupon.minOrderAmount) <= totalAmount) {
                            discountAmount = coupon.type === 'PERCENTAGE'
                                ? totalAmount * (Number(coupon.amount) / 100)
                                : Number(coupon.amount);
                            
                            couponConnect = { id: createOrderDto.couponId };
                        }
                    }
                } catch (error) {
                    this.logger.error(`Coupon processing error: ${error}`);
                }
            }
            const finalAmount = totalAmount - discountAmount;

            // 주문 생성
            const createdOrder = await this.orderRepository.createOrder({
                user: { connect: { id: userId } },
                totalAmount: new Prisma.Decimal(totalAmount),
                discountAmount: new Prisma.Decimal(discountAmount),
                finalAmount: new Prisma.Decimal(finalAmount),
                status: OrderStatus.PENDING,
                orderItems: {
                    create: orderItemsWithProduct.map(item => ({
                        product: { connect: { id: item.product.id } },
                        productVariant: { connect: { id: item.variant.id } },
                        quantity: item.quantity,
                        unitPrice: item.variant.price,
                        totalPrice: new Prisma.Decimal(Number(item.variant.price) * item.quantity)
                    }))
                },
                ...(couponConnect && {
                    coupon: { connect: couponConnect }
                })
            });
            
            // 주문 완료 이벤트 데이터 준비
            const orderCreatedEvent = {
                orderId: createdOrder.id,
                userId: userId,
                totalAmount: totalAmount,
                discountAmount: discountAmount,
                finalAmount: finalAmount,
                items: orderItemsWithProduct.map(item => ({
                    productId: item.product.id,
                    variantId: item.variant.id,
                    quantity: item.quantity,
                    price: Number(item.variant.price)
                })),
                couponId: createOrderDto.couponId,
                timestamp: new Date().toISOString()
            };

            // 주문 이벤트 저장 (Kafka 전송 전에 Outbox에 저장)
            const outboxEvent = await tx.outboxEvent.create({
                data: {
                    aggregateId: createdOrder.id.toString(),
                    aggregateType: 'Order',
                    eventType: 'order.created',
                    payload: orderCreatedEvent,
                    status: 'PENDING'
                }
            });

            try {
                // Kafka로 주문 생성 이벤트 발행 시도
                await this.kafkaService.emit('order.created', orderCreatedEvent);

                // Kafka 전송 성공 시 Outbox 상태 업데이트
                await tx.outboxEvent.update({
                    where: { id: outboxEvent.id },
                    data: { status: 'SENT' }
                });
            } catch (error) {
                this.logger.error('Failed to emit order.created event to Kafka', error);
                
                // Kafka 발행 실패 시 Outbox에 저장 - 트랜잭션 컨텍스트 사용
                await tx.outboxEvent.create({
                    data: {
                        aggregateId: createdOrder.id.toString(),
                        aggregateType: 'Order',
                        eventType: 'order.created',
                        payload: orderCreatedEvent,
                        status: 'PENDING'
                    }
                });
            }

            return createdOrder;
        });

        // 데이터 플랫폼으로 전송
        this.dataPlatform.sendOrderData(order);

        return order;
    }

    async findOrderById(orderId: number): Promise<Order> {
        const order = await this.orderRepository.findOrderById(orderId);
        if (!order) throw new NotFoundException(`Order ${orderId} not found`);
        return order;
    }

    async updateOrderStatus(orderId: number, status: OrderStatus): Promise<Order> {
        return await this.prisma.$transaction(async (tx) => {
            const order = await this.orderRepository.findOrderById(orderId);
            if (!order) {
                throw new NotFoundException(`Order ${orderId} not found`);
            }

            const updatedOrder = await this.orderRepository.updateOrderStatus(orderId, status);
            
            const statusUpdateEvent = {
                orderId: orderId,
                status: status,
                previousStatus: order.status,
                timestamp: new Date().toISOString()
            };

            try {
                // Kafka로 상태 변경 이벤트 발행 시도 (주문 상태 변경 이벤트 발행)
                await this.kafkaService.emit('order.status.updated', statusUpdateEvent);
            } catch (error) {
                this.logger.error('Failed to emit order.status.updated event to Kafka', error);
                
                // Kafka 발행 실패 시 Outbox에 저장
                await this.outboxService.createEvent({
                    aggregateId: orderId.toString(),
                    aggregateType: 'Order',
                    eventType: 'order.status.updated',
                    payload: statusUpdateEvent
                });
            }

            return updatedOrder;
        });
    }

    async findOrdersByUserId(userId: number) {
        return this.prisma.order.findMany({
            where: { userId },
        });
    }
}