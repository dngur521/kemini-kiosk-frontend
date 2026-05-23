# KEMINI Cafe Kiosk — Frontend

음성 주문 기반 카페 키오스크 프론트엔드입니다. 사용자가 말한 주문을 실시간으로 인식하고, 장바구니에 담아 결제까지 처리합니다.

## 기술 스택

- **React 19** + **Vite**
- **WebSocket** — 음성 데이터 스트리밍 및 주문 결과 수신
- **Web Audio API + AudioWorklet** — 마이크 오디오를 16kHz LINEAR16 PCM으로 변환
- **Web Speech Synthesis API** — TTS 안내 음성

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
- **주문 큐 처리** — 백엔드에서 받은 여러 주문을 순차적으로 처리
- **모호한 주문 처리** — 인식 불확실 시 유사 메뉴 추천(SIMILAR), 인기 메뉴 추천(TOP3), 의도 확인(CONFIRM) 모달 표시
- **하이브리드 추천** — 학습된 매칭 결과를 사용자가 거부하면 AI 시맨틱 검색으로 재시도
- **장바구니 & 결제** — 담기/취소/전체 비우기 및 결제 완료 처리

## 백엔드 연동

```
REST API  : https://kemini-kiosk-api.duckdns.org/api
WebSocket : wss://kemini-kiosk-api.duckdns.org/ws/voice
```

WebSocket 메시지 프로토콜:
- 클라이언트 → 서버: 16kHz LINEAR16 PCM 바이너리 프레임
- 서버 → 클라이언트 (텍스트): 실시간 STT 문자열
- 서버 → 클라이언트 (`SYSTEM:SESSION_ID:<id>`): 세션 ID 전달
- 서버 → 클라이언트 (`SYSTEM:PROCESS_ORDERS:<json>`): 처리된 주문 배열 전달

## 프로젝트 구조

```
src/
├── App.jsx                  # 루트 컴포넌트 — 주문 큐, 모달 조율
├── hooks/
│   ├── useVoiceOrder.js     # WebSocket, 녹음, TTS
│   └── useKioskLogic.js     # 장바구니, 메뉴/카테고리 데이터, 결제
├── components/
│   ├── FallbackModal.jsx    # 추천/확인 모달 (CONFIRM / SIMILAR / TOP3)
│   ├── QuantityModal.jsx    # 수량 입력 모달
│   └── PaymentSuccessModal.jsx
├── api/
│   └── kioskApi.js          # REST API 호출 (메뉴/카테고리/통계/학습/AI추천)
└── constants/
    └── api.js               # BASE_URL, WS_URL

public/
└── AudioProcessor.js        # AudioWorkletProcessor (Float32 → Int16 변환)
```
