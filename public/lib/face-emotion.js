/**
 * FaceEmotionDetector - Deep Neural Network Facial Expression Recognition via face-api.js (vladmandic)
 * Evaluates 7 core human emotions (happy, sad, angry, surprised, disgusted, fearful, neutral) at 60 FPS
 */
import * as faceapi from "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.esm.js";

export class FaceEmotionDetector {
  constructor(options = {}) {
    this.videoElement = options.videoElement;
    this.onEmotion = options.onEmotion || (() => {});
    this.onError = options.onError || (() => {});

    this.isTracking = false;
    this.stream = null;
    this.animId = null;
    this.modelLoaded = false;

    // Model CDN path for face-api weights
    this.modelUrl =
      "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/";

    this.emotionLabels = {
      happy: { label: "正向" },
      surprised: { label: "驚訝" },
      sad: { label: "低落" },
      angry: { label: "緊繃" },
      fearful: { label: "不安" },
      disgusted: { label: "保留" },
      neutral: { label: "平靜" },
    };
  }

  async init() {
    if (this.modelLoaded) return true;
    try {
      // Load TinyFaceDetector and FaceExpressionNet neural networks
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(this.modelUrl),
        faceapi.nets.faceExpressionNet.loadFromUri(this.modelUrl),
      ]);
      this.modelLoaded = true;
      return true;
    } catch (err) {
      console.error("Failed to load face-api.js neural network models:", err);
      this.onError(err);
      return false;
    }
  }

  async startCamera() {
    const loaded = await this.init();
    if (!loaded) return false;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
      });
      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        await this.videoElement.play();
      }
      this.isTracking = true;
      this.predictLoop();
      return true;
    } catch (err) {
      console.error("Camera access error:", err);
      this.onError(err);
      return false;
    }
  }

  stopCamera() {
    this.isTracking = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  async predictLoop() {
    if (!this.isTracking || !this.videoElement) return;

    try {
      if (
        this.videoElement.readyState === 4 &&
        !this.videoElement.paused &&
        !this.videoElement.ended
      ) {
        // Run neural network face expression detection
        const detection = await faceapi
          .detectSingleFace(
            this.videoElement,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 }),
          )
          .withFaceExpressions();

        if (detection && detection.expressions) {
          const expressions = detection.expressions;
          let topEmotion = "neutral";
          let maxScore = 0;

          // Find the dominant emotion output by the neural net
          Object.keys(expressions).forEach((emotionKey) => {
            const score = expressions[emotionKey];
            if (score > maxScore) {
              maxScore = score;
              topEmotion = emotionKey;
            }
          });

          const meta = this.emotionLabels[topEmotion] || this.emotionLabels.neutral;

          this.onEmotion({
            emotion: topEmotion,
            label: meta.label,
            emoji: meta.emoji,
            score: maxScore,
            allExpressions: expressions,
          });
        }
      }
    } catch (e) {
      // Ignore transient frame errors
    }

    if (this.isTracking) {
      this.animId = requestAnimationFrame(() => this.predictLoop());
    }
  }
}
