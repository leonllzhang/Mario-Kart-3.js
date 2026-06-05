import { PlayerController } from "./PlayerController";
import { Track } from "./models/Mario-circuit-test";
import { JumpRopeController } from "./jumpRope/JumpRopeController";

export const TrackScene = () => {
  return (
    <>
      <PlayerController />
      <JumpRopeController />
      <Track />
    </>
  );
};
