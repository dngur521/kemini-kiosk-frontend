import { useCallback, useEffect, useRef, useState } from "react";

// MediaPipe Face Mesh iris landmark indices (refineLandmarks: true 옵션 필요)
const LEFT_IRIS = 468;
const RIGHT_IRIS = 473;

// 패턴별 임계값
const WANDER_WINDOW = 1000;       // 방황 판정 시간 윈도우 (ms)
const WANDER_SAMPLE_MS = 100;     // 방황 판정용 샘플 간격 (100ms → 1초에 10개 포인트)
const WANDER_THRESHOLD = 0.2;     // 1초 내 누적 이동거리 (정규화 좌표, 샘플링 기준)
const DEVIATION_SCREEN_X = 0.65;  // 리매핑된 화면 좌표 기준 장바구니 경계 (완화)
const DEVIATION_DURATION = 1500;  // 이탈(장바구니 응시) 지속시간 (ms)
const FIXED_RADIUS = 0.10;        // 고정 판정 반경
const FIXED_DURATION = 2000;      // 고정 지속시간 (ms)
const COOLDOWN = 5000;            // 동일 패턴 재감지 쿨다운 (10s → 5s)

// EMA 스무싱 계수 (0에 가까울수록 부드러움, 반응 느림)
const SMOOTH_ALPHA = 0.2;

// 홍채 좌표 → 화면 좌표 리매핑
// MediaPipe 홍채 x는 화면 정면 응시 시 대략 0.38~0.62 범위만 움직임 (1:1 매핑 불가)
const IRIS_X_MIN = 0.38, IRIS_X_MAX = 0.62;
const IRIS_Y_MIN = 0.33, IRIS_Y_MAX = 0.67;

const remapToScreen = (ix, iy) => ({
  x: Math.max(0, Math.min(1, (ix - IRIS_X_MIN) / (IRIS_X_MAX - IRIS_X_MIN))),
  y: Math.max(0, Math.min(1, (iy - IRIS_Y_MIN) / (IRIS_Y_MAX - IRIS_Y_MIN))),
});

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.crossOrigin = "anonymous";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

/**
 * MediaPipe Face Mesh 기반 아이트래킹 훅
 * @param {() => boolean} isAnyModalOpen - 모달 열림 여부 반환 함수 (감지 일시정지용)
 */
export const useEyeTracking = (isAnyModalOpen) => {
  const [isActive, setIsActive] = useState(false);
  const [detectedPattern, setDetectedPattern] = useState(null); // 'wandering' | 'deviation' | 'fixed'
  const [fixedGazePos, setFixedGazePos] = useState(null); // { x, y } 정규화 좌표

  const videoRef = useRef(null);
  const faceMeshRef = useRef(null);
  const animFrameRef = useRef(null);
  const isActiveRef = useRef(false);
  const processingRef = useRef(false); // send() 중복 호출 방지
  const isAnyModalOpenRef = useRef(isAnyModalOpen);

  // 패턴 감지 상태 (ref로 관리 — 렌더링 불필요)
  const smoothedRef = useRef({ x: 0.5, y: 0.5 }); // EMA 스무싱 누적값
  const historyRef = useRef([]);                    // 방황 감지용 샘플 이력 { x, y, t }[]
  const lastSampleTimeRef = useRef(0);             // 마지막 샘플 기록 시각
  const deviationStartRef = useRef(null);          // 이탈 시작 타임스탬프
  const fixedAnchorRef = useRef(null);    // 고정 기준점 { x, y }
  const fixedStartRef = useRef(null);     // 고정 시작 타임스탬프
  const cooldownRef = useRef({ wandering: 0, deviation: 0, fixed: 0 });

  useEffect(() => {
    isAnyModalOpenRef.current = isAnyModalOpen;
  });

  const onResults = useCallback((results) => {
    processingRef.current = false;
    if (!isActiveRef.current) return;
    if (!results.multiFaceLandmarks?.length) return;

    const lm = results.multiFaceLandmarks[0];
    const rawX = (lm[LEFT_IRIS].x + lm[RIGHT_IRIS].x) / 2;
    const rawY = (lm[LEFT_IRIS].y + lm[RIGHT_IRIS].y) / 2;
    // 셀피 카메라 좌우 반전 보정
    const rawMirX = 1 - rawX;

    // EMA 스무싱으로 프레임 간 노이즈 제거
    const sx = smoothedRef.current.x * (1 - SMOOTH_ALPHA) + rawMirX * SMOOTH_ALPHA;
    const sy = smoothedRef.current.y * (1 - SMOOTH_ALPHA) + rawY * SMOOTH_ALPHA;
    smoothedRef.current = { x: sx, y: sy };

    if (isAnyModalOpenRef.current()) return;

    // 홍채 좌표 → 화면 좌표 리매핑 (이탈 판정 및 메뉴 탐지에 사용)
    const screenPos = remapToScreen(sx, sy);

    const now = Date.now();

    // 방황 판정: 100ms 간격 샘플, 스무싱된 홍채 좌표 사용
    if (now - lastSampleTimeRef.current >= WANDER_SAMPLE_MS) {
      lastSampleTimeRef.current = now;
      const history = historyRef.current;
      history.push({ x: sx, y: sy, t: now });
      historyRef.current = history.filter((p) => now - p.t <= 2000);
    }

    // --- 우선순위 1: 방황 감지 ---
    const windowPts = historyRef.current.filter((p) => now - p.t <= WANDER_WINDOW);
    if (windowPts.length >= 2) {
      let dist = 0;
      for (let i = 1; i < windowPts.length; i++) {
        const dx = windowPts[i].x - windowPts[i - 1].x;
        const dy = windowPts[i].y - windowPts[i - 1].y;
        dist += Math.sqrt(dx * dx + dy * dy);
      }
      if (dist > WANDER_THRESHOLD && now - cooldownRef.current.wandering > COOLDOWN) {
        cooldownRef.current.wandering = now;
        deviationStartRef.current = null;
        fixedAnchorRef.current = null;
        setDetectedPattern("wandering");
        return;
      }
    }

    // --- 우선순위 2: 이탈(장바구니 영역) 감지 ---
    // 리매핑된 화면 x 기준으로 판정 (기존 동적 계산 대비 실제 홍채 범위에 맞춤)
    if (screenPos.x > DEVIATION_SCREEN_X) {
      if (!deviationStartRef.current) {
        deviationStartRef.current = now;
      } else if (
        now - deviationStartRef.current >= DEVIATION_DURATION &&
        now - cooldownRef.current.deviation > COOLDOWN
      ) {
        cooldownRef.current.deviation = now;
        deviationStartRef.current = null;
        fixedAnchorRef.current = null;
        setDetectedPattern("deviation");
        return;
      }
    } else {
      deviationStartRef.current = null;
    }

    // --- 우선순위 3: 고정 시선 감지 ---
    // 앵커는 스무싱된 홍채 좌표로 추적, 저장은 리매핑된 화면 좌표로
    if (!fixedAnchorRef.current) {
      fixedAnchorRef.current = { x: sx, y: sy };
      fixedStartRef.current = now;
    } else {
      const dx = sx - fixedAnchorRef.current.x;
      const dy = sy - fixedAnchorRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > FIXED_RADIUS) {
        fixedAnchorRef.current = { x: sx, y: sy };
        fixedStartRef.current = now;
      } else if (
        now - fixedStartRef.current >= FIXED_DURATION &&
        now - cooldownRef.current.fixed > COOLDOWN
      ) {
        cooldownRef.current.fixed = now;
        fixedAnchorRef.current = null;
        fixedStartRef.current = null;
        // elementFromPoint에 바로 쓸 수 있도록 화면 좌표로 저장
        setFixedGazePos(screenPos);
        setDetectedPattern("fixed");
      }
    }
  }, []);

  // frameLoop이 자기 자신을 참조하므로 ref로 관리
  const frameLoopRef = useRef(null);
  useEffect(() => {
    frameLoopRef.current = async () => {
      if (!isActiveRef.current) return;
      if (!processingRef.current && videoRef.current?.readyState >= 2) {
        processingRef.current = true;
        try {
          await faceMeshRef.current.send({ image: videoRef.current });
        } catch {
          processingRef.current = false;
        }
      }
      animFrameRef.current = requestAnimationFrame(frameLoopRef.current);
    };
  }, []);

  const toggleEyeTracking = useCallback(async () => {
    const next = !isActiveRef.current;
    isActiveRef.current = next;
    setIsActive(next);

    if (next) {
      // FaceMesh 지연 초기화 (처음 켤 때만)
      if (!faceMeshRef.current) {
        if (!window.FaceMesh) {
          await loadScript(
            "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js",
          );
        }
        const fm = new window.FaceMesh({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });
        fm.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true, // 홍채 랜드마크(468~477) 활성화
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        fm.onResults(onResults);
        faceMeshRef.current = fm;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      animFrameRef.current = requestAnimationFrame(frameLoopRef.current);
    } else {
      cancelAnimationFrame(animFrameRef.current);
      videoRef.current?.srcObject?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      // 감지 상태 초기화
      smoothedRef.current = { x: 0.5, y: 0.5 };
      historyRef.current = [];
      lastSampleTimeRef.current = 0;
      deviationStartRef.current = null;
      fixedAnchorRef.current = null;
      fixedStartRef.current = null;
    }
  }, [onResults]);

  const clearPattern = useCallback(() => {
    setDetectedPattern(null);
    setFixedGazePos(null);
  }, []);

  // 숨겨진 비디오 엘리먼트 생성 (마운트 시 1회)
  useEffect(() => {
    const video = document.createElement("video");
    video.style.cssText =
      "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;top:0;left:0;";
    document.body.appendChild(video);
    videoRef.current = video;
    return () => {
      isActiveRef.current = false;
      cancelAnimationFrame(animFrameRef.current);
      video.srcObject?.getTracks().forEach((t) => t.stop());
      document.body.removeChild(video);
    };
  }, []);

  return { isActive, detectedPattern, fixedGazePos, toggleEyeTracking, clearPattern };
};
