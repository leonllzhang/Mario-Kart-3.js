import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { useGameStore } from "../store";

export function JumpRopeController() {
  const gameMode = useGameStore((state) => state.gameMode);
  const jumpRope = useGameStore((state) => state.jumpRope);
  const setJumpRopeControls = useGameStore((state) => state.setJumpRopeControls);
  const setJoystick = useGameStore((state) => state.setJoystick);

  const driftActiveRef = useRef(false);
  const leanHoldTimeRef = useRef(0);

  useFrame((_, delta) => {
    if (!gameMode) return;

    const { cadence, bodyLean, isJumping } = jumpRope;

    // === 1. Speed from cadence ===
    let forwardTarget = 0;
    if (gameMode === "easy") {
      // Easy mode: very sensitive - tiny bounces move the kart
      if (cadence > 0.05) {
        forwardTarget = Math.min(cadence * 2.5, 1.0);
      }
    } else {
      // Normal mode: moderate sensitivity
      if (cadence > 0.2) {
        forwardTarget = Math.min(cadence / 1.5, 1.0);
      }
    }

    // === 2. Steering from body lean ===
    let steerTarget = bodyLean;
    if (gameMode === "easy") {
      // Easy mode: gentler steering, wall avoidance handles curves
      steerTarget = bodyLean * 0.4;
    }

    // Write steering to joystick (PlayerController reads this)
    setJoystick({ x: steerTarget, y: 0, distance: Math.abs(steerTarget) });

    // === 3. Auto-drift in normal mode ===
    const leanMag = Math.abs(bodyLean);
    if (gameMode === "normal" && leanMag > 0.3 && forwardTarget > 0.3) {
      leanHoldTimeRef.current += delta;
      if (leanHoldTimeRef.current > 0.6 && !driftActiveRef.current) {
        driftActiveRef.current = true;
      }
    } else if (leanMag < 0.15) {
      if (driftActiveRef.current) {
        driftActiveRef.current = false;
      }
      leanHoldTimeRef.current = 0;
    }

    // === 4. Write processed controls ===
    setJumpRopeControls({
      forward: forwardTarget,
      steer: steerTarget,
      driftActive: driftActiveRef.current,
    });
  });

  return null;
}
