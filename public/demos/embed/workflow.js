const STORAGE_KEY = "perxona-interview-workflow-v1";
const screens = {
  profiles: document.getElementById("profile-center"),
  wizard: document.getElementById("profile-wizard"),
  history: document.getElementById("history-screen"),
  lobby: document.getElementById("meet-lobby"),
  room: document.getElementById("meet-room"),
};

const WIZARD_STEPS = [
  {
    key: "resume",
    indexLabel: "01",
    title: "更新後的履歷",
    hint: "AI 會根據你的經歷與成果客製化提問。",
    accept: ".pdf,.txt,.doc,.docx",
    placeholder: "也可以直接貼上履歷重點、年資與量化成果…",
  },
  {
    key: "references",
    indexLabel: "02",
    title: "推薦人名單",
    hint: "用於模擬推薦人查證與過往合作情境提問。",
    accept: ".csv,.txt,.xlsx,.xls",
    placeholder: "姓名｜職稱｜電話｜電子郵件（每行一位）",
  },
  {
    key: "jd",
    indexLabel: "03",
    title: "職位說明書",
    hint: "AI 會依職責、技能與條件設計針對性問題。",
    accept: ".pdf,.txt,.doc,.docx",
    placeholder: "貼上職缺 JD、公司背景或職務要求…",
  },
  {
    key: "certificates",
    indexLabel: "04",
    title: "證書或執照",
    hint: "讓 AI 驗證專業資格、實務使用方式與有效期限。",
    accept: ".pdf,.txt,.jpg,.jpeg,.png",
    placeholder: "列出證書名稱、發證單位、年份與使用情境…",
  },
  {
    key: "portfolio",
    indexLabel: "05",
    title: "作品集",
    hint: "AI 會針對作品的挑戰、你的貢獻與成果深入追問。",
    accept: ".pdf,.txt,.ppt,.pptx",
    placeholder: "貼上作品連結，或描述代表作品、角色與成果…",
  },
];

let store = loadStore();
let wizardIndex = 0;
let wizardDraft = emptyDraft();
let historyView = "list";
let selectedSessionId = null;
let lastReportSession = null;

function loadStore() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (value && Array.isArray(value.profiles) && Array.isArray(value.sessions)) {
      return value;
    }
  } catch (error) {
    console.warn("Could not load local workflow data:", error);
  }
  return { profiles: [], sessions: [], currentProfileId: null };
}

function saveStore() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function emptyDraft() {
  return {
    name: "",
    industry: "",
    resume: "",
    references: "",
    jd: "",
    certificates: "",
    portfolio: "",
    files: {},
  };
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showScreen(name) {
  Object.entries(screens).forEach(([key, element]) => {
    if (!element) return;
    if (key === "room" && name !== "room") {
      element.hidden = false;
      element.classList.add("presenter-prewarm");
    } else {
      element.hidden = key !== name;
      if (key === "room") element.classList.remove("presenter-prewarm");
    }
  });
  const bottomBar = document.getElementById("meet-bottom-bar");
  if (bottomBar && name !== "room") bottomBar.hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function profileSessions(profileId) {
  return store.sessions
    .filter((session) => session.profileId === profileId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function avatarFor(profile) {
  return profile.name.trim().slice(0, 2) || "In";
}

function renderProfiles() {
  const grid = document.getElementById("profile-grid");
  const quick = document.getElementById("quick-continue");
  if (!store.profiles.length) {
    grid.innerHTML = `
      <button class="profile-card" data-create-profile type="button">
        <div class="profile-avatar">新增</div>
        <h2>建立第一個檔案</h2>
        <p>上傳資料後，兩步內開始你的第一次練習。</p>
      </button>`;
    quick.hidden = true;
    return;
  }

  grid.innerHTML = store.profiles
    .map((profile) => {
      const sessions = profileSessions(profile.id);
      const recent = sessions[0];
      const bars = sessions.slice(0, 7).reverse();
      return `
        <button class="profile-card" data-profile-id="${profile.id}" type="button">
          <div class="profile-avatar">${avatarFor(profile)}</div>
          <h2>${escapeHtml(profile.name)}</h2>
          <p>${escapeHtml(profile.industry)}</p>
          <small>${recent ? `最近練習：${formatDate(recent.createdAt)}` : "尚未開始練習"}</small>
          <div class="profile-sparkline" aria-label="整體評分曲線">
            ${bars.length ? bars.map((item) => `<i style="height:${Math.max(8, item.score * 9)}%"></i>`).join("") : "<i style=\"height:8%\"></i>"}
          </div>
        </button>`;
    })
    .join("");

  const latest = [...store.sessions].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  )[0];
  if (latest) {
    const profile = store.profiles.find((item) => item.id === latest.profileId);
    quick.hidden = false;
    quick.innerHTML = `
      <button class="workflow-primary" data-quick-profile="${profile.id}" type="button">快速繼續</button>
      <span class="workflow-eyebrow">快速繼續</span>
      <strong>${escapeHtml(profile.name)} · ${escapeHtml(latest.role)}</strong>
      <p>上次練習 ${formatDate(latest.createdAt)}，整體 ${latest.score}/10 分。</p>`;
  } else {
    quick.hidden = true;
  }
}

function startWizard() {
  wizardIndex = 0;
  wizardDraft = emptyDraft();
  document.getElementById("wizard-name").value = "";
  document.getElementById("wizard-industry").value = "";
  renderWizard();
  showScreen("wizard");
}

function syncWizardDraft() {
  wizardDraft.name = document.getElementById("wizard-name").value.trim();
  wizardDraft.industry = document.getElementById("wizard-industry").value.trim();
  const textarea = document.getElementById("wizard-content");
  if (textarea) wizardDraft[WIZARD_STEPS[wizardIndex].key] = textarea.value.trim();
}

function detectedResumeSummary(text) {
  const year = text.match(/(\d+)\s*年/);
  const skillWords = ["JavaScript", "TypeScript", "Node.js", "Python", "Go", "React", "管理", "行銷", "設計", "醫療"];
  const skills = skillWords.filter((skill) => text.toLowerCase().includes(skill.toLowerCase()));
  if (!text.trim()) return "貼上或上傳資料後，這裡會顯示 AI 偵測摘要。";
  return `已偵測到 ${year ? `${year[1]} 年相關經驗` : "工作經歷內容"}、${Math.max(skills.length, 1)} 項核心專長${skills.length ? `（${skills.join("、")}）` : ""}。`;
}

function renderWizard() {
  const step = WIZARD_STEPS[wizardIndex];
  document.getElementById("wizard-step-count").textContent = `${wizardIndex + 1} / ${WIZARD_STEPS.length}`;
  document.getElementById("wizard-steps").innerHTML = WIZARD_STEPS.map(
    (item, index) => `<button class="wizard-step-button ${index === wizardIndex ? "active" : ""} ${index < wizardIndex ? "complete" : ""}" data-wizard-step="${index}" type="button"><span>${item.indexLabel}</span>${item.title}</button>`,
  ).join("");
  document.getElementById("wizard-pane").innerHTML = `
    <span class="workflow-eyebrow">步驟 ${wizardIndex + 1} · 可選擇略過</span>
    <h2>${step.title}</h2>
    <p><strong>為什麼重要：</strong>${step.hint}</p>
    <label class="wizard-file-zone">
      <span>拖放或選擇檔案</span>
      <input id="wizard-file" type="file" accept="${step.accept}" />
      <small id="wizard-file-name">${escapeHtml(wizardDraft.files[step.key] || "尚未選擇檔案")}</small>
    </label>
    <label>補充文字
      <textarea id="wizard-content" class="meet-input meet-textarea" rows="7" placeholder="${step.placeholder}">${escapeHtml(wizardDraft[step.key])}</textarea>
    </label>
    <div id="wizard-detected" class="wizard-detected">${detectedResumeSummary(wizardDraft[step.key])}</div>`;
  document.getElementById("btn-wizard-prev").disabled = wizardIndex === 0;
  document.getElementById("btn-wizard-next").textContent = wizardIndex === WIZARD_STEPS.length - 1 ? "建立檔案" : "下一步";
}

async function readWizardFile(file) {
  const step = WIZARD_STEPS[wizardIndex];
  wizardDraft.files[step.key] = file.name;
  let text = "";
  if (file.type === "text/plain" || /\.(txt|csv)$/i.test(file.name)) {
    text = await file.text();
  } else if (/\.pdf$/i.test(file.name) && window.pdfjsLib) {
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str).join(" "));
    }
    text = pages.join("\n");
  }
  if (text) {
    wizardDraft[step.key] = text.slice(0, 20_000);
    document.getElementById("wizard-content").value = wizardDraft[step.key];
  }
  document.getElementById("wizard-file-name").textContent = `已選擇：${file.name}`;
  document.getElementById("wizard-detected").textContent = detectedResumeSummary(
    document.getElementById("wizard-content").value,
  );
}

function finishWizard() {
  syncWizardDraft();
  if (!wizardDraft.name || !wizardDraft.industry) {
    document.getElementById("wizard-name").reportValidity();
    document.getElementById("wizard-industry").reportValidity();
    return;
  }
  const profile = {
    ...wizardDraft,
    id: makeId("profile"),
    createdAt: new Date().toISOString(),
  };
  store.profiles.push(profile);
  store.currentProfileId = profile.id;
  saveStore();
  openHistory(profile.id);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-TW", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function openHistory(profileId = store.currentProfileId) {
  const profile = store.profiles.find((item) => item.id === profileId);
  if (!profile) return showScreen("profiles");
  store.currentProfileId = profile.id;
  saveStore();
  selectedSessionId = profileSessions(profile.id)[0]?.id ?? null;
  document.getElementById("history-profile-name").textContent = `${profile.name} 的面試旅程`;
  const days = new Set(profileSessions(profile.id).map((item) => item.createdAt.slice(0, 10))).size;
  document.getElementById("history-encouragement").textContent = days
    ? `你已累積 ${days} 天練習紀錄，每一次安全地失敗，都讓下一次更有把握。`
    : "準備好時，開始你的第一次模擬面試。";
  renderHistory();
  showScreen("history");
}

function renderProgressChart(sessions) {
  const svg = document.getElementById("progress-chart");
  const chronological = sessions.slice(0, 10).reverse();
  if (!chronological.length) {
    svg.innerHTML = `<text x="320" y="68" text-anchor="middle" fill="#71717a" font-size="14">完成第一次練習後，這裡會出現你的進步曲線</text>`;
    document.getElementById("progress-summary").textContent = "尚未有評分";
    return;
  }
  const points = chronological.map((item, index) => {
    const x = chronological.length === 1 ? 320 : 24 + (index * 592) / (chronological.length - 1);
    const y = 104 - item.score * 9;
    return { x, y, score: item.score };
  });
  svg.innerHTML = `
    <line x1="24" y1="104" x2="616" y2="104" stroke="#3f3f46" />
    <polyline points="${points.map((point) => `${point.x},${point.y}`).join(" ")}" fill="none" stroke="#818cf8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="#c7d2fe"><title>${point.score}/10</title></circle>`).join("")}`;
  const delta = chronological.at(-1).score - chronological[0].score;
  document.getElementById("progress-summary").textContent = chronological.length > 1
    ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} 分進步`
    : `目前 ${chronological[0].score}/10 分`;
}

function renderHistory() {
  const level = document.getElementById("history-level-filter").value;
  const sort = document.getElementById("history-sort").value;
  let sessions = profileSessions(store.currentProfileId);
  renderProgressChart(sessions);
  if (level !== "all") sessions = sessions.filter((item) => item.level.startsWith(level));
  if (sort === "score") sessions.sort((a, b) => b.score - a.score);

  const list = document.getElementById("history-list");
  list.classList.toggle("grid", historyView === "grid");
  if (!sessions.length) {
    list.innerHTML = `<div class="history-empty-state"><h2>開始你的第一次模擬面試</h2><p>選擇級別、測試鏡頭，讓 AI 面試官陪你安全地練習。</p><button class="workflow-primary" data-start-empty type="button">開始練習</button></div>`;
    renderHistoryPreview(null);
    return;
  }
  if (!sessions.some((item) => item.id === selectedSessionId)) selectedSessionId = sessions[0].id;
  list.innerHTML = sessions.map((item) => `
    <article class="history-row ${item.id === selectedSessionId ? "active" : ""}" data-session-id="${item.id}">
      <div>
        <span class="workflow-eyebrow">${escapeHtml(item.level)} · ${item.interviewerCount || 1} 位面試官</span>
        <h3>${escapeHtml(item.role)}</h3>
        <p>${formatDate(item.createdAt)} · ${Math.max(1, Math.round(item.duration / 60))} 分鐘</p>
      </div>
      <div class="history-score">${item.score}</div>
    </article>`).join("");
  renderHistoryPreview(sessions.find((item) => item.id === selectedSessionId));
}

function renderHistoryPreview(session) {
  const preview = document.getElementById("history-preview");
  if (!session) {
    preview.innerHTML = `<div class="history-empty-preview">選擇一筆紀錄，查看優點與待改進項目。</div>`;
    return;
  }
  const weakest = [...(session.assessments || [])].sort(
    (a, b) => (Number.parseFloat(a.contentScore) || 0) - (Number.parseFloat(b.contentScore) || 0),
  )[0];
  preview.innerHTML = `
    <span class="workflow-eyebrow">快速預覽</span>
    <h2>${session.score}/10 · ${escapeHtml(session.grade)}</h2>
    <h3>主要優點</h3>
    <ul>${(session.strengths || []).slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h3>待改進</h3>
    <ul>${(session.suggestions || []).slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    ${weakest ? `<button class="workflow-secondary" data-review-weakest="${session.id}" type="button">一鍵重點複習最低分回答</button><p>${escapeHtml(weakest.originalText)}</p>` : ""}`;
}

function openLobby() {
  const profile = store.profiles.find((item) => item.id === store.currentProfileId);
  if (!profile) return startWizard();
  const resume = document.getElementById("lobby-resume-input");
  const jd = document.getElementById("lobby-jd-input");
  const email = document.getElementById("lobby-email-input");
  if (resume) resume.value = [profile.resume, profile.certificates, profile.portfolio].filter(Boolean).join("\n\n");
  if (jd) jd.value = profile.jd || "";
  if (email) email.value = profile.references || "";
  showScreen("lobby");
  window.dispatchEvent(new CustomEvent("perxona:open-lobby", { detail: { profile } }));
}

function scoreFromReport(report) {
  const confidence = Number(report.avgConfidence || 0);
  const gaze = Number(report.avgEyeContact || 0);
  const calm = 100 - Number(report.avgStress || 0);
  return Math.max(1, Math.min(10, Math.round(((confidence + gaze + calm) / 30) * 10) / 10));
}

function saveReport(detail) {
  if (!store.currentProfileId || !detail?.report) return;
  const { report, interviewConfig, answeredCount, questionTarget } = detail;
  const session = {
    id: makeId("session"),
    profileId: store.currentProfileId,
    createdAt: new Date().toISOString(),
    role: interviewConfig.role,
    level: interviewConfig.level,
    interviewerCount: interviewConfig.interviewerCount || 1,
    duration: report.duration,
    score: scoreFromReport(report),
    grade: report.finalGrade,
    strengths: report.strengths,
    suggestions: report.suggestions,
    assessments: report.lineByLineAssessment || [],
    answeredCount,
    questionTarget,
    metrics: {
      expression: report.avgConfidence,
      professionalism: Math.min(100, report.avgConfidence + 5),
      response: Math.max(40, 100 - report.avgStress),
      logic: report.avgConfidence,
      body: report.avgEyeContact,
      emotion: Math.max(35, 100 - report.avgStress),
    },
  };
  store.sessions.unshift(session);
  saveStore();
  lastReportSession = session;
  renderRadar(session.metrics);
}

function renderRadar(metrics) {
  const target = document.getElementById("report-radar");
  if (!target) return;
  const dimensions = [
    ["表達能力", metrics.expression], ["專業度", metrics.professionalism],
    ["反應速度", metrics.response], ["邏輯性", metrics.logic],
    ["肢體語言", metrics.body], ["情緒穩定度", metrics.emotion],
  ];
  target.innerHTML = dimensions.map(([label, value]) => `
    <div class="radar-dimension"><span>${label}<strong>${Math.round(value)}/100</strong></span><i style="width:${Math.max(0, Math.min(100, value))}%"></i></div>`).join("");
}

function xmlEscape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function exportExcel(session) {
  if (!session) return;
  const rows = (session.assessments || []).map((item) => {
    const score = Number.parseFloat(item.contentScore) || 0;
    return `<Row><Cell><Data ss:Type="String">${xmlEscape(item.time)}</Data></Cell><Cell><Data ss:Type="String">使用者</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(item.originalText)}</Data></Cell><Cell ss:StyleID="${score < 6 ? "Low" : "Normal"}"><Data ss:Type="Number">${score}</Data></Cell><Cell><Data ss:Type="String">表達能力 / 邏輯性</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(item.contentFeedback)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(item.coachRewrite)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(item.expressionFeedback)}</Data></Cell></Row>`;
  }).join("");
  const improvements = (session.suggestions || []).map((item) => `<Row><Cell><Data ss:Type="String">${xmlEscape(item)}</Data></Cell></Row>`).join("");
  const workbook = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Normal"/><Style ss:ID="Low"><Interior ss:Color="#FECACA" ss:Pattern="Solid"/></Style><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#C7D2FE" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="逐句評分"><Table><Row ss:StyleID="Header"><Cell><Data ss:Type="String">時間戳記</Data></Cell><Cell><Data ss:Type="String">發言者</Data></Cell><Cell><Data ss:Type="String">原句內容</Data></Cell><Cell><Data ss:Type="String">評分（1–10）</Data></Cell><Cell><Data ss:Type="String">維度標記</Data></Cell><Cell><Data ss:Type="String">具體建議</Data></Cell><Cell><Data ss:Type="String">參考回答範本</Data></Cell><Cell><Data ss:Type="String">表情/語氣觀察</Data></Cell></Row>${rows}</Table><AutoFilter x:Range="R1C1:R1C8" xmlns="urn:schemas-microsoft-com:office:excel"/></Worksheet><Worksheet ss:Name="重點改進清單"><Table><Row ss:StyleID="Header"><Cell><Data ss:Type="String">待加強項目</Data></Cell></Row>${improvements}</Table></Worksheet></Workbook>`;
  const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `IntAIview-${session.role}-${new Date().toISOString().slice(0, 10)}.xls`;
  link.click();
  URL.revokeObjectURL(link.href);
}

document.getElementById("btn-new-profile").addEventListener("click", startWizard);
document.getElementById("profile-grid").addEventListener("click", (event) => {
  const create = event.target.closest("[data-create-profile]");
  const card = event.target.closest("[data-profile-id]");
  if (create) startWizard();
  if (card) openHistory(card.dataset.profileId);
});
document.getElementById("quick-continue").addEventListener("click", (event) => {
  const button = event.target.closest("[data-quick-profile]");
  if (button) openHistory(button.dataset.quickProfile);
});
document.getElementById("btn-wizard-back").addEventListener("click", () => { renderProfiles(); showScreen("profiles"); });
document.getElementById("btn-wizard-prev").addEventListener("click", () => { syncWizardDraft(); wizardIndex = Math.max(0, wizardIndex - 1); renderWizard(); });
document.getElementById("btn-wizard-skip").addEventListener("click", () => { document.getElementById("wizard-content").value = ""; document.getElementById("btn-wizard-next").click(); });
document.getElementById("btn-wizard-next").addEventListener("click", () => { syncWizardDraft(); if (wizardIndex === WIZARD_STEPS.length - 1) finishWizard(); else { wizardIndex += 1; renderWizard(); } });
document.getElementById("wizard-steps").addEventListener("click", (event) => { const button = event.target.closest("[data-wizard-step]"); if (button) { syncWizardDraft(); wizardIndex = Number(button.dataset.wizardStep); renderWizard(); } });
document.getElementById("wizard-pane").addEventListener("change", (event) => { if (event.target.id === "wizard-file" && event.target.files[0]) void readWizardFile(event.target.files[0]); });
document.getElementById("wizard-pane").addEventListener("input", (event) => { if (event.target.id === "wizard-content") document.getElementById("wizard-detected").textContent = detectedResumeSummary(event.target.value); });
document.getElementById("profile-wizard-form").addEventListener("submit", (event) => event.preventDefault());
document.getElementById("btn-history-back").addEventListener("click", () => { renderProfiles(); showScreen("profiles"); });
document.getElementById("btn-start-practice").addEventListener("click", openLobby);
document.getElementById("history-level-filter").addEventListener("change", renderHistory);
document.getElementById("history-sort").addEventListener("change", renderHistory);
document.querySelectorAll("[data-history-view]").forEach((button) => button.addEventListener("click", () => { historyView = button.dataset.historyView; document.querySelectorAll("[data-history-view]").forEach((item) => item.classList.toggle("active", item === button)); renderHistory(); }));
document.getElementById("history-list").addEventListener("click", (event) => { if (event.target.closest("[data-start-empty]")) return openLobby(); const row = event.target.closest("[data-session-id]"); if (row) { selectedSessionId = row.dataset.sessionId; renderHistory(); } });
document.getElementById("history-preview").addEventListener("click", (event) => { const button = event.target.closest("[data-review-weakest]"); if (button) button.nextElementSibling?.scrollIntoView({ behavior: "smooth", block: "center" }); });
document.getElementById("btn-export-excel").addEventListener("click", () => exportExcel(lastReportSession));
document.getElementById("btn-close-report").addEventListener("click", () => openHistory());
window.addEventListener("perxona:report", (event) => saveReport(event.detail));

renderProfiles();
showScreen("profiles");
