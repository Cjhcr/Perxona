/**
 * InterviewOrchestrator - Psychological Desensitization War Room Core State Machine
 * 整合「回答內容」+「即時微表情」雙維度客觀評分體系
 */
export class InterviewOrchestrator {
  constructor(options = {}) {
    this.onInterruption = options.onInterruption || (() => {});
    this.onMetricsUpdate = options.onMetricsUpdate || (() => {});

    this.isActive = false;
    this.startTime = null;
    this.historyFrames = [];
    this.eventsLog = [];
    this.transcriptTurns = [];
    this.lastInterruptionTime = 0;
    this.totalInterruptions = 0;
    this.maxInterruptionsPerSession = 2;
    this.usedInterruptionIndices = new Set();

    this.gazeInterruptionPool = [
      "（薇拉眼神微凝，語調冷靜）先停一下。你的視線已經持續偏離鏡頭。請直視我，用一句話重述核心結論。",
      "（薇拉輕輕調整坐姿，目光銳利）注意眼神。在答辯中，目光游移會削弱觀點的篤定感。請看著鏡頭繼續。",
      "（薇拉雙手交疊，語氣平穩）請將視線拉回鏡頭。思考時盡量保持與考官的眼神接觸，請簡明扼要地收尾。",
      "（薇拉平靜地注視著你）你的眼神在向上飄移。不必背誦講稿，用最真實的技術決策邏輯回答我。",
    ];

    this.stressInterruptionPool = [
      "（薇拉輕輕抬手示意暫停）你的肢體語言顯得很緊繃。在正式答辯與面試中，過度猶豫會削弱說服力。深吸一口氣，直接說結論。",
      "（薇拉神情專注但具壓迫感）放鬆肩膀。不要被壓力影響你的邏輯推進，請具體給出一個實際數據。",
      "（薇拉語調沉穩）你剛才出現了短暫的猶豫停頓。請不要推翻原本的想法，清楚說出你選擇此方案的最關鍵理由。",
      "（薇拉微微前傾）保持冷靜。這是一個高壓場景，但我需要聽到你對技術邊界的清晰判斷，繼續說明。",
    ];

    this.currentMetrics = {
      eyeContact: true,
      wanderDuration: 0,
      confidenceScore: 85,
      stressLevel: 20,
      headStability: 90,
      dominantEmotion: "neutral",
      tensionStatus: "表現沉穩",
    };
  }

  startSession() {
    this.isActive = true;
    this.startTime = Date.now();
    this.historyFrames = [];
    this.eventsLog = [];
    this.transcriptTurns = [];
    this.lastInterruptionTime = 0;
    this.totalInterruptions = 0;
    this.usedInterruptionIndices.clear();
  }

  stopSession() {
    this.isActive = false;
    return this.generateReport();
  }

  logTurn(role, text, meta = {}) {
    const elapsedSec = Math.round((Date.now() - (this.startTime || Date.now())) / 1000);
    const mins = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
    const secs = String(elapsedSec % 60).padStart(2, "0");

    this.transcriptTurns.push({
      role,
      text,
      time: `${mins}:${secs}`,
      gazeContact: meta.gazeContact ?? this.currentMetrics.eyeContact,
      wanderDuration: meta.wanderDuration ?? this.currentMetrics.wanderDuration,
      confidence: meta.confidence ?? this.currentMetrics.confidenceScore,
      stress: meta.stress ?? this.currentMetrics.stressLevel,
      emotion: meta.emotion ?? this.currentMetrics.dominantEmotion,
      headStability: meta.headStability ?? this.currentMetrics.headStability,
    });
  }

  updateFrame(gazeData, emotionData) {
    if (!this.isActive) return;

    const isContact = gazeData.isEyeContact;
    const wanderDur = gazeData.wanderDuration;
    const emotion = emotionData.emotion || "neutral";
    const expressions = emotionData.allExpressions || {};

    const fear = expressions.fearful || 0;
    const sad = expressions.sad || 0;
    const angry = expressions.angry || 0;
    const happy = expressions.happy || 0;
    const rawStress = Math.min(100, Math.round((fear * 2.5 + sad * 1.2 + angry * 1.0) * 100));
    const stress = Math.max(10, Math.min(95, rawStress + (wanderDur > 1 ? Math.round(wanderDur * 12) : 0)));

    const confidence = Math.max(
      15,
      Math.min(
        100,
        Math.round(
          (isContact ? 40 : 10) +
            gazeData.headStability * 0.35 +
            (100 - stress) * 0.25 +
            (happy > 0.3 ? 10 : 0),
        ),
      ),
    );

    let status = "表現沉穩";
    let statusLevel = "normal";

    if (wanderDur >= 2.5) {
      status = "眼神飄移";
      statusLevel = "danger";
    } else if (stress >= 65) {
      status = "表情緊繃";
      statusLevel = "warning";
    } else if (gazeData.headStability < 50) {
      status = "頭部晃動";
      statusLevel = "warning";
    } else if (confidence >= 80) {
      status = "自信穩定";
      statusLevel = "success";
    }

    this.currentMetrics = {
      eyeContact: isContact,
      wanderDuration: wanderDur,
      confidenceScore: confidence,
      stressLevel: stress,
      headStability: gazeData.headStability,
      dominantEmotion: emotionData.label || emotion,
      tensionStatus: status,
      statusLevel,
    };

    this.historyFrames.push({
      time: Date.now() - this.startTime,
      confidence,
      stress,
      wanderDur,
      isContact,
    });

    this.onMetricsUpdate(this.currentMetrics);

    // ── Proactive Strict Interruption (45s Cooldown & Max 2) ────────────────
    const now = Date.now();
    const cooldownPassed = now - this.lastInterruptionTime > 45000;
    const withinLimit = this.totalInterruptions < this.maxInterruptionsPerSession;

    if (cooldownPassed && withinLimit) {
      if (wanderDur >= 3.8) {
        this.lastInterruptionTime = now;
        this.totalInterruptions++;
        
        const pool = this.gazeInterruptionPool;
        let chosenLine = pool[0];
        for (let i = 0; i < pool.length; i++) {
          const key = `gaze_${i}`;
          if (!this.usedInterruptionIndices.has(key)) {
            this.usedInterruptionIndices.add(key);
            chosenLine = pool[i];
            break;
          }
        }

        this.eventsLog.push({
          time: Math.round((now - this.startTime) / 1000),
          type: "gaze_wander",
          desc: `眼神飄移達 ${wanderDur.toFixed(1)} 秒`,
        });
        this.onInterruption({
          reason: "gaze_wander",
          message: chosenLine,
        });
      } else if (stress >= 80) {
        this.lastInterruptionTime = now;
        this.totalInterruptions++;

        const pool = this.stressInterruptionPool;
        let chosenLine = pool[0];
        for (let i = 0; i < pool.length; i++) {
          const key = `stress_${i}`;
          if (!this.usedInterruptionIndices.has(key)) {
            this.usedInterruptionIndices.add(key);
            chosenLine = pool[i];
            break;
          }
        }

        this.eventsLog.push({
          time: Math.round((now - this.startTime) / 1000),
          type: "high_stress",
          desc: "出現高度緊繃與焦慮微表情",
        });
        this.onInterruption({
          reason: "high_stress",
          message: chosenLine,
        });
      }
    }
  }

  /**
   * 雙維度評估：【回答內容結構】 + 【實時表情/眼神數據】
   */
  evaluateSentenceDual(text, turnMeta) {
    const len = text.length;
    const hasData = /\d+|%|倍|億|萬|QPS|微服務|架構|專案|指標|提升|降低/.test(text);
    const hasStructure = /首先|總結|核心是|結論是|主導|負責|解決|成果/.test(text);

    // 1. 內容評估 (Content Analysis)
    let contentScore = 7;
    let contentFeedback = "邏輯通順，有切中問題要點。";
    if (hasData && hasStructure) {
      contentScore = 8;
      contentFeedback = "結論先行且具備量化數據佐證，論述結構扎實。";
    } else if (hasStructure) {
      contentScore = 7;
      contentFeedback = "結構清晰，但建議增加 1~2 項量化指標增強說服力。";
    } else if (len < 15) {
      contentScore = 5;
      contentFeedback = "回答過於簡短，未展開具體落地行動。";
    } else {
      contentScore = 6;
      contentFeedback = "背景鋪陳偏長，建議開門見山先講具體成果。";
    }

    // 2. 表情與台風評估 (Facial Expression & Telemetry Analysis)
    let expressionScore = 7;
    let expressionFeedback = "面部表情自然平穩。";
    const isContact = turnMeta.gazeContact;
    const stress = turnMeta.stress || 20;

    if (isContact && stress < 35) {
      expressionScore = 8;
      expressionFeedback = "直視鏡頭目光篤定，微表情控制優異。";
    } else if (!isContact) {
      expressionScore = 5;
      expressionFeedback = "作答時視線偏離鏡頭，建議目光保持在螢幕中央。";
    } else if (stress >= 60) {
      expressionScore = 5;
      expressionFeedback = "作答時面部略顯緊繃，建議深呼吸維持自然節奏。";
    }

    // 3. 雙維度綜合評等
    const combinedAvg = Math.round((contentScore * 0.55 + expressionScore * 0.45) * 10) / 10;
    const grade = combinedAvg >= 7.5 ? "A- (優良)" : combinedAvg >= 6.5 ? "B+ (穩健)" : "B (尚可)";

    const coachRewrite = hasData
      ? `「${text}」`
      : `「針對此項目，我核心主導了關鍵重構，使關鍵指標顯著提升，並有效解決了效能瓶頸。」`;

    return {
      grade,
      contentScore: `${contentScore} / 10`,
      contentFeedback,
      expressionScore: `${expressionScore} / 10`,
      expressionFeedback,
      coachRewrite,
    };
  }

  generateReport() {
    const totalFrames = this.historyFrames.length || 1;
    const eyeContactCount = this.historyFrames.filter((f) => f.isContact).length;
    const avgEyeContact = Math.round((eyeContactCount / totalFrames) * 100);

    const avgConfidence = Math.round(
      this.historyFrames.reduce((acc, f) => acc + f.confidence, 0) / totalFrames,
    );

    const avgStress = Math.round(
      this.historyFrames.reduce((acc, f) => acc + f.stress, 0) / totalFrames,
    );

    const sessionDurationSeconds = Math.round(
      (Date.now() - (this.startTime || Date.now())) / 1000,
    );

    const lineByLineAssessment = this.transcriptTurns
      .filter((turn) => turn.role === "user")
      .map((turn, index) => {
        const evalResult = this.evaluateSentenceDual(turn.text, turn);
        return {
          index: index + 1,
          time: turn.time,
          originalText: turn.text,
          gazeContact: turn.gazeContact ? "眼神正視" : "眼神偏離",
          confidence: turn.confidence,
          ...evalResult,
        };
      });

    const strengths = [];
    const suggestions = [];

    if (avgEyeContact >= 70) {
      strengths.push("眼神接觸穩定，多數時間維持與考官的正視對焦。");
    } else {
      suggestions.push("視線飄移偏多：嘗試將目光固定於螢幕考官眉心。");
    }

    if (avgConfidence >= 75) {
      strengths.push("整體台風穩健，微表情控制良好，展現出自信。");
    } else {
      suggestions.push("微表情略顯緊繃：回答前可先停頓 1 秒深呼吸。");
    }

    if (this.eventsLog.length === 0) {
      strengths.push("成功在高壓模擬中全程維持穩定，未觸發考官打斷警示。");
    } else {
      suggestions.push(`共出現 ${this.eventsLog.length} 次破綻打斷，需加強高壓應答時的抗壓脫敏。`);
    }

    return {
      duration: sessionDurationSeconds,
      avgEyeContact,
      avgConfidence,
      avgStress,
      eventsCount: this.eventsLog.length,
      events: this.eventsLog,
      strengths,
      suggestions,
      lineByLineAssessment,
      finalGrade:
        avgConfidence >= 80
          ? "A- (優良)"
          : avgConfidence >= 65
            ? "B+ (穩健通過)"
            : "B (尚可)",
    };
  }
}
