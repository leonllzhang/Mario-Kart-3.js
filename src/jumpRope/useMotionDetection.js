import { useEffect, useRef, useCallback } from "react";
import { useGameStore } from "../store";
import { poseVideoRef } from "./poseVideoRef";

// Grid size for motion analysis
const GRID_COLS = 6;
const GRID_ROWS = 8;
const CANVAS_WIDTH = 120;
const CANVAS_HEIGHT = 160;

// Motion thresholds
const MOTION_THRESHOLD = 12; // Minimum pixel change to count as motion
const MIN_MOTION_PIXELS = 0.03; // Fraction of lower grid that must have motion
const JUMP_COOLDOWN_MS = 150; // Minimum ms between jumps
const NO_MOTION_TIMEOUT_FRAMES = 30;

// Smoothing
const SMOOTHING = 0.35;

// Lean dead zone (normalized 0-1)
const LEAN_DEAD_ZONE = 0.08;

export function useMotionDetection({ enabled }) {
  const canvasRef = useRef(null);
  const prevGridRef = useRef(null);
  const frameCountRef = useRef(0);
  const animFrameRef = useRef(null);
  const noMotionFramesRef = useRef(0);

  // Jump state
  const isJumpingUpRef = useRef(false);
  const lastJumpTimeRef = useRef(0);
  const jumpTimestampsRef = useRef([]);
  const jumpCountRef = useRef(0);

  // Smoothed values
  const smoothedCadenceRef = useRef(0);
  const smoothedLeanRef = useRef(0);

  const setJumpRope = useGameStore((state) => state.setJumpRope);

  const getCanvas = useCallback(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
      canvasRef.current.width = CANVAS_WIDTH;
      canvasRef.current.height = CANVAS_HEIGHT;
    }
    return canvasRef.current;
  }, []);

  const detect = useCallback(() => {
    const video = poseVideoRef.current;
    if (!video || !video.readyState || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    const canvas = getCanvas();
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    // Draw video frame at low resolution
    ctx.drawImage(video, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Compute grid cell brightness values
    const cellW = Math.floor(CANVAS_WIDTH / GRID_COLS);
    const cellH = Math.floor(CANVAS_HEIGHT / GRID_ROWS);
    const grid = [];

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        let sum = 0;
        let count = 0;
        for (let y = row * cellH; y < Math.min((row + 1) * cellH, CANVAS_HEIGHT); y++) {
          for (let x = col * cellW; x < Math.min((col + 1) * cellW, CANVAS_WIDTH); x++) {
            const i = (y * CANVAS_WIDTH + x) * 4;
            sum += (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
            count++;
          }
        }
        grid.push(sum / (count || 1));
      }
    }

    frameCountRef.current++;
    const cellsPerRow = GRID_COLS;

    if (prevGridRef.current) {
      // Compute motion per cell
      const motionGrid = grid.map((val, i) => Math.abs(val - prevGridRef.current[i]));

      // Lower body motion (bottom 3 rows = rows 5,6,7)
      let lowerMotionSum = 0;
      let lowerMotionCount = 0;
      let lowerMotionPixels = 0;
      for (let row = 5; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const idx = row * cellsPerRow + col;
          if (motionGrid[idx] > MOTION_THRESHOLD) {
            lowerMotionCount++;
          }
          lowerMotionSum += motionGrid[idx];
        }
      }
      const lowerMotionAvg = lowerMotionSum / (GRID_COLS * 3);
      const lowerMotionRatio = lowerMotionCount / (GRID_COLS * 3);

      // Upper body motion (top 3 rows = rows 0,1,2)
      let upperMotionSum = 0;
      let upperMotionCount = 0;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const idx = row * cellsPerRow + col;
          if (motionGrid[idx] > MOTION_THRESHOLD) {
            upperMotionCount++;
          }
          upperMotionSum += motionGrid[idx];
        }
      }

      // Horizontal balance for lean detection
      let leftMotion = 0;
      let rightMotion = 0;
      const centerCol = GRID_COLS / 2;
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const idx = row * cellsPerRow + col;
          if (col < centerCol) leftMotion += motionGrid[idx];
          else rightMotion += motionGrid[idx];
        }
      }

      // === Jump detection ===
      // Jump = significant lower body motion followed by reduction (bounce)
      const hasLowerMotion = lowerMotionRatio > MIN_MOTION_PIXELS;

      if (hasLowerMotion && !isJumpingUpRef.current) {
        // Start of a jump - motion detected in lower body
        isJumpingUpRef.current = true;
      } else if (!hasLowerMotion && isJumpingUpRef.current) {
        // End of jump - motion subsided
        isJumpingUpRef.current = false;
        const now = performance.now();
        if (now - lastJumpTimeRef.current > JUMP_COOLDOWN_MS) {
          lastJumpTimeRef.current = now;
          jumpCountRef.current++;

          const timestamps = jumpTimestampsRef.current;
          timestamps.push(now);
          while (timestamps.length > 5) timestamps.shift();
        }
      }

      // Cadence calculation
      let cadence = 0;
      const timestamps = jumpTimestampsRef.current;
      if (timestamps.length >= 2) {
        const intervals = [];
        for (let i = 1; i < timestamps.length; i++) {
          intervals.push(timestamps[i] - timestamps[i - 1]);
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        cadence = 1000 / avgInterval;
      }

      // Lean detection from horizontal motion balance
      let lean = 0;
      const totalHorizMotion = leftMotion + rightMotion;
      if (totalHorizMotion > 10) {
        lean = (rightMotion - leftMotion) / totalHorizMotion; // -1 to 1
        // Apply dead zone
        if (Math.abs(lean) < LEAN_DEAD_ZONE) {
          lean = 0;
        } else {
          lean = (lean - Math.sign(lean) * LEAN_DEAD_ZONE) / (1 - LEAN_DEAD_ZONE);
        }
      }

      // Smooth with EMA
      smoothedCadenceRef.current =
        smoothedCadenceRef.current * (1 - SMOOTHING) + cadence * SMOOTHING;
      smoothedLeanRef.current =
        smoothedLeanRef.current * (1 - SMOOTHING) + lean * SMOOTHING;

      // Track detection status
      const hasAnyMotion = lowerMotionAvg > 2 || upperMotionSum / (GRID_COLS * 3) > 2;
      if (hasAnyMotion) {
        noMotionFramesRef.current = 0;
      } else {
        noMotionFramesRef.current++;
      }

      const detectionActive = noMotionFramesRef.current < NO_MOTION_TIMEOUT_FRAMES;
      const cameraReady = true;

      // Write to store
      setJumpRope({
        jumpCount: jumpCountRef.current,
        cadence: Math.max(0, smoothedCadenceRef.current),
        bodyLean: smoothedLeanRef.current,
        isJumping: isJumpingUpRef.current,
        cameraReady,
        detectionActive,
      });
    }

    prevGridRef.current = grid;
    animFrameRef.current = requestAnimationFrame(detect);
  }, [getCanvas, setJumpRope]);

  // Start detection loop
  useEffect(() => {
    if (!enabled) {
      // Reset state when disabled
      prevGridRef.current = null;
      isJumpingUpRef.current = false;
      return;
    }

    // Small delay to let video element mount
    const startTimeout = setTimeout(() => {
      animFrameRef.current = requestAnimationFrame(detect);
    }, 500);

    return () => {
      clearTimeout(startTimeout);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [enabled, detect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);
}
