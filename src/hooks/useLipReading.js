import { useEffect } from "react";
import { LIPREADING_WS_URL } from "../constants/api";

// 마운트 시 WebSocket 연결을 열고 페이지를 나갈 때까지 유지.
// Python이 프레임을 축적한 후 STT 수신 시점에 추론하므로,
// 마이크 버튼과 독립적으로 항상 스트리밍해야 한다.
export const useLipReading = () => {
  useEffect(() => {
    let ws, interval, stream;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });

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
      clearInterval(interval);
      ws?.close();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
};
