import { useCamera } from "./useCamera";
import { usePoseDetection } from "./usePoseDetection";
import { useGameStore } from "../store";

export function JumpRopeCamera() {
  const gameMode = useGameStore((state) => state.gameMode);
  const enabled = gameMode !== null;

  const { isReady } = useCamera(enabled);

  usePoseDetection({ isCameraReady: isReady && enabled, enabled });

  return null;
}
