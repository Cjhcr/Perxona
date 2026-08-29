/**
 * GazeHeadTracker - Calibrated MediaPipe Iris Tracking & 3D Head Pose Estimator
 * Features EMA smoothing, screen-viewing angle compensation, and robust eye-contact detection.
 */
import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

export class GazeHeadTracker {
  constructor(options = {}) {
    this.videoElement = options.videoElement;
    this.onMetrics = options.onMetrics || (() => {});
    this.onError = options.onError || (() => {});

    this.faceLandmarker = null;
    this.isTracking = false;
    this.animId = null;
    this.lastVideoTime = -1;

    // Gaze wander timer & smoothed states
    this.wanderStartTime = null;
    this.wanderDuration = 0;
    this.smoothedGazeX = 0;
    this.smoothedGazeY = 0;
    this.smoothedPitch = 0;
    this.smoothedYaw = 0;
    this.smoothedRoll = 0;
  }

  async init() {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
      );

      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: "VIDEO",
        numFaces: 1,
      });
      return true;
    } catch (err) {
      console.error("GazeHeadTracker init failed:", err);
      this.onError(err);
      return false;
    }
  }

  async start() {
    if (!this.faceLandmarker) {
      const ok = await this.init();
      if (!ok) return false;
    }
    this.isTracking = true;
    this.predictLoop();
    return true;
  }

  stop() {
    this.isTracking = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    this.wanderStartTime = null;
    this.wanderDuration = 0;
  }

  predictLoop() {
    if (!this.isTracking || !this.videoElement) return;

    if (
      this.videoElement.readyState === 4 &&
      this.videoElement.currentTime !== this.lastVideoTime
    ) {
      this.lastVideoTime = this.videoElement.currentTime;
      const startTimeMs = performance.now();
      const results = this.faceLandmarker.detectForVideo(
        this.videoElement,
        startTimeMs,
      );

      if (results?.faceLandmarks?.[0]) {
        const landmarks = results.faceLandmarks[0];
        const metrics = this.computeMetrics(landmarks);
        this.onMetrics(metrics);
      }
    }

    if (this.isTracking) {
      this.animId = requestAnimationFrame(() => this.predictLoop());
    }
  }

  /**
   * Compute Calibrated Iris Position, Screen Gaze, and Head Pose
   */
  computeMetrics(landmarks) {
    // Iris points: Left 468, Right 473
    // Left eye corners: 33 (outer), 133 (inner), top: 159, bottom: 145
    // Right eye corners: 263 (outer), 362 (inner), top: 386, bottom: 374
    const leftIris = landmarks[468];
    const leftCornerOut = landmarks[33];
    const leftCornerIn = landmarks[133];
    const leftTop = landmarks[159];
    const leftBot = landmarks[145];

    const rightIris = landmarks[473];
    const rightCornerOut = landmarks[263];
    const rightCornerIn = landmarks[362];
    const rightTop = landmarks[386];
    const rightBot = landmarks[374];

    let rawGazeX = 0;
    let rawGazeY = 0;

    if (leftIris && leftCornerOut && leftCornerIn && leftTop && leftBot) {
      const eyeWidth = Math.abs(leftCornerIn.x - leftCornerOut.x) || 0.05;
      const eyeHeight = Math.abs(leftBot.y - leftTop.y) || 0.02;
      const eyeCenterX = (leftCornerOut.x + leftCornerIn.x) / 2;
      const eyeCenterY = (leftTop.y + leftBot.y) / 2;

      const normX = (leftIris.x - eyeCenterX) / (eyeWidth / 2);
      const normY = (leftIris.y - eyeCenterY) / (eyeHeight / 2);

      rawGazeX = normX;
      rawGazeY = normY;
    }

    if (rightIris && rightCornerOut && rightCornerIn && rightTop && rightBot) {
      const eyeWidth = Math.abs(rightCornerOut.x - rightCornerIn.x) || 0.05;
      const eyeHeight = Math.abs(rightBot.y - rightTop.y) || 0.02;
      const eyeCenterX = (rightCornerOut.x + rightCornerIn.x) / 2;
      const eyeCenterY = (rightTop.y + rightBot.y) / 2;

      const normX = (rightIris.x - eyeCenterX) / (eyeWidth / 2);
      const normY = (rightIris.y - eyeCenterY) / (eyeHeight / 2);

      rawGazeX = (rawGazeX + normX) / 2;
      rawGazeY = (rawGazeY + normY) / 2;
    }

    // 2. Head Pose (Pitch, Yaw, Roll)
    const noseTip = landmarks[1];
    const chin = landmarks[152];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];

    const eyeMidY = (leftEye.y + rightEye.y) / 2;
    const faceHeight = Math.abs(chin.y - eyeMidY) || 0.1;
    const rawPitch = ((noseTip.y - eyeMidY) / faceHeight - 0.42) * 90;

    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const eyeSpan = Math.abs(rightEye.x - leftEye.x) || 0.1;
    const rawYaw = ((noseTip.x - eyeMidX) / eyeSpan) * 110;

    const rawRoll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);

    // 3. Exponential Moving Average (EMA) smoothing for stability
    const alpha = 0.35;
    this.smoothedGazeX = this.smoothedGazeX * (1 - alpha) + rawGazeX * alpha;
    this.smoothedGazeY = this.smoothedGazeY * (1 - alpha) + rawGazeY * alpha;
    this.smoothedPitch = this.smoothedPitch * (1 - alpha) + rawPitch * alpha;
    this.smoothedYaw = this.smoothedYaw * (1 - alpha) + rawYaw * alpha;
    this.smoothedRoll = this.smoothedRoll * (1 - alpha) + rawRoll * alpha;

    // 4. Screen-Viewing Angle Compensation
    // When looking at the screen (Avatar), gaze Y is naturally ~ +0.15 to +0.40 below the top webcam.
    // Compensate so looking at screen center counts as direct eye contact!
    const compensatedGazeY = this.smoothedGazeY - 0.25;

    // Eye Contact Thresholds (Natural and forgiving for normal screen viewing)
    const isEyeContact =
      Math.abs(this.smoothedGazeX) < 0.42 &&
      Math.abs(compensatedGazeY) < 0.55 &&
      Math.abs(this.smoothedYaw) < 28 &&
      Math.abs(this.smoothedPitch) < 28;

    const now = performance.now();

    if (!isEyeContact) {
      if (!this.wanderStartTime) {
        this.wanderStartTime = now;
      }
      this.wanderDuration = (now - this.wanderStartTime) / 1000;
    } else {
      this.wanderStartTime = null;
      this.wanderDuration = 0;
    }

    const headMovement = Math.abs(this.smoothedPitch) + Math.abs(this.smoothedYaw) + Math.abs(this.smoothedRoll);
    const headStability = Math.max(20, Math.min(100, Math.round(100 - headMovement * 1.1)));

    return {
      isEyeContact,
      wanderDuration: Math.round(this.wanderDuration * 10) / 10,
      gazeX: this.smoothedGazeX,
      gazeY: compensatedGazeY,
      headPose: {
        pitch: Math.round(this.smoothedPitch),
        yaw: Math.round(this.smoothedYaw),
        roll: Math.round(this.smoothedRoll),
      },
      headStability,
    };
  }
}
