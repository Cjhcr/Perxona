/**
 * VoiceInputManager - Continuous Non-cutting Speech Recognition with Silence Detection & Visualizer
 */
export class VoiceInputManager {
  constructor(options = {}) {
    this.lang = options.lang || "zh-TW";
    this.onResult = options.onResult || (() => {});
    this.onInterim = options.onInterim || (() => {});
    this.onStart = options.onStart || (() => {});
    this.onEnd = options.onEnd || (() => {});
    this.onVolume = options.onVolume || (() => {});
    this.onError = options.onError || (() => {});

    this.isListening = false;
    this.recognition = null;
    this.audioContext = null;
    this.analyser = null;
    this.mediaStream = null;
    this.animFrameId = null;

    this.accumulatedTranscript = "";
    this.liveTranscript = "";
    this.silenceTimer = null;
    this.silenceTimeoutMs = 3500; // 3.5 seconds of silence before auto-submitting

    this.initRecognition();
  }

  initRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("SpeechRecognition is not supported in this browser.");
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true; // Continuous listening across multiple sentences
    this.recognition.interimResults = true;
    this.recognition.lang = this.lang;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.onStart();
      this.startAudioVisualizer();
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          this.accumulatedTranscript += item[0].transcript + " ";
        } else {
          interimTranscript += item[0].transcript;
        }
      }

      const currentLiveText = (this.accumulatedTranscript + interimTranscript).trim();
      if (currentLiveText) {
        this.liveTranscript = currentLiveText;
        this.onInterim(currentLiveText);

        // Reset silence timer on every new speech token
        clearTimeout(this.silenceTimer);
        this.silenceTimer = setTimeout(() => {
          if (this.isListening && this.liveTranscript) {
            this.commitFinalResult();
          }
        }, this.silenceTimeoutMs);
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error === "no-speech") {
        // Normal silence, do not abort
        return;
      }
      console.warn("Speech recognition notice:", event.error);
      if (["not-allowed", "service-not-allowed", "audio-capture"].includes(event.error)) {
        this.isListening = false;
      }
      this.onError(event.error);
    };

    this.recognition.onend = () => {
      // Auto-restart if user did not explicitly stop listening (Chrome auto-drop fix)
      if (this.isListening) {
        try {
          this.recognition.start();
        } catch (e) {
          this.stop();
        }
      } else {
        this.stopAudioVisualizer();
        this.onEnd();
      }
    };
  }

  commitFinalResult() {
    const final = (this.liveTranscript || this.accumulatedTranscript).trim();
    if (final) {
      this.onResult(final);
      this.accumulatedTranscript = "";
      this.liveTranscript = "";
    }
    this.stop();
  }

  async startAudioVisualizer() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
      if (!this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      const updateVolume = () => {
        if (!this.isListening) return;
        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(1, avg / 128);
        this.onVolume(normalized, dataArray);
        this.animFrameId = requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch (err) {
      console.warn("Visualizer audio context note:", err.message);
    }
  }

  stopAudioVisualizer() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  async start() {
    if (!this.recognition) {
      this.onError("not-supported");
      return false;
    }
    this.accumulatedTranscript = "";
    this.liveTranscript = "";
    clearTimeout(this.silenceTimer);
    try {
      if (navigator.mediaDevices?.getUserMedia && !this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      this.isListening = true;
      this.recognition.start();
      return true;
    } catch (err) {
      this.isListening = false;
      this.onError(err?.name === "NotAllowedError" ? "not-allowed" : "audio-capture");
      return false;
    }
  }

  stop() {
    this.isListening = false;
    clearTimeout(this.silenceTimer);
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (err) {}
    }
    this.stopAudioVisualizer();
    this.onEnd();
  }

  async toggle() {
    if (this.isListening) {
      this.commitFinalResult();
      return false;
    } else {
      return this.start();
    }
  }
}
