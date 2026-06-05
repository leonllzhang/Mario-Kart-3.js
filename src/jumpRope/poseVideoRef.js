// Shared reference to the video element used for pose detection.
// JumpRopeHUD renders the <video> and sets this ref.
// usePoseDetection reads from this ref.
export const poseVideoRef = { current: null };
