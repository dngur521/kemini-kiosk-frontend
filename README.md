# KEMINI Cafe Kiosk — Frontend

음성 주문 기반 카페 키오스크 프론트엔드입니다. 사용자가 말한 주문을 실시간으로 인식하고, 장바구니에 담아 결제까지 처리합니다.

## 기술 스택

- **React 19** + **Vite**
- **WebSocket** — 음성 데이터 스트리밍, 주문 결과 수신, 카메라 프레임 전송
- **Web Audio API + AudioWorklet** — 마이크 오디오를 16kHz LINEAR16 PCM으로 변환
- **Web Speech Synthesis API** — TTS 안내 음성
- **MediaDevices API** — 립리딩용 카메라 프레임 캡처 (320×240 JPEG, ~15fps)
- **MediaPipe Face Mesh** — 아이트래킹 시선 패턴 감지 (토글 방식)

## 시작하기

```bash
npm install
npm run dev
```

| 명령어 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 실행 (HMR) |
| `npm run build` | 프로덕션 빌드 |
| `npm run preview` | 빌드 결과물 로컬 미리보기 |
| `npm run lint` | ESLint 실행 |

## 주요 기능

- **음성 주문** — 마이크 버튼을 누르고 말하면 실시간 STT 결과가 화면에 표시됨
- **립리딩 보조 인식** — STT 신뢰도가 낮으면 카메라 프레임을 분석해 메뉴 매칭 정확도 보완
- **아이트래킹** — 시선 패턴(방황·이탈·고정)을 감지해 맥락에 맞는 음성 안내 제공
- **주문 큐 처리** — 백엔드에서 받은 여러 주문을 순차적으로 처리
- **모호한 주문 처리** — 인식 불확실 시 유사 메뉴 추천(SIMILAR), 인기 메뉴 추천(TOP3), 의도 확인(CONFIRM) 모달 표시
- **하이브리드 추천** — 학습된 매칭 결과를 사용자가 거부하면 AI 시맨틱 검색으로 재시도
- **장바구니 & 결제** — 담기/취소/전체 비우기 및 결제 완료 처리

## 백엔드 연동

```
REST API       : https://kemini-kiosk-api.duckdns.org/api
음성 WebSocket : wss://kemini-kiosk-api.duckdns.org/ws/voice
립리딩 WebSocket: wss://kemini-kiosk-api.duckdns.org/ws/lipreading
```

음성 WebSocket 메시지 프로토콜:
- 클라이언트 → 서버: 16kHz LINEAR16 PCM 바이너리 프레임
- 서버 → 클라이언트 (텍스트): 실시간 STT 문자열
- 서버 → 클라이언트 (`SYSTEM:SESSION_ID:<id>`): 세션 ID 전달
- 서버 → 클라이언트 (`SYSTEM:PROCESS_ORDERS:<json>`): 처리된 주문 배열 전달
- 서버 → 클라이언트 (`SYSTEM:CONFIRM_ORDER:<json>`): 주문 확인 모달 표시 (수락 시 `POST /api/cart/{sessionId}`, 거절 시 AI 추천)
- 서버 → 클라이언트 (`SYSTEM:LIPREADING_ANALYZING`): 립리딩 분석 중 (스피너 표시)
- 서버 → 클라이언트 (`SYSTEM:LIPREADING_MATCH:<id>:<name>:<score>`): 립리딩 결과 + 로컬 장바구니 업데이트
- 서버 → 클라이언트 (`SYSTEM:LIPREADING_CANDIDATES:<json>`): 립리딩 후보 선택 모달 (`{id,name,score,quantity}[]`)
- 서버 → 클라이언트 (`SYSTEM:LIPREADING_FAILED`): 립리딩 실패 알림
- 서버 → 클라이언트 (`SYSTEM:AI_CANDIDATES:<json>`): AI 의미 검색 후보 선택 모달 (`{id,name,quantity}[]`)

립리딩 WebSocket: 클라이언트 → 서버로 320×240 JPEG 프레임을 ~15fps로 상시 전송

## 프로젝트 구조

```
src/
├── App.jsx                  # 루트 컴포넌트 — 주문 큐, 모달 조율, 립리딩 메시지 처리
├── hooks/
│   ├── useVoiceOrder.js     # WebSocket, 녹음, TTS
│   ├── useKioskLogic.js     # 장바구니, 메뉴/카테고리 데이터, 결제
│   ├── useLipReading.js     # 카메라 프레임 → /ws/lipreading 상시 스트리밍
│   └── useEyeTracking.js    # MediaPipe 시선 추적 (wandering/deviation/fixed 패턴)
├── components/
│   ├── FallbackModal.jsx    # 추천/확인 모달 (CONFIRM / SIMILAR / TOP3 / LIPREADING_CANDIDATES / AI_CANDIDATES / CONFIRM_ORDER)
│   ├── QuantityModal.jsx    # 수량 입력 모달
│   └── PaymentSuccessModal.jsx
├── api/
│   └── kioskApi.js          # REST API 호출 (메뉴/카테고리/통계/학습/AI추천)
└── constants/
    ├── api.js               # BASE_URL, WS_URL, LIPREADING_WS_URL (gitignored)
    └── api_.js              # 위 파일의 템플릿 (커밋됨)

public/
└── AudioProcessor.js        # AudioWorkletProcessor (Float32 → Int16 변환)
```
