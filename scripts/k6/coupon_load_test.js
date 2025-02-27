// docker-compose run k6 run /scripts/k6/coupon_load_test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// 커스텀 측정 지표 설정
const issuedCoupons = new Counter('issued_coupons');
const failedIssues = new Counter('failed_issues');
const responseTime = new Trend('response_time');

// 테스트용 쿠폰 ID
const COUPON_ID = 1;

// 테스트 구성 옵션
export const options = {
  stages: [
    { duration: '3m', target: 500 },  // 3분 동안 500명까지 증가
    { duration: '5m', target: 1000 }, // 5분 동안 1000명까지 증가
    { duration: '5m', target: 1000 }, // 5분 동안 1000명 유지
    { duration: '2m', target: 0 },    // 2분 동안 0명으로 감소
  ],
};

// 기본 테스트 함수
export default function () {
  // 1~1,000,000 사이의 랜덤 사용자 ID 생성
  const userId = Math.floor(Math.random() * 1000000) + 1;
  
  // 요청 헤더 및 바디 설정
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'x-bypass-token': 'happy-world-token',
    },
    tags: { 
      api_endpoint: 'issue_coupon',
      test_type: 'coupon_api',
      name: 'issue_coupon_request'
    }
  };
  
  const payload = JSON.stringify({
    userId: userId
  });
  
  // 쿠폰 발급 요청 전송
  const response = http.post(
    `http://host.docker.internal:3000/coupons/fcfs/${COUPON_ID}/issue`,
    payload,
    params
  );
  
  // 응답 시간 기록
  responseTime.add(response.timings.duration);
  
  // 응답 검증
  check(response, {
    'status is 201': (r) => r.status === 201,
    'response time < 2000ms': (r) => r.timings.duration < 2000,
  });
  
  // 성공/실패 카운팅
  if (response.status === 201) {
    issuedCoupons.add(1);
  } else {
    failedIssues.add(1);
  }
  
  // API 서버 부하 감소를 위한 짧은 휴식
  sleep(0.1);
}