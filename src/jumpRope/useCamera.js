import { useState, useEffect, useCallback } from "react";
import { useGameStore } from "../store";

export function useCamera(enabled = true) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const setCameraStream = useGameStore((state) => state.setCameraStream);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      setCameraStream(stream);
      setIsReady(true);
      setError(null);
    } catch (err) {
      const message =
        err.name === "NotAllowedError"
          ? "摄像头权限被拒绝"
          : err.name === "NotFoundError"
          ? "未检测到摄像头"
          : `摄像头错误: ${err.message}`;
      setError(message);
      console.error("Camera error:", err);
    }
  }, [setCameraStream]);

  const stopCamera = useCallback(() => {
    const stream = useGameStore.getState().cameraStream;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    setCameraStream(null);
    setIsReady(false);
  }, [setCameraStream]);

  useEffect(() => {
    if (enabled) {
      startCamera();
    }
    return () => stopCamera();
  }, [enabled, startCamera, stopCamera]);

  return { isReady, error };
}
