// app.js – connects the page to the photo, AI, OCR and analyzer code.
// The flow for each student: take photo(s) → "Read & mark" → check → "Save & next".

const $ = id => document.getElementById(id);

const els = {
  aiPill: $("ai-pill"),
  openSettings: $("open-settings"),
  codeBanner: $("code-banner"),
  bannerCode: $("banner-code"),
  bannerError: $("banner-error"),
  examTitle: $("exam-title"),
  keyDetails: $("key-details"),
  answerKey: $("answer-key"),
  keySummary: $("key-summary"),
  pages: $("pages"),
  takePhoto: $("take-photo"),
  takeText: $("take-text"),
  pickPhoto: $("pick-photo"),
  studentName: $("student-name"),
  run: $("run"),
  status: $("status"),
  statusText: $("status-text"),
  progressBar: $("progress-bar"),
  notice: $("notice"),
  resultCard: $("result-card"),
  score: $("score"),
  resultName: $("result-name"),
  grade: $("grade"),
  resultSummary: $("result-summary"),
  resultList: $("result-list"),
  textDetails: $("text-details"),
  sheetText: $("sheet-text"),
  remark: $("remark"),
  saveNext: $("save-next"),
  discard: $("discard"),
  recordList: $("record-list"),
  recordsSummary: $("records-summary"),
  exportCsv: $("export-csv"),
  clearRecords: $("clear-records"),
  settings: $("settings"),
  settingsForm: $("settings-form"),
  settingsStatus: $("settings-status"),
  setCode: $("set-code"),
  setKey: $("set-key"),
  setReading: $("set-reading"),
  setMarking: $("set-marking"),
  ownKey: $("own-key")
};

const MAX_PAGES = 6;
let pages = [];           // canvases of the current student's sheet
let currentResult = null; // { rows, total, earned, percent, grade, remark }
let busy = false;

// ---------- Saving data in the browser ----------

const Store = {
  get(name, fallback) {
    try {
      return JSON.parse(localStorage.getItem("demaster-" + name)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(name, value) {
    try {
      localStorage.setItem("demaster-" + name, JSON.stringify(value));
    } catch {
      // Storage may be blocked (e.g. private mode); the app still works without it.
    }
  }
};

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------- AI settings ----------

// Settings saved on this device win; otherwise use js/config.local.js if it exists.
function aiSettings() {
  const saved = Store.get("ai", {});
  const local = window.DEMASTER_CONFIG || {};
  return {
    code: saved.code || "",
    key: saved.key || local.groqKey || "",
    readingModel: saved.readingModel || saved.visionModel || local.visionModel || "",
    markingModel: saved.markingModel || saved.model || local.markingModel || ""
  };
}

function saveAiSettings(changes) {
  Store.set("ai", { ...Store.get("ai", {}), ...changes });
}

async function connectAi() {
  els.aiPill.className = "pill";
  els.aiPill.textContent = "Checking AI…";
  await AI.connect(aiSettings());

  els.codeBanner.hidden = !AI.needsCode;
  els.bannerError.hidden = !AI.badCode;
  els.bannerError.textContent = "That access code was not accepted. Check it and try again.";
  if (AI.on) {
    els.aiPill.className = "pill on";
    els.aiPill.textContent = "AI on";
  } else {
    els.aiPill.className = "pill off";
    els.aiPill.textContent = AI.needsCode ? "Code needed" : "Offline mode";
  }
  showKeySummary();
}

function describeAi() {
  if (AI.mode === "own key") return "AI is on, using your own Groq key.";
  if (AI.mode === "school") return "AI is on, using the school's AI.";
  if (AI.badCode) return "The access code was not accepted. Check it and save again.";
  if (AI.needsCode) return "Enter the school access code to turn on AI reading.";
  return "AI is off. Sheets are read on this device, which works for print but often not for handwriting.";
}

els.aiPill.addEventListener("click", openSettings);
els.openSettings.addEventListener("click", openSettings);

function openSettings() {
  const s = aiSettings();
  els.setCode.value = s.code;
  els.setKey.value = Store.get("ai", {}).key || "";
  els.setReading.value = s.readingModel;
  els.setReading.placeholder = Groq.readingModel;
  els.setMarking.value = s.markingModel;
  els.setMarking.placeholder = Groq.markingModel;
  els.ownKey.open = Boolean(els.setKey.value);
  els.settingsStatus.textContent = describeAi();
  els.settings.showModal();
}

els.settings.addEventListener("close", async () => {
  if (els.settings.returnValue !== "save") return;
  saveAiSettings({
    code: els.setCode.value.trim(),
    key: els.setKey.value.trim(),
    readingModel: els.setReading.value.trim(),
    markingModel: els.setMarking.value.trim()
  });
  await connectAi();
});

els.codeBanner.addEventListener("submit", async e => {
  e.preventDefault();
  const code = els.bannerCode.value.trim();
  if (!code) return;
  saveAiSettings({ code });
  await connectAi();
  if (AI.on) els.bannerCode.value = "";
});

// ---------- The exam and answer key ----------

function loadExam() {
  const saved = Store.get("key", null);
  if (saved) {
    els.examTitle.value = saved.title || "";
    els.answerKey.value = saved.text || "";
  }
  els.keyDetails.open = Boolean(els.answerKey.value.trim());
  showKeySummary();
}

function saveExam() {
  Store.set("key", { title: els.examTitle.value.trim(), text: els.answerKey.value });
  showKeySummary();
}

function keyQuestionCount() {
  return Object.keys(Analyzer.parseKey(els.answerKey.value)).length;
}

function showKeySummary() {
  const key = Analyzer.parseKey(els.answerKey.value);
  const count = Object.keys(key).length;
  const marks = Object.values(key).reduce((sum, k) => sum + k.marks, 0);
  els.keySummary.textContent = count
    ? `${count} question${count === 1 ? "" : "s"} · ${marks} mark${marks === 1 ? "" : "s"}`
    : AI.on ? "AI works out the answers" : "Add an answer key";
}

els.examTitle.addEventListener("input", saveExam);
els.answerKey.addEventListener("input", saveExam);

// ---------- Photos ----------

function renderPages() {
  els.pages.innerHTML = "";
  pages.forEach((page, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <img src="${page.thumb}" alt="Page ${i + 1}">
      <span class="page-no">Page ${i + 1}</span>
      <button class="remove" type="button" data-index="${i}" aria-label="Remove page ${i + 1}">✕</button>`;
    els.pages.appendChild(li);
  });
  els.takeText.textContent = pages.length ? "Add another page" : "Take photo of sheet";
  els.run.disabled = busy || pages.length === 0;
}

async function addPhotos(files) {
  hideNotice();
  for (const file of files) {
    if (pages.length >= MAX_PAGES) {
      showNotice(`A sheet can have up to ${MAX_PAGES} pages.`);
      break;
    }
    try {
      const canvas = await Photo.load(file);
      pages.push({ canvas, thumb: Photo.toJpeg(canvas, 300, 0.7) });
    } catch (err) {
      showNotice(err.message, true);
    }
  }
  renderPages();
}

els.takePhoto.addEventListener("change", async () => {
  await addPhotos([...els.takePhoto.files]);
  els.takePhoto.value = "";
});
els.pickPhoto.addEventListener("change", async () => {
  await addPhotos([...els.pickPhoto.files]);
  els.pickPhoto.value = "";
});

els.pages.addEventListener("click", e => {
  const button = e.target.closest(".remove");
  if (!button || busy) return;
  pages.splice(Number(button.dataset.index), 1);
  renderPages();
});

// ---------- Progress and messages ----------

function showStatus(text, progress) {
  els.status.hidden = false;
  els.statusText.textContent = text;
  if (progress !== undefined) els.progressBar.style.width = Math.round(progress * 100) + "%";
}

function hideStatus() {
  els.status.hidden = true;
  els.progressBar.style.width = "0%";
}

function showNotice(text, bad = false) {
  els.notice.textContent = text;
  els.notice.className = bad ? "notice bad" : "notice";
  els.notice.hidden = false;
}

function hideNotice() {
  els.notice.hidden = true;
}

function setBusy(value) {
  busy = value;
  els.run.disabled = value || pages.length === 0;
  els.remark.disabled = value;
  els.saveNext.disabled = value;
}

// ---------- Reading ----------

// Reads every page. Uses the AI when it can, otherwise Tesseract on this device.
// Returns { text, usedDevice } – usedDevice is true if any page was read without AI.
async function readPages() {
  const texts = [];
  let usedDevice = false;
  let aiProblem = "";

  for (let i = 0; i < pages.length; i++) {
    const label = pages.length > 1 ? ` page ${i + 1} of ${pages.length}` : " the sheet";
    const base = i / pages.length;
    let text = null;

    if (AI.on) {
      showStatus(`Reading${label}…`, base + 0.5 / pages.length);
      AI.onWait = seconds => showStatus(`The free AI plan allows only a few photos a minute. Reading${label} in ${seconds}s…`);
      try {
        text = await AI.read(Photo.toJpeg(pages[i].canvas));
      } catch (err) {
        if (err.badCode) {
          await connectAi();
          throw new Error("The access code was not accepted.");
        }
        aiProblem = err.message;
      }
    }

    if (text === null) {
      usedDevice = true;
      showStatus(`Reading${label} on this device… (the first time takes longer)`, base);
      try {
        const result = await OCR.read(pages[i].canvas, p => {
          els.progressBar.style.width = Math.round((base + p / pages.length) * 100) + "%";
        });
        text = result.text;
      } catch (err) {
        throw new Error(aiProblem
          ? `The AI could not read the photo (${aiProblem}), and the backup reader failed too (${err.message}).`
          : err.message);
      }
    }
    texts.push(pages.length > 1 ? `--- Page ${i + 1} ---\n${text}` : text);
  }

  return { text: texts.join("\n\n").trim(), usedDevice, aiProblem };
}

function nameFromSheet(text) {
  const match = text.match(/^\s*name\s*:\s*(.+)$/im);
  const name = match ? match[1].replace(/\[unclear\]|~~.*?~~/gi, "").trim() : "";
  return /[a-z]/i.test(name) ? name : "";
}

// ---------- Marking ----------

// Marks the sheet text. Returns true if there is a result to show.
async function markText(text) {
  const hasKey = keyQuestionCount() > 0;

  if (AI.on) {
    showStatus("Marking…", 0.9);
    AI.onWait = seconds => showStatus(`The AI is busy. Marking in ${seconds}s…`);
    try {
      currentResult = await AI.mark(els.answerKey.value, text);
      currentResult.markedBy = "AI";
      return true;
    } catch (err) {
      if (!hasKey) {
        showNotice(`The AI could not mark this sheet (${err.message}). Try again, or add an answer key to mark without AI.`, true);
        return false;
      }
      showNotice(`The AI could not mark this sheet (${err.message}), so it was marked with the built-in rules. Look at the answers carefully.`);
    }
  } else if (!hasKey) {
    showNotice("Without AI, the app needs an answer key to mark. Add one under Exam → Answer key, then tap Mark again.");
    return false;
  }

  currentResult = Analyzer.grade(els.answerKey.value, text);
  currentResult.markedBy = "rules";
  return true;
}

els.run.addEventListener("click", async () => {
  if (!pages.length || busy) return;
  setBusy(true);
  hideNotice();
  els.resultCard.hidden = true;

  try {
    const { text, usedDevice, aiProblem } = await readPages();
    els.sheetText.value = text;
    if (!els.studentName.value.trim()) els.studentName.value = nameFromSheet(text);

    if (!text) {
      showNotice("No writing was found in the photo. Take it again, closer and in better light.", true);
      return;
    }
    if (usedDevice) {
      showNotice((aiProblem ? `The AI could not read the photo (${aiProblem}). ` : "") +
        "It was read on this device instead, which often gets handwriting wrong. " +
        "Check the text under \"Text read from the sheet\" and fix it before trusting the marks.");
    }

    if (await markText(text)) {
      renderResult();
      els.textDetails.open = usedDevice;
      els.resultCard.hidden = false;
      els.resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      // Nothing to show yet, but let the teacher see and fix the text.
      renderTextOnly();
    }
  } catch (err) {
    showNotice("Something went wrong: " + err.message, true);
  } finally {
    hideStatus();
    setBusy(false);
  }
});

// The teacher fixed the text (or added a key) – mark it again.
els.remark.addEventListener("click", async () => {
  const text = els.sheetText.value.trim();
  if (!text || busy) return;
  setBusy(true);
  hideNotice();
  try {
    if (await markText(text)) {
      renderResult();
      els.resultCard.hidden = false;
    }
  } finally {
    hideStatus();
    setBusy(false);
  }
});

// ---------- Showing the result ----------

const LABELS = { correct: "✓ Correct", wrong: "✗ Wrong", check: "? Check" };

function renderTextOnly() {
  currentResult = null;
  els.score.textContent = "Not marked";
  els.resultName.textContent = els.studentName.value.trim();
  els.grade.hidden = true;
  els.resultSummary.textContent = "";
  els.resultList.innerHTML = "";
  els.textDetails.open = true;
  els.saveNext.hidden = true;
  els.resultCard.hidden = false;
}

function renderResult() {
  const { rows, total } = currentResult;
  const earned = Analyzer.score(rows);
  const percent = total ? Math.round((earned / total) * 100) : 0;
  const { grade, remark } = Analyzer.letterGrade(percent);
  Object.assign(currentResult, { earned, percent, grade, remark });

  els.score.textContent = `${earned} / ${total}`;
  els.resultName.textContent = [els.studentName.value.trim(), `${percent}%`].filter(Boolean).join(" · ");
  els.grade.hidden = false;
  els.grade.innerHTML = `Grade ${grade}<small>${remark}</small>`;
  els.saveNext.hidden = false;

  const toCheck = rows.filter(r => r.status === "check").length;
  const keyNotes = rows.filter(r => r.keyNote).length;
  els.resultSummary.textContent = [
    currentResult.markedBy === "AI" ? "Marked by AI." : "Marked with the built-in rules.",
    toCheck ? `${toCheck} answer${toCheck === 1 ? " needs" : "s need"} you to check ${toCheck === 1 ? "it" : "them"} (they earn no marks until you do).` : "",
    keyNotes ? `The AI has ${keyNotes} note${keyNotes === 1 ? "" : "s"} about your answer key.` : "",
    "Tap a result to change it."
  ].filter(Boolean).join(" ");

  els.resultList.innerHTML = "";
  rows.forEach((row, i) => {
    const li = document.createElement("li");
    li.className = "q " + row.status;
    const awarded = row.awarded ?? (row.status === "correct" ? row.marks : 0);
    li.innerHTML = `
      <div class="q-top">
        <div>
          <span class="q-num">Q${row.q}</span>
          <span class="muted"> · ${awarded}/${row.marks} mark${row.marks === 1 ? "" : "s"}</span>
        </div>
        <button class="tag ${row.status}" type="button" data-index="${i}">${LABELS[row.status]}</button>
      </div>
      ${row.question ? `<p class="q-question">${escapeHtml(row.question)}</p>` : ""}
      <p class="q-line"><span class="label">Student:</span><span class="q-student">${escapeHtml(row.student) || '<span class="muted">(no answer)</span>'}</span></p>
      <p class="q-line"><span class="label">${row.byAI ? "Answer (by AI):" : "Answer:"}</span>${escapeHtml(row.correct)}</p>
      ${row.feedback ? `<p class="q-feedback">${escapeHtml(row.feedback)}</p>` : ""}
      ${row.keyNote ? `<p class="q-note">Note on your key: ${escapeHtml(row.keyNote)}</p>` : ""}`;
    els.resultList.appendChild(li);
  });
}

// Tap a result to switch it: check → correct → wrong → correct …
els.resultList.addEventListener("click", e => {
  const button = e.target.closest(".tag");
  if (!button || !currentResult) return;
  const row = currentResult.rows[button.dataset.index];
  row.status = row.status === "correct" ? "wrong" : "correct";
  row.awarded = row.status === "correct" ? row.marks : 0;
  renderResult();
});

// ---------- Next student ----------

function resetSheet() {
  pages = [];
  currentResult = null;
  els.studentName.value = "";
  els.sheetText.value = "";
  els.resultCard.hidden = true;
  els.textDetails.open = false;
  hideNotice();
  renderPages();
}

els.saveNext.addEventListener("click", () => {
  if (!currentResult) return;
  const records = Store.get("records", []);
  records.push({
    student: els.studentName.value.trim() || "Unnamed student",
    exam: els.examTitle.value.trim() || "Untitled exam",
    earned: currentResult.earned,
    total: currentResult.total,
    percent: currentResult.percent,
    grade: currentResult.grade,
    remark: currentResult.remark,
    date: new Date().toISOString().slice(0, 10)
  });
  Store.set("records", records);
  renderRecords();
  resetSheet();
  document.getElementById("mark-card").scrollIntoView({ behavior: "smooth", block: "start" });
});

els.discard.addEventListener("click", () => {
  if (confirm("Discard this result and the photos?")) resetSheet();
});

// ---------- Records ----------

function renderRecords() {
  const records = Store.get("records", []);
  els.recordList.innerHTML = records.length ? "" : '<li class="empty">No saved results yet.</li>';

  // Newest first.
  records.map((r, i) => ({ r, i })).reverse().forEach(({ r, i }) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="who"><strong>${escapeHtml(r.student)}</strong><span>${escapeHtml(r.exam)} · ${escapeHtml(r.date || "")}</span></div>
      <div class="mark">${r.earned}/${r.total}<span>${r.percent}% · Grade ${escapeHtml(r.grade)}</span></div>
      <button class="delete" type="button" data-index="${i}" aria-label="Delete ${escapeHtml(r.student)}">✕</button>`;
    els.recordList.appendChild(li);
  });

  if (records.length) {
    const average = Math.round(records.reduce((sum, r) => sum + r.percent, 0) / records.length);
    els.recordsSummary.textContent = `${records.length} saved · average ${average}%`;
  } else {
    els.recordsSummary.textContent = "";
  }
}

els.recordList.addEventListener("click", e => {
  const button = e.target.closest(".delete");
  if (!button) return;
  const records = Store.get("records", []);
  const record = records[button.dataset.index];
  if (!record || !confirm(`Delete the result for ${record.student}?`)) return;
  records.splice(button.dataset.index, 1);
  Store.set("records", records);
  renderRecords();
});

els.clearRecords.addEventListener("click", () => {
  if (confirm("Delete all saved results? Download the CSV first if you need them.")) {
    Store.set("records", []);
    renderRecords();
  }
});

els.exportCsv.addEventListener("click", () => {
  const records = Store.get("records", []);
  if (!records.length) return alert("No saved results to download.");
  const header = ["Student", "Exam", "Score", "Total", "Percent", "Grade", "Remark", "Date"];
  const lines = records.map(r =>
    [r.student, r.exam, r.earned, r.total, r.percent, r.grade, r.remark, r.date]
      .map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "exam-results.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

// ---------- Start ----------

loadExam();
renderPages();
renderRecords();
connectAi();
