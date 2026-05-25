claude --resume 7da453fa-b04f-4407-92e1-3a13225d52da

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals (이 프로젝트엔 테스트 환경이 없으므로, 브라우저 동작으로 검증):

- "버그 수정" → "재현 조건을 명시하고, `npm run dev`로 실행해 동작 확인"
- "UI 변경" → "dev 서버에서 해당 화면을 직접 열어 렌더링 확인"
- "리팩토링" → "변경 전후 음성 주문 흐름(WebSocket → 큐 → 모달)이 동일하게 동작하는지 확인"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Commands

```bash
npm run dev      # Start dev server (Vite HMR)
npm run build    # Production build
npm run lint     # Run ESLint
npm run preview  # Preview production build locally
```

No test suite is configured.

## Architecture Overview

**KEMINI Cafe Kiosk** — a voice-driven React kiosk UI. Users speak their orders; audio is streamed over WebSocket to a backend that returns structured order data. The frontend processes these orders, handles ambiguity via modals, and manages a cart.

### Backend communication

All URLs are defined in `src/constants/api.js` (gitignored — copy from `api_.js` template):

- `BASE_URL` → `https://kemini-kiosk-api.duckdns.org/api`
- `WS_URL` → `wss://kemini-kiosk-api.duckdns.org/ws/voice`
- `LIPREADING_WS_URL` → `wss://kemini-kiosk-api.duckdns.org/ws/lipreading`

WebSocket messages from the server (`WS_URL`):

- Plain text (live STT transcript) → displayed in the voice bar
- `SYSTEM:SESSION_ID:<id>` → stores the session ID
- `SYSTEM:PROCESS_ORDERS:<json>` → triggers the order processing queue (직접 매칭 + confidence ≥ 0.6)
- `SYSTEM:CONFIRM_ORDER:<json>` → 시노님 별칭 매칭; shows confirm modal; on accept calls `POST /api/cart/{sessionId}` per item; on reject calls AI recommend
- `SYSTEM:AI_CANDIDATES:<json>` → NLP 실패 + AI 추천 있음; 🔍 candidate selection modal (`{id,name,quantity}[]`)
- `SYSTEM:POPULAR_MENUS:<json>` → NLP·AI 모두 실패; 🔥 TOP3 인기 메뉴 모달 (`{id,name,price,imageUrl}[]`, 항상 3개)
- `SYSTEM:LIPREADING_ANALYZING` → **[비활성]** spinner toast
- `SYSTEM:LIPREADING_MATCH:<menuId>:<menuName>:<score>` → **[비활성]** result toast + cart update
- `SYSTEM:LIPREADING_CANDIDATES:<json>` → **[비활성]** 👄 candidate modal (`{id,name,score,quantity}[]`)
- `SYSTEM:LIPREADING_FAILED` → **[비활성]** orange failure toast + TTS

**STT 분기 흐름:**
```
STT 인식 완료
  ├─ 시노님 매칭          → SYSTEM:CONFIRM_ORDER
  ├─ 직접 매칭 (고신뢰도) → SYSTEM:PROCESS_ORDERS
  ├─ AI 추천 있음         → SYSTEM:AI_CANDIDATES
  └─ 전부 실패            → SYSTEM:POPULAR_MENUS
```

### Order processing flow (App.jsx)

Incoming orders arrive as a JSON array via `SYSTEM:PROCESS_ORDERS:`. Each order is queued and processed sequentially by `processNextOrder`. Each item branches into one of four paths:

| Condition                                  | Action                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `order.unknown === true`                   | Show `FallbackModal` (SIMILAR or TOP3)                                     |
| `order.learnedMatch === true` (non-cancel) | Show `FallbackModal` (CONFIRM) — hybrid match confirmation                 |
| `order.quantity === 0` (non-cancel)        | Show `QuantityModal` — ask user for quantity                               |
| Default                                    | Immediately call `handleImmediateOrderUpdate` and recurse to next in queue |

After any modal interaction completes, the queue resumes via `processNextOrder`.

### Key files

| File                                     | Purpose                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/App.jsx`                            | Root component — owns order queue, modal state wiring, and all inter-hook coordination                                     |
| `src/hooks/useVoiceOrder.js`             | WebSocket + Web Audio API + Web Speech Synthesis; handles recording, streaming, TTS                                        |
| `src/hooks/useKioskLogic.js`             | Cart state, category/menu data loading, payment                                                                            |
| `src/hooks/useLipReading.js`             | Camera frame streaming to `/ws/lipreading` at ~15fps (always-on, Spring Boot manages timing via circular buffer)           |
| `src/hooks/useEyeTracking.js`            | MediaPipe Face Mesh 기반 시선 추적 — wandering / deviation / fixed 패턴 감지, 토글 방식                                    |
| `src/api/kioskApi.js`                    | REST API calls: categories, menus, TOP3 stats, category TOP3, learning (`postLearning`), AI recommend (`fetchAiRecommend`), cart add (`postCart`) |
| `src/components/FallbackModal.jsx`       | Multi-mode modal (CONFIRM / SIMILAR / TOP3 / LIPREADING_CANDIDATES / AI_CANDIDATES / CONFIRM_ORDER)                        |
| `src/components/QuantityModal.jsx`       | Shown when order has quantity=0; lets user pick a count                                                                    |
| `src/components/PaymentSuccessModal.jsx` | Post-payment confirmation with order number                                                                                |
| `public/AudioProcessor.js`               | `AudioWorkletProcessor` — converts Float32 mic audio to LINEAR16 PCM before sending over WebSocket                         |

### Voice recording details

`useVoiceOrder` captures mic audio at 16kHz via `AudioWorkletNode`, converts it to Int16 PCM via `public/AudioProcessor.js`, and sends raw binary frames over the WebSocket. Sending is suppressed while TTS is speaking (`isSpeakingRef`) or while any modal is open (`isAnyModalOpenRef`).

### Cart data model

Cart items stored in `cartItems` state (array):

```js
{
  (menuId, menuName, quantity, price);
}
```

`updateCartItems(menu, qty)` is the single write path — positive qty adds, negative decrements, items at 0 are removed. `handleCancel(menuName, qty | "ALL")` is used for voice-cancel paths.

### Hybrid recommendation ("learnedMatch")

When the backend returns `learnedMatch: true`, a CONFIRM modal asks "Is this the right menu?" If the user rejects, `handleConfirmReject` calls `/api/ai/recommend` with the original transcript for a semantic re-search, falling back to `/api/statistics/top3?categoryName=...` if AI returns nothing.

### Lip-reading flow (현재 비활성화)

**현재 상태:** 립리딩 코드는 주석처리되어 있음. 카메라 스트리밍 없이 동작하며, LIPREADING_* 메시지는 무시됨.

**복구 방법:**
1. `src/hooks/useLipReading.js` — 파일 하단의 빈 훅(`export const useLipReading = () => {};`)을 제거하고, 위쪽 주석 블록 전체 해제
2. `src/App.jsx` — `[립리딩 비활성화]` 주석이 붙은 4곳 해제:
   - `isLipReadingAnalyzing` / `lipReadingMatch` / `lipReadingFailed` state 3개
   - `SYSTEM:LIPREADING_ANALYZING` 핸들러
   - `SYSTEM:LIPREADING_CANDIDATES` 핸들러
   - `SYSTEM:LIPREADING_MATCH` 핸들러
   - `SYSTEM:LIPREADING_FAILED` 핸들러
   - JSX 토스트 3개 (isLipReadingAnalyzing / lipReadingMatch / lipReadingFailed)

**원래 동작:** `useLipReading`이 마운트 시 카메라를 열고 `/ws/lipreading`으로 320×240 JPEG를 ~15fps 상시 전송. Spring Boot 원형 버퍼 → STT confidence < 0.8이면 Python 비전 서버로 플러시.

`handleSystemMessage`가 처리하는 전체 메시지 (현재 LIPREADING_* 4개는 주석):

| Message | 상태 | Behavior |
| ------- | ---- | -------- |
| `SYSTEM:LIPREADING_ANALYZING` | **비활성** | spinner toast |
| `SYSTEM:LIPREADING_MATCH:…` | **비활성** | result toast + TTS + local cart update |
| `SYSTEM:LIPREADING_CANDIDATES:…` | **비활성** | 👄 candidate modal |
| `SYSTEM:LIPREADING_FAILED` | **비활성** | orange failure toast + TTS |
| `SYSTEM:AI_CANDIDATES:…` | 활성 | 🔍 candidate modal; on select calls `postCart` |
| `SYSTEM:CONFIRM_ORDER:…` | 활성 | confirm modal; on accept calls `postCart` per item |

**Stale closure 대응:** `updateCartItemsRef = useRef(null)` 로 `logic.updateCartItems` 최신값 유지 (매 렌더 `useEffect`로 갱신). `speakRef`·`menusRef`도 동일 패턴.

**StrictMode note**: The async `getUserMedia` in `useLipReading` uses a `cancelled` flag to prevent double-stream initialization in React dev mode.

### Learning API

When the user selects from a SIMILAR recommendation, the original transcript (`learningText`) is POSTed to `/api/learning` with the chosen `menuId` and the session ID (`X-Session-ID` header) to improve future recognition.

## Commit Message Convention

Format: `{emoji} {type}: {description (한국어, 한 줄)`

| Type       | Emoji | 용도                     |
| ---------- | ----- | ------------------------ |
| `feat`     | ✨    | 새 기능                  |
| `fix`      | 🐛    | 버그 수정                |
| `docs`     | 📝    | 문서 작성·수정           |
| `refactor` | ♻️    | 기능 변경 없는 코드 개선 |
| `chore`    | 🔧    | 빌드·설정·의존성 변경    |

Example: `✨ feat: 음성 주문 취소 기능 추가`
