# 오일픽 (OilPick)

**경로상의 최적의 주유소 길찾기**

출발지와 목적지를 입력하면 그 경로에서 주유하기 가장 좋은 주유소를 찾아줍니다.
경로 반경 안에 조건에 맞는 곳이 없으면 **"검색 결과 없음"으로 끝내지 않고**, 우회할 가치가 있는 주유소까지 찾아 경유 경로를 만들어 줍니다.

```
경로 확정 → 경로상 검색 → 부족하면 근처로 확장 → 그래도 부족하면
         → "우회해도 이득인 곳"까지 탐색 → 각 후보를 경유하는 경로를 실제로 생성
         → "12.4km 우회 / +18분 / 3,252원 이득" 으로 판단 가능한 상태로 전달
```

---

## 왜 만드는가

티맵·네이버지도·카카오내비·오일나우 모두 "경로 주변 주유소 검색"을 제공하지만, 전부 **반경 하드 필터**를 씁니다. 반경 밖 주유소는 존재 자체가 사용자에게 전달되지 않습니다.

오일픽은 **반경으로 자르지 않고, 우회 비용과 이득을 비교해서 순위를 매깁니다.**

차이가 가장 크게 드러나는 사용자는 **LPG 차량 장거리 운전자**입니다. 자동차충전소는 주유소보다 훨씬 희소해서 "경로에 없음"이 자주 발생합니다.

---

## 주요 기능

| 기능                  | 설명                                                         |
| --------------------- | ------------------------------------------------------------ |
| 경로 기반 주유소 탐색 | 경로를 샘플링해 T1(경로상) → T2(근처) → T3(우회) 순으로 탐색 |
| 우회 비용·이득 계산   | 순절감액 = 기준가 대비 절약분 − 우회 연료비                  |
| 경유 경로 정밀 계산   | 상위 후보는 실제 경유 경로를 호출해 우회 거리·시간을 실측    |
| 기준 모드 3종         | 최단거리 / 최소비용 / 균형 — API 재호출 없이 즉시 전환       |
| 필터                  | 연료(필수) · 시설(세차·경정비·편의점) · 브랜드 · 품질인증    |
| 외부 내비 연결        | 카카오맵 / 네이버지도(경유지 포함) · 티맵(주유소를 목적지로) |
| 내 주변 주유소        | 현재 위치 기준 반경 5km                                      |

기능의 상세 정의는 [`docs/PRODUCT.md`](docs/PRODUCT.md)에 있습니다.

---

## 기술 스택

| 영역           | 선택                                                                                 |
| -------------- | ------------------------------------------------------------------------------------ |
| 프레임워크     | Next.js (App Router) · TypeScript                                                    |
| 플랫폼         | 모바일 웹 (반응형 SPA)                                                               |
| 패키지 매니저  | pnpm                                                                                 |
| 상태           | Zustand (+ `persist` → `localStorage`). 로그인 없음                                  |
| 스타일 · UI    | Tailwind CSS + shadcn/ui (Drawer · Tabs · Switch · Dialog **넷만**)                  |
| 검색 API       | SSE 스트리밍 + 인앱 브라우저용 JSON 폴백                                             |
| DB             | Neon (PostgreSQL) + **Drizzle ORM** — 주유소 마스터, 시군구 평균가, 익명 이벤트 로그 |
| 캐시           | Upstash Redis (REST) — 반경검색·경로·장소 응답, 일일 호출 예산 카운터                |
| 경로·장소·지도 | 카카오모빌리티 길찾기 · 카카오 로컬 · 카카오맵 JS SDK                                |
| 주유소·가격    | 오피넷(한국석유공사) 무료 오픈 API                                                   |
| 검증           | zod (서버 경계 전용)                                                                 |
| 테스트         | Vitest + MSW + Playwright                                                            |
| 린트 · 포맷    | ESLint + Prettier (레이어 경계 규칙 집행)                                            |
| 배포           | Vercel + Neon + Upstash (마켓플레이스 경유)                                          |

> **서비스 도착점은 소규모 실사용(지인·베타 수십 명)입니다.** 오피넷 하루 300회 한도 때문에 규모가 제약되며, 배치 사전수집·유료 API는 의도적으로 채택하지 않았습니다. 재검토 신호는 [`AGENTS.md`](AGENTS.md) §16.4에 있습니다.

> **AI/LLM을 사용하지 않습니다.** 금액·거리·시간은 전부 결정론적으로 계산하고, 추천 이유도 템플릿 규칙으로 생성합니다. 이유는 [`AGENTS.md`](AGENTS.md) §4를 보십시오.

---

## 프로젝트 구조

```
oilpick/
├── AGENTS.md          # AI Coding Agent 규칙 (필독)
├── README.md          # 이 파일
├── .env.example
├── docs/
│   ├── PRODUCT.md     # 무엇을 만드는가
│   └── ARCHITECTURE.md# 어떻게 만드는가
├── src/
│   ├── app/           # 화면 + Route Handlers (BFF)
│   ├── domain/        # 순수 계산 — 외부 의존 0
│   ├── services/      # 오케스트레이션
│   ├── infra/         # 외부 시스템 어댑터 (opinet · kakao · cache · db)
│   ├── components/
│   ├── store/         # Zustand 스토어
│   └── lib/api/       # 서버 호출 훅 (컴포넌트는 fetch를 직접 쓰지 않음)
├── scripts/           # 마스터 구축 · 배치 · 검증
└── tests/             # 통합 · E2E · MSW 픽스처
```

**전체 트리와 모듈별 책임은 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §2·§3에 있습니다.**
레이어 간 import 규칙은 [`AGENTS.md`](AGENTS.md) §7.1. **`src/domain/`은 순수 함수만 둡니다.**

---

## 로컬 실행

### 요구사항

- Node.js 20 이상
- pnpm 9 이상
- Neon PostgreSQL · Upstash Redis (Vercel 마켓플레이스로 프로비저닝 권장)
- 오피넷 인증키 · 카카오 개발자 앱 키

### 설치

```bash
git clone <repo-url> oilpick
cd oilpick
pnpm install
cp .env.example .env.local     # 아래 표를 참고해 값을 채웁니다
```

> Vercel 마켓플레이스로 Neon·Upstash를 붙였다면 `vercel env pull .env.local`로 접속 정보를 내려받을 수 있습니다.

### DB 준비

```bash
pnpm db:migrate               # drizzle-kit 마이그레이션 적용
pnpm data:sync-sigungu        # 시군구 평균가 동기화 (최초 1회 + 이후 일 1회 cron)
```

> `refuel_point`(주유소 마스터)는 별도 임포트 스크립트가 없습니다 — 표준데이터에 `UNI_ID`·시설 컬럼이 없어(`verify:standard-data` 실측, 폴백 C) 반경검색에서 처음 보는 주유소를 오피넷 상세 API로 조회할 때마다 채워집니다 ([`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §7.1).

### 개발 서버

```bash
pnpm dev                      # http://localhost:3000
```

### 검사

```bash
pnpm typecheck                # tsc --noEmit
pnpm lint                     # ESLint (레이어 경계 규칙 포함)
pnpm test                     # Vitest
pnpm test:e2e                 # Playwright
```

> **HTTPS 주의.** "현재 위치" 버튼은 브라우저 Geolocation API를 씁니다. `localhost`는 예외로 허용되지만, 로컬 IP(`192.168.x.x`)로 휴대폰에서 테스트하려면 HTTPS 터널(ngrok 등)이 필요합니다.

### 검증 스크립트

**코드를 쓰기 전에 실행하십시오.** 결과에 따라 알고리즘과 스키마가 달라집니다. 각 항목의 실패 시 영향은 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §12에 있습니다.

```bash
# Phase 0 — 코드 작성 전 필수
pnpm verify:coord             # ③ KATEC↔WGS84 왕복 변환 오차 (50m 이내여야 함)
pnpm verify:standard-data     # ② 표준데이터의 좌표·시설 컬럼 + UNI_ID 조인 키
pnpm verify:price-time        # ⑪ 반경검색 응답에 가격 기준시각이 오는가
pnpm verify:upstash           # ⑬ Upstash 무료 티어 일일 명령 수 한도

# Phase 5 — 파라미터 확정 전 (domain + 두 클라이언트가 있어야 실행 가능)
pnpm verify:coverage          # ⑫ 샘플링 커버리지·T2 후보 누락률
pnpm verify:t3-rate           # T3 발동률·게이트 통과율 (노선 3개 × 연료 3종)
pnpm verify:uturn             # ④ 경로 API가 유턴·중앙분리대를 반영하는지
```

> **Phase 0에서 실제 응답을 MSW 픽스처로 함께 저장하십시오.** 검증과 테스트 자산 구축을 한 번에 끝내면 오피넷 예산을 아낍니다.

> `verify:t3-rate`와 `verify:coverage`는 오피넷을 대량 호출합니다. 실행 전 예상 호출 수를 출력하고 확인을 받도록 구현하십시오. **하루 300회 예산을 개발 검증이 잠식하면 운영에 남는 게 없습니다.** dev 예산(기본 20회) 안에서 돌리십시오.

---

## 환경변수

`.env.local`에 설정합니다. **서버 전용 키에 `NEXT_PUBLIC_` 접두사를 붙이지 마십시오.**

| 변수                        | 필수 | 설명                                                                                                                                                                                                          |
| --------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPINET_CERT_KEY`           | ✅   | 오피넷 오픈 API 인증키. **서버 전용**                                                                                                                                                                         |
| `KAKAO_REST_API_KEY`        | ✅   | 카카오 REST 키 (모빌리티 길찾기 · 로컬 검색). **서버 전용**                                                                                                                                                   |
| `NEXT_PUBLIC_KAKAO_JS_KEY`  | ✅   | 카카오맵 JS SDK 키. 클라이언트 노출되므로 **개발자 콘솔에서 도메인 제한 필수**                                                                                                                                |
| `DATABASE_URL`              | ✅   | Neon 연결 문자열. 런타임은 HTTP 드라이버, 배치 스크립트는 TCP로 접속                                                                                                                                          |
| `UPSTASH_REDIS_REST_URL`    | ✅   | Upstash REST 엔드포인트                                                                                                                                                                                       |
| `UPSTASH_REDIS_REST_TOKEN`  | ✅   | Upstash REST 토큰. **서버 전용**                                                                                                                                                                              |
| `APP_BASE_URL`              | ✅   | 배포 URL. 딥링크 폴백·OG 태그에 사용                                                                                                                                                                          |
| `CRON_SECRET`               | ✅   | 배치 엔드포인트(`/api/cron/*`) 인증 토큰                                                                                                                                                                      |
| `REDIS_KEY_PREFIX`          | ✅   | Redis 키 접두사. `dev` / `prod` 로 환경 분리                                                                                                                                                                  |
| `FEATURE_EXPANSION_ENABLED` | —    | 확장 수집(STEP 6) 온·오프. **오피넷 일일 한도 확인 전까지 `false`**                                                                                                                                           |
| `OPINET_DAILY_BUDGET`       | —    | 오피넷 일일 호출 상한 (기본 `280`). **오피넷 확인 한도가 하루 300회**이므로 안전 여유를 두고 낮게 잡습니다. 초과 시 확장 수집을 건너뜀 — 용량 분석은 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §5.3.1 |
| `OPINET_CONCURRENCY`        | —    | 오피넷 동시 호출 수 (기본 `8`)                                                                                                                                                                                |
| `CACHE_BYPASS`              | —    | 디버깅용 캐시 우회. 기본 `false`. 운영에서 켜지 마십시오                                                                                                                                                      |

### 키 발급

| 키     | 발급처                                                                         | 주의                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 오피넷 | [opinet.co.kr 오픈 API](https://www.opinet.co.kr/user/custapi/openApiIntro.do) | **일일 호출 한도 확인됨: 300회.** 상업적 이용은 사전 협의 필요 (052-216-2514)                                                               |
| 카카오 | [developers.kakao.com](https://developers.kakao.com)                           | 2026-07-21부터 무료 쿼터는 **계정에서 첫 번째로 활성화한 앱 하나**에만 제공. **앱을 새로 만들지 마십시오** — dev·prod가 같은 앱 키를 씁니다 |

---

## 개발 시작하기

1. [`AGENTS.md`](AGENTS.md)를 읽습니다. **먼저 읽으십시오.** 임의로 바꾸면 안 되는 것들이 정리되어 있습니다.
2. [`docs/PRODUCT.md`](docs/PRODUCT.md)에서 만들 기능의 정의와 계산식을 확인합니다.
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)에서 어느 모듈에 코드를 둘지 확인합니다.
4. `ARCHITECTURE.md` §10의 **권장 개발 순서**를 따릅니다.

### 개발 순서 (요약)

주차가 아니라 **의존성**으로 끊었습니다. 각 Phase의 목적·선행 조건·완료 기준은 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §10에 있습니다.

```
Phase 0   사전 검증 + 픽스처 저장          ← 코드보다 먼저
Phase 1   초기화 + 규칙 집행 장치(린트·CI)  ← 울타리를 먼저 친다
Phase 2   domain 순수 계산 + 단위 테스트   ★ 제품 신뢰도의 근간
Phase 3   infra — 오피넷 (KATEC·예산·캐시)
Phase 4   infra — 카카오 (경로·장소)
Phase 5   실측 → 파라미터 확정            ★ 파이프라인보다 먼저
Phase 6   DB + 마스터 구축                  시설 필터 N+1 제거
Phase 7   services 파이프라인 (STEP 1~11)
Phase 8   API 계층 (SSE + JSON 폴백)
Phase 9   프론트 핵심 흐름
Phase 10  딥링크 + 실기기 매트릭스
Phase 11  내 주변 + 익명 이벤트 로깅
Phase 12  예외 전수 + 배포
```

**Phase 2를 건너뛰지 마십시오.** `d_perp`와 `NetSaving`이 틀리면 나머지가 전부 무의미합니다.

**모든 Phase의 공통 완료 기준: 코드 + 해당 테스트 + 문서 갱신.** 셋 중 하나라도 빠지면 그 단계는 끝난 게 아닙니다.

---

## 문서

| 문서                                           | 언제 보는가                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                       | 코드를 쓰기 전에. 규칙·금지사항·불변식                                 |
| [`docs/PRODUCT.md`](docs/PRODUCT.md)           | 무엇을 만드는지 알아야 할 때. 기능·도메인 규칙·계산식·파라미터         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 어떻게 만드는지 알아야 할 때. 구조·모듈·API Contract·DB·외부 연동·배포 |

같은 정보를 여러 문서에 중복해서 쓰지 않습니다. 찾는 정보가 없으면 [`AGENTS.md`](AGENTS.md) §11을 따르십시오.

---

## 알려진 제약

개발 판단에 직접 영향을 주는 것만 옮깁니다. **전체 목록과 근거는 [`docs/PRODUCT.md`](docs/PRODUCT.md) §5.2·§6.3과 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §5에 있습니다.**

- **오피넷 가격은 실시간이 아닙니다** — 하루 6회 갱신. 화면에 기준시각을 상시 표시해야 합니다
- **오피넷 반경 검색은 최대 5km** — 넓은 밴드를 덮으려면 여러 지점에서 반복 검색
- **24시간 영업·셀프 여부는 공개 데이터에 없습니다** — 해당 필터를 제공하지 않습니다
- **티맵은 딥링크로 경유지를 전달할 수 없습니다** — 주유소를 목적지로 넘기는 폴백
- **오피넷 상업적 이용은 한국석유공사 사전 협의가 필요합니다** — 광고를 붙이기 전에 문의

> ⚠️ **Phase 0에서 끝내야 하는 확인 항목이 4개 남아 있습니다** — 표준데이터 조인 키(②) / 좌표 변환 정확도(③) / 가격 기준시각 취득 경로(⑪) / Upstash 명령 수 한도(⑬). 전체 목록과 실패 시 영향은 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §12에 있습니다.
>
> 오피넷 일일 한도(①)와 Vercel 함수 실행 시간(⑥)은 **해결되었습니다.**
