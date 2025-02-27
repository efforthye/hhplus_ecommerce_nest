import { Injectable } from '@nestjs/common';
import { Order } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DataPlatform {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async sendOrderData(order: Order): Promise<boolean> {
    // userId로 사용자 정보 조회
    const user = await this.prisma.userAccount.findUnique({
      where: { id: order.userId },
    });

    if (!user) {
      console.error(`User with ID ${order.userId} not found.`);
      return false;
    }

    // .env에서 이메일 사용자와 비밀번호 가져오기
    const mailUser = this.configService.get<string>('MAIL_USER');
    const mailPass = this.configService.get<string>('MAIL_PASS');

    // 메일 전송 설정
    const transporter = nodemailer.createTransport({
      service: 'gmail', // 또는 다른 메일 서비스 사용 가능
      auth: {
        user: mailUser, // 보내는 사람 이메일
        pass: mailPass,  // 이메일 비밀번호 (혹은 App Password 사용)
      },
    });

    // 메일 내용 설정
    const mailOptions = {
      from: mailUser,
      to: user.email, // 사용자 이메일
      subject: `주문 #${order.id} 정보`,
      text: `안녕하세요 ${user.name}님,\n\n주문 아이디 #${order.id} 의 주문 접수가 완료되었습니다.\n총 금액: ${order.totalAmount}\n할인 금액: ${order.discountAmount}\n최종 금액: ${order.finalAmount}\n\n주문해 주셔서 감사합니다!`,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log('Order data sent successfully!');
      return true;
    } catch (error) {
      console.error('Error sending order data:', error);
      return false;
    }
  }
}
