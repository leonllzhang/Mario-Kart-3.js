import { useEffect, useRef, useCallback, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { useGameStore } from "../store";
import { poseVideoRef } from "./poseVideoRef";

// Detection throttle: run pose detection every N frames
const DETECTION_INTERVAL = 3;

// Smoothing factor for EMA (0-1, lower = smoother)
const SMOOTHING = 0.4;

// Jump detection thresholds
const JUMP_RISE_THRESHOLD = 0.04; // ankles must rise this much (normalized) to count as jump
const JUMP_FALL_THRESHOLD = 0.02; // ankles must fall back this much to complete jump cycle

// Lean dead zone (normalized 0-1)
const LEAN_DEAD_ZONE = 0.05;

const keypointNames = [
  "nose", "left_eye", "right_eye", "left_ear", "right_ear",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_hip", "right_hip",
  "left_knee", "right_knee", "left_ankle", "right_ankle",
];

function getKeypoint(pose, name) {
  const idx = keypointNames.indexOf(name);
  if (idx === -1) return null;
  const kp = pose.keypoints[idx];
  if (!kp || kp.score < 0.3) return null;
  return kp;
}

export function usePoseDetection({ isCameraReady, enabled }) {
  const detectorRef = useRef(null);
  const [detectorReady, setDetectorReady] = useState(false);
  const frameCountRef = useRef(0);
  const animFrameRef = useRef(null);

  // Jump detection state
  const ankleBaselineRef = useRef(null); // running baseline Y
  const prevAvgAnkleYRef = useRef(null);
  const isAnkleUpRef = useRef(false);
  const jumpTimestampsRef = useRef([]);
  const jumpCountRef = useRef(0);

  // Smoothed output values
  const smoothedCadenceRef = useRef(0);
  const smoothedLeanRef = useRef(0);

  const setJumpRope = useGameStore((state) => state.setJumpRope);

  // Track consecutive frames without detection for HUD feedback
  const noDetectionFramesRef = useRef(0);

  // Define detect BEFORE the effect that uses it (const TDZ hoisting)
  const detect = useCallback(async () => {
    const detector = detectorRef.current;
    const video = poseVideoRef.current;
    if (!detector || !video || !video.readyState || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    frameCountRef.current++;
    // Throttle detection to every N frames
    if (frameCountRef.current % DETECTION_INTERVAL === 0) {
      try {
        const poses = await detector.estimatePoses(video, {
          flipHorizontal: true,
        });
        if (poses && poses.length > 0 && poses[0].keypoints?.length > 0) {
          noDetectionFramesRef.current = 0;
          processPose(poses[0], video.videoWidth);
        } else {
          noDetectionFramesRef.current++;
          if (noDetectionFramesRef.current > 30) {
            setJumpRope({ detectionActive: false });
          }
        }
      } catch (e) {
        noDetectionFramesRef.current++;
      }
    }

    animFrameRef.current = requestAnimationFrame(detect);
  }, []);

  // Load detector and start detection loop once ready
  useEffect(() => {
    if (!enabled) {
      setDetectorReady(false);
      return;
    }

    let cancelled = false;
    async function loadDetector() {
      try {
        await tf.ready();
        console.log("TF.js ready, loading MoveNet model...");
        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          {
            modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
            modelUrl: '/movenet/model.json',
          }
        );
        if (!cancelled) {
          detectorRef.current = detector;
          setDetectorReady(true);
          console.log("MoveNet detector loaded successfully, starting detection loop");
          // Start detection loop immediately once model is loaded
          animFrameRef.current = requestAnimationFrame(detect);
        }
      } catch (err) {
        console.error("Failed to load pose detection model:", err);
        // Retry after 3 seconds
        if (!cancelled) {
          console.log("Retrying model load in 3s...");
          setTimeout(loadDetector, 3000);
        }
      }
    }
    loadDetector();
    return () => {
      cancelled = true;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [enabled, detect]);

  function processPose(pose, videoWidth) {
    const leftAnkle = getKeypoint(pose, "left_ankle");
    const rightAnkle = getKeypoint(pose, "right_ankle");
    const leftShoulder = getKeypoint(pose, "left_shoulder");
    const rightShoulder = getKeypoint(pose, "right_shoulder");

    if (!leftAnkle && !rightAnkle) {
      // No legs visible - reset detection
      ankleBaselineRef.current = null;
      isAnkleUpRef.current = false;
      return;
    }

    // Average ankle Y (lower Y = higher up in image = person jumped)
    let avgAnkleY = 0;
    let ankleCount = 0;
    if (leftAnkle) { avgAnkleY += leftAnkle.y; ankleCount++; }
    if (rightAnkle) { avgAnkleY += rightAnkle.y; ankleCount++; }
    avgAnkleY /= ankleCount;

    const imageHeight = poseVideoRef.current?.videoHeight || 480;
    const normalizedY = avgAnkleY / imageHeight; // 0 = top, 1 = bottom

    // Initialize baseline on first frame
    if (ankleBaselineRef.current === null) {
      ankleBaselineRef.current = normalizedY;
      prevAvgAnkleYRef.current = normalizedY;
      return;
    }

    // Smooth baseline (slow adaptation to stance changes)
    ankleBaselineRef.current =
      ankleBaselineRef.current * 0.99 + normalizedY * 0.01;

    const rise = ankleBaselineRef.current - normalizedY; // positive = jumped up

    // Jump cycle detection
    if (!isAnkleUpRef.current && rise > JUMP_RISE_THRESHOLD) {
      // Ankles rose above threshold → start of jump
      isAnkleUpRef.current = true;
    } else if (isAnkleUpRef.current && rise < JUMP_FALL_THRESHOLD) {
      // Ankles came back down → completed jump cycle
      isAnkleUpRef.current = false;
      jumpCountRef.current++;

      // Track jump timestamps for cadence
      const now = performance.now();
      const timestamps = jumpTimestampsRef.current;
      timestamps.push(now);
      // Keep last 5 jumps
      while (timestamps.length > 5) timestamps.shift();
    }

    // Calculate cadence from recent jump intervals
    let cadence = 0;
    const timestamps = jumpTimestampsRef.current;
    if (timestamps.length >= 2) {
      const intervals = [];
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push(timestamps[i] - timestamps[i - 1]);
      }
      const avgInterval =
        intervals.reduce((a, b) => a + b, 0) / intervals.length;
      cadence = 1000 / avgInterval; // jumps per second
    }

    // Body lean detection
    let lean = 0;
    if (leftShoulder && rightShoulder) {
      const midX = (leftShoulder.x + rightShoulder.x) / 2;
      const imageCenter = videoWidth / 2;
      lean = (midX - imageCenter) / imageCenter; // -1 to 1

      // Apply dead zone
      if (Math.abs(lean) < LEAN_DEAD_ZONE) {
        lean = 0;
      } else {
        // Rescale beyond dead zone
        lean = (lean - Math.sign(lean) * LEAN_DEAD_ZONE) / (1 - LEAN_DEAD_ZONE);
      }
    }

    // Smooth with EMA
    smoothedCadenceRef.current =
      smoothedCadenceRef.current * (1 - SMOOTHING) + cadence * SMOOTHING;
    smoothedLeanRef.current =
      smoothedLeanRef.current * (1 - SMOOTHING) + lean * SMOOTHING;

    // Write to store
    setJumpRope({
      jumpCount: jumpCountRef.current,
      cadence: Math.max(0, smoothedCadenceRef.current),
      bodyLean: smoothedLeanRef.current,
      isJumping: isAnkleUpRef.current,
      cameraReady: true,
      detectionActive: true,
    });
  }

  // Handle cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);
}
