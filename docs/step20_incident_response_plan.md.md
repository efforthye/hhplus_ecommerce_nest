# 선착순 쿠폰 발급 시스템 장애 대응 문서

## 1. 개요
본 문서는 선착순 쿠폰 발급 시스템에 대한 성능 테스트 진행 중 발견된 시스템 병목 현상과 장애 상황에 대한 분석 및 대응 방안을 제시한다. 테스트 결과를 바탕으로 시스템 안정성 및 성능 개선을 위한 가이드라인을 제공한다.

## 2. 테스트 시나리오 설명
### 테스트 환경
- **테스트 기간**: 2025년 2월 28일
- **테스트 대상**: `/coupons/fcfs/:id/issue` API 엔드포인트
- **서버 환경**: NestJS 애플리케이션 (Node.js/TypeScript)
- **데이터베이스**: MySQL 8.0
- **캐싱 시스템**: Redis 4개 인스턴스 클러스터
- **동시성 제어**: Redlock을 활용한 분산 락 메커니즘
### 테스트 구성
- **단계별 사용자 증가**:
  - 3분 동안 0명에서 500명까지 증가
  - 5분 동안 500명에서 1,000명까지 증가
  - 5분 동안 1,000명 유지
  - 2분 동안 1,000명에서 0명으로 감소
- **테스트 도구**: k6
- **모니터링 도구**: Grafana, InfluxDB

## 3. 발견된 장애 현상
### 3.1 Redis 연결 실패 및 Redlock 에러
```
Redlock error: ResourceLockedError: The operation was applied to: 0 of the 1 requested resources.
```
- **발생 시점**: 테스트 시작 후 동시 접속자가 약 500명을 초과한 시점
- **현상**: Redis를 활용한 분산 락(Distributed Lock) 획득 실패
- **영향**: 동시에 다수의 쿠폰 발급 요청 시 락 획득 실패로 인한 에러 로그 다수 발생
- **심각도**: 중간 - 서비스 자체는 계속 동작하지만 로그가 과도하게 생성되어 모니터링 어려움
### 3.2 쿠폰 재고 소진
```
Client Error: POST /coupons/fcfs/1/issue - 400 - Coupon stock is empty
```
- **발생 시점**: 테스트 중반부
- **현상**: 쿠폰 수량 소진으로 인한 발급 실패
- **영향**: 정상적인 비즈니스 로직에 의한 오류이나, 사용자에게 적절한 안내 필요
- **심각도**: 낮음 - 예상된 동작이며 비즈니스 로직상 정상
### 3.3 중복 발급 시도
```
Client Error: POST /coupons/fcfs/1/issue - 400 - 이미 발급된 쿠폰입니다.
```
- **발생 시점**: 테스트 전반에 걸쳐 지속적으로 발생
- **현상**: 동일 사용자가 이미 발급받은 쿠폰을 재요청
- **영향**: 정상적인 비즈니스 로직에 의한 오류
- **심각도**: 낮음 - 예상된 동작이며 비즈니스 로직상 정상
### 3.4 시스템 성능 저하
- **발생 시점**: 동시 접속자 수가 800명을 초과한 시점
- **현상**: 응답 시간 급증 (평균 1,075ms, 최대 6,107ms)
- **영향**: 사용자 경험 저하 및 타임아웃 발생 가능성 증가
- **심각도**: 높음 - 사용자 경험에 직접적인 영향

## 4. 원인 분석
### 4.1 Redis 연결 실패 및 Redlock 에러
- **원인**: 
  - Redis 인스턴스에 대한 연결 풀 고갈
  - 동시 요청 처리를 위한 Redis 설정 최적화 미흡
  - Redlock 라이브러리의 타임아웃 설정 부적절
### 4.2 시스템 성능 저하
- **원인**:
  - 인덱스 미적용으로 인한 DB 전체 스캔
  - 개별 트랜잭션 처리 시 불필요한 DB 조회 발생
  - 비효율적인 쿼리 실행 계획 (Execution Plan)
  - 과도한 로그 생성으로 인한 I/O 부하

## 5. 해결 방안
### 5.1 즉각 조치 사항 (즉시 적용)
#### Redis 연결 문제 해결
- Redis 연결 풀 크기 증가: 최대 동시 연결 수를 증가시켜 연결 풀 고갈 방지
  ```js
  // Redis 연결 풀 설정 최적화
  const redisOptions = {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT, 10),
    db: 0,
    maxRetriesPerRequest: 5,
    enableReadyCheck: false,
    maxConnections: 100 // 기존 10에서 증가
  };
  ```
#### Redlock 설정 최적화
- 재시도 로직 개선 및 타임아웃 설정 조정
  ```js
  // Redlock 설정 최적화
  const redlock = new Redlock(
    [redisClient], 
    {
      driftFactor: 0.01,
      retryCount: 3,     // 기존 10에서 감소
      retryDelay: 200,   // 기존 500에서 감소
      retryJitter: 100,  // 재시도 간 무작위성 추가
      automaticExtensionThreshold: 500
    }
  );
  ```
#### 에러 로깅 최적화
- 불필요한 반복 로그 남기지 않도록 로깅 수준 조정
  ```js
  // 로깅 최적화
  if (error instanceof ResourceLockedError) {
    // DEBUG 레벨로 낮추어 과도한 로깅 방지
    logger.debug(`Redlock error: ${error.message}`);
  } else {
    logger.error(`Unexpected error: ${error.message}`, error.stack);
  }
  ```
### 5.2 단기 개선 사항 (1-2주 내 적용)
#### 데이터베이스 최적화
- 인덱스 적용:
  ```sql
  -- 사용자 ID, 쿠폰 ID 기반 복합 인덱스 생성
  CREATE INDEX idx_user_coupon ON user_coupons(userId, couponId);
  
  -- 쿠폰 상태 검색 최적화를 위한 인덱스
  CREATE INDEX idx_fcfs_coupon_status ON fcfs_coupons(status, stockQuantity);
  ```
#### 캐싱 전략 개선
- 쿠폰 정보 캐싱 및 재고 관리 최적화:
  ```js
  // Redis를 활용한 쿠폰 정보 캐싱
  async function getCouponInfo(couponId) {
    const cacheKey = `coupon:${couponId}:info`;
    
    // 캐시에서 먼저 조회
    const cachedInfo = await redisClient.get(cacheKey);
    if (cachedInfo) {
      return JSON.parse(cachedInfo);
    }
    
    // DB에서 조회 후 캐시에 저장
    const couponInfo = await prisma.fcfsCoupon.findUnique({
      where: { id: couponId }
    });
    
    if (couponInfo) {
      await redisClient.set(
        cacheKey, 
        JSON.stringify(couponInfo),
        'EX',
        300 // 5분 캐싱
      );
    }
    
    return couponInfo;
  }
  ```

#### 분산 락 메커니즘 개선
- Redlock 에러 처리 및 폴백(Fallback) 메커니즘 구현:
  ```js
  async function acquireLock(resource, ttl) {
    try {
      return await redlock.acquire([resource], ttl);
    } catch (error) {
      if (error instanceof ResourceLockedError) {
        // 락 획득 실패 시 폴백 메커니즘으로 DB 락 사용
        return await acquireDatabaseLock(resource);
      }
      throw error;
    }
  }
  ```

### 5.3 장기 개선 사항 (1-3개월 내 적용)
#### 아키텍처 개선
- 이벤트 기반 아키텍처로 전환:
  - 쿠폰 발급 요청과 처리를 비동기적으로 분리
  - Kafka를 활용한 메시지 큐 도입으로 부하 분산
#### 성능 모니터링 강화
- APM(Application Performance Monitoring) 도구 도입
- 실시간 알림 시스템 구축
#### 자동 스케일링 전략
- CPU, 메모리 사용률에 따른 자동 스케일링 설정
- 트래픽 패턴 분석을 통한 예측형 스케일링 구현

## 6. 장애 대응 타임라인
### 장애 인지
- **00:00:00** - 장애 인지: 모니터링 시스템에서 Redis 연결 오류 및 응답 시간 증가 알림
- **00:00:05** - 개발팀 전파: 개발팀 비상 대응 채널에 알림 전송
### 서버 재시작
- **00:12:34** - 서버 재시작: Redis 연결 풀 설정 조정 후 애플리케이션 서버 재시작
- **00:15:20** - 모니터링 확인: 서비스 안정화 확인 및 지속적 모니터링 체계 수립
### 해결 과정
- 로깅 수준 조정을 통한 불필요한 로그 감소
- Redis 연결 풀 크기 증가 및 타임아웃 설정 최적화
- Redlock 관련 설정 튜닝 및 에러 처리 개선

## 7. 재발 방지 대책
### 시스템 모니터링 강화
- Grafana 대시보드 개선:
  - Redis 연결 상태 및 성능 지표 추가
  - Redlock 관련 메트릭 추가
  - 응답 시간 분포 시각화
### 성능 테스트 프로세스 개선
- 정기적인 부하 테스트 수행 (월 1회)
- 실제 트래픽 패턴을 반영한 시나리오 구성
- 테스트 결과의 체계적인 문서화 및 공유
### 개발 프로세스 개선
- 코드 리뷰 시 성능 관련 체크리스트 도입
- 성능 테스트 자동화 및 CI/CD 파이프라인 통합
- 개발자 대상 성능 최적화 교육 실시

## 8. 결론
선착순 쿠폰 발급 시스템에 대한 부하 테스트를 통해 발견된 주요 문제점은 Redis 연결 관리, Redlock 설정, 그리고 데이터베이스 쿼리 최적화와 관련되어 있다. 단기적으로는 Redis 설정 최적화와 로깅 개선을 통해 문제를 완화할 수 있으며, 장기적으로는 이벤트 기반 아키텍처로의 전환과 자동 스케일링 전략이 필요하다.

이번 테스트와 장애 대응을 통해 얻은 경험은 향후 유사한 고부하 시스템 개발 시 유용한 가이드라인이 될 것이며, 지속적인 모니터링과 성능 테스트를 통해 시스템의 안정성과 신뢰성을 유지해 나갈 계획이다.
