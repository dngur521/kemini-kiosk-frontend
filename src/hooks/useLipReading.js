import { useEffect } from "react";
import { LIPREADING_WS_URL } from "../constants/api";

// 마운트 시 WebSocket 연결을 열고 페이지 종료까지 유지.
// 타이밍 제어(어느 프레임을 추론에 쓸지)는 Spring Boot 원형 버퍼가 담당하므로
// React는 항상 전송만 하면 된다.
export const useLipReading = () => {
  useEffect(() => {
    let ws, interval, stream;
    let cancelled = false; // StrictMode 이중 마운트 대응

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const video = document.createElement("video");
        video.srcObject = stream;
        await video.play();

        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext("2d");

        ws = new WebSocket(LIPREADING_WS_URL);

        ws.onopen = () => {
          interval = setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN) return;
            ctx.drawImage(video, 0, 0, 320, 240);
            canvas.toBlob((blob) => blob && ws.send(blob), "image/jpeg", 0.7);
          }, 67); // ~15fps
        };

        ws.onerror = (e) => console.error("립리딩 WS 오류:", e);
      } catch (e) {
        console.error("카메라 스트림 시작 실패:", e);
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(interval);
      ws?.close();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
};
