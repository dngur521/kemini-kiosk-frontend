import { useRef, useState } from "react";
import { WS_URL } from "../constants/api";

export const useVoiceOrder = (onSystemMessage) => {
  const [status, setStatus] = useState("Disconnected");
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeakingUI, setIsSpeakingUI] = useState(false);

  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const isSpeakingRef = useRef(false);

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.onstart = () => {
      isSpeakingRef.current = true;
      setIsSpeakingUI(true);
    };
    utterance.onend = () => {
      setTimeout(() => {
        if (!window.speechSynthesis.speaking) {
          isSpeakingRef.current = false;
          setIsSpeakingUI(false);
        }
      }, 1500);
    };
    window.speechSynthesis.speak(utterance);
  };

  const connect = () => {
    socketRef.current = new WebSocket(WS_URL);
    socketRef.current.onopen = () => setStatus("Connected");
    socketRef.current.onmessage = (event) => {
      const message = event.data;
      if (!message.startsWith("SYSTEM:") && isSpeakingRef.current) return;

      if (message.startsWith("SYSTEM:")) {
        onSystemMessage(message, speak); // 부모 컴포넌트의 처리 로직 실행
      } else {
        setTranscript(message);
      }
    };
  };

  const startRecording = async () => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    streamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    audioContextRef.current = new (
      window.AudioContext || window.webkitAudioContext
    )({ sampleRate: 16000 });
    const source = audioContextRef.current.createMediaStreamSource(
      streamRef.current,
    );
    await audioContextRef.current.audioWorklet.addModule("/AudioProcessor.js");
    const workletNode = new AudioWorkletNode(
      audioContextRef.current,
      "audio-processor",
    );
    workletNode.port.onmessage = (e) => {
      if (
        socketRef.current.readyState === WebSocket.OPEN &&
        !isSpeakingRef.current
      ) {
        socketRef.current.send(e.data);
      }
    };
    source.connect(workletNode);
    workletNode.connect(audioContextRef.current.destination);
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (audioContextRef.current) audioContextRef.current.close();
    setIsRecording(false);
  };

  return {
    status,
    transcript,
    isRecording,
    isSpeakingUI,
    connect,
    startRecording,
    stopRecording,
    setTranscript,
    speak,
  };
};
