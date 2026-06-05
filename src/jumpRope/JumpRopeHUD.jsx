import { useGameStore } from "../store";
import "./index.css";
import { useEffect, useRef } from "react";
import { poseVideoRef } from "./poseVideoRef";

export function JumpRopeHUD() {
  const gameMode = useGameStore((state) => state.gameMode);
  const jumpRope = useGameStore((state) => state.jumpRope);
  const speed = useGameStore((state) => state.speed);
  const isBoosting = useGameStore((state) => state.isBoosting);
  const cameraStream = useGameStore((state) => state.cameraStream);
  const videoRef = useRef(null);

  // Attach stream to video and share ref for pose detection
  useEffect(() => {
    const video = videoRef.current;
    if (video && cameraStream) {
      video.srcObject = cameraStream;
      video.play().catch(() => {});
      poseVideoRef.current = video;
    }
  }, [cameraStream]);

  if (!gameMode) return null;

  const { jumpCount, cadence, bodyLean, detectionActive, cameraReady } = jumpRope;

  // Speed percentage for gauge (max display: 30 for normal, 20 for easy)
  const maxDisplaySpeed = gameMode === "easy" ? 20 : 30;
  const speedPercent = speed ? Math.min(speed / maxDisplaySpeed, 1) : 0;

  // Color based on speed
  const speedColor =
    speedPercent < 0.3
      ? "#4caf50"
      : speedPercent < 0.6
      ? "#2196f3"
      : speedPercent < 0.9
      ? "#9c27b0"
      : "#ff9800";

  // Screen glow when boosting
  const glowIntensity = isBoosting ? 0.15 : speedPercent > 0.9 ? 0.08 : 0;

  return (
    <div className="jump-rope-hud">
      {/* Speed edge glow */}
      {glowIntensity > 0 && (
        <div
          className="speed-glow"
          style={{ opacity: glowIntensity }}
        />
      )}

      {/* Status bar */}
      <div className="hud-status-bar">
        {cameraReady ? (
          detectionActive ? (
            <span className="hud-status-ok">● 已检测到人体</span>
          ) : (
            <span className="hud-status-warn">⏳ 正在检测...</span>
          )
        ) : cameraStream ? (
          <span className="hud-status-warn">⏳ 模型加载中...</span>
        ) : (
          <span className="hud-status-warn">⏳ 等待摄像头...</span>
        )}
      </div>

      {/* Top-left: Jump stats */}
      <div className="hud-top-left">
        <div className="hud-jump-count">{jumpCount}</div>
        <div className="hud-label">跳次</div>
        <div className="hud-cadence">
          <span className="hud-cadence-value">{cadence.toFixed(1)}</span>
          <span className="hud-cadence-unit">次/秒</span>
        </div>
      </div>

      {/* Top-right: Speed gauge */}
      <div className="hud-top-right">
        <div className="hud-speed-value" style={{ color: speedColor }}>
          {speed ? Math.round(speed) : 0}
        </div>
        <div className="hud-label">速度</div>
        <div className="hud-speed-bar-track">
          <div
            className="hud-speed-bar-fill"
            style={{
              width: `${speedPercent * 100}%`,
              backgroundColor: speedColor,
            }}
          />
        </div>
        {isBoosting && <div className="hud-boost-indicator">🔥 TURBO</div>}
      </div>

      {/* Bottom-center: Lean indicator */}
      <div className="hud-bottom-center">
        <div className="hud-lean-track">
          <div
            className="hud-lean-dot"
            style={{ left: `${(bodyLean * 0.5 + 0.5) * 100}%` }}
          />
          <div className="hud-lean-center" />
        </div>
        <div className="hud-label">身体倾斜</div>
      </div>

      {/* Bottom-right: Camera PIP */}
      <div className="hud-camera-pip">
        {cameraStream ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="hud-camera-video"
          />
        ) : (
          <div className="hud-camera-placeholder">📷</div>
        )}
      </div>
    </div>
  );
}
