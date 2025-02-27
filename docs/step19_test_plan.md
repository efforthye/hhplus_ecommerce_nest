# 시스템 부하 테스트 계획
## 1. 테스트 대상: 선착순 쿠폰 발급 
- **API 엔드포인트**: `POST /coupons/fcfs/:id/issue`
- **테스트 대상 선정 이유**: 
본 테스트는 선착순 쿠폰 발급 시스템에 대한 부하 테스트 계획이다. 전통적인 마케팅 전략으로 선착순 쿠폰 발급 이벤트가 자주 활용되고 있으며, 이러한 이벤트는 짧은 시간에 많은 사용자가 동시에 접속하여 쿠폰을 발급받으려는 상황이 발생한다. 사용자들이 많이 접속할 것으로 예상되기 때문에, 시스템의 안정성과 성능을 사전에 검증하는 것이 중요하다.<br/>
부하 상황에서 시스템이 원활하게 작동하지 않을 경우, 사용자 경험 저하는 물론 비즈니스 손실과 브랜드 이미지 하락으로 이어질 수 있다. 따라서 이번 테스트를 통해 실제 대규모 트래픽 상황에서의 시스템 동작을 사전에 검증하고 최적화하고자 한다.

## 2. 테스트 목적
1. **동시성 처리 성능 검증**: 대규모 사용자가 동시에 쿠폰 발급을 요청할 때의 성능 및 안정성 측정
2. **시스템 병목 현상 파악**: 대규모 요청 시 발생할 수 있는 병목 현상 지점 식별
3. **자원 사용량 측정**: 다양한 부하 상황에서의 CPU, 메모리 사용량 측정
4. **최적 Docker 컨테이너 구성 탐색**: 다양한 Docker 자원 설정에 따른 성능 변화 관찰
5. **이벤트 기반 처리 효율성 검증**: EventEmitter를 통한 비동기 이벤트 처리 방식의 효율성 평가

## 3. 테스트 시나리오

### 시나리오 1: 점진적 부하 증가 테스트
- **목적**: 시스템의 점진적인 부하 대응 능력 측정
- **사용자 증가 패턴**: 
  - 3분 동안 0명에서 500명으로 증가
  - 5분 동안 500명에서 1,000명으로 증가
  - 5분 동안 1,000명 유지
  - 2분 동안 1,000명에서 0명으로 감소
- **측정 지표**: 응답 시간, 오류율, 서버 자원 사용량

### 시나리오 2: 피크 부하 테스트
- **목적**: 순간적인 대규모 요청에 대한 시스템 안정성 검증
- **사용자 패턴**: 0명에서 3,000명까지 1분 내 급증 후 5분간 유지
- **쿠폰 수량**: 1,000개 (한정 수량)
- **측정 지표**: 성공적인 쿠폰 발급 비율, 시스템 안정성, 응답 시간 분포

### 시나리오 3: 다양한 Docker 자원 설정에 따른 성능 비교
- **목적**: 최적의 컨테이너 리소스 구성 탐색
- **리소스 구성 변수**:
  - CPU: 1코어, 2코어, 4코어
  - 메모리: 1GB, 2GB, 4GB
- **부하 패턴**: 시나리오 1과 동일
- **측정 지표**: 각 구성별 처리량, 응답 시간, 자원 사용률

### 시나리오 4: 이벤트 처리 지연 시간 측정
- **목적**: 이벤트 기반 비동기 처리 방식의 효율성 검증
- **테스트 방식**: 쿠폰 발급 요청 후 이벤트 처리 완료까지의 시간 측정
- **부하 패턴**: 일정한 수준의 부하(500명)에서 10분간 유지
- **측정 지표**: 이벤트 큐 길이, 이벤트 처리 지연 시간

## 4. 측정 지표
### 성능 지표
- **응답 시간 (Response Time)**
  - 평균, 중앙값, p95, p99 응답 시간 등
- **처리량 (Throughput)**
  - 초당 요청 처리 수 (RPS)
- **오류율 (Error Rate)**
  - HTTP 4xx, 5xx 에러 비율
  - 비즈니스 로직 오류 (이미 발급된 쿠폰 등)

### 시스템 자원 지표
- **CPU 사용률**: 평균, 최대
- **메모리 사용량**: 평균, 최대
- **네트워크 I/O**: 초당 전송/수신 바이트
- **이벤트 큐 길이**: 미처리 이벤트 수

### 비즈니스 지표
- **쿠폰 발급 성공률**: 발급 성공 / 전체 요청
- **중복 발급 요청 비율**: 중복 요청 / 전체 요청
- **품절 후 요청 비율**: 품절 후 요청 / 전체 요청

# 테스트 스크립트
```js
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
```
