// app.js – connects the buttons on the page to the camera, OCR and analyzer.

const $ = id => document.getElementById(id);

const els = {
  examTitle: $("exam-title"),
  answerKey: $("answer-key"),
  saveKey: $("save-key"),
  keyStatus: $("key-status"),
  studentName: $("student-name"),
  video: $("video"),
  photo: $("photo"),
  placeholder: $("camera-placeholder"),
  startCamera: $("start-camera"),
  snap: $("snap"),
  retake: $("retake"),
  upload: $("upload"),
  runOcr: $("run-ocr"),
  progress: document.querySelector(".progress"),
  progressBar: $("progress-bar"),
  ocrStatus: $("ocr-status"),
  ocrText: $("ocr-text"),
  groqKey: $("groq-key"),
  groqModel: $("groq-model"),
  groqVisionModel: $("groq-vision-model"),
  saveAi: $("save-ai"),
  aiStatus: $("ai-status"),
  runGrade: $("run-grade"),
  gradeStatus: $("grade-status"),
  result: $("result"),
  score: $("score"),
  percent: $("percent"),
  grade: $("grade"),
  resultRows: $("result-rows"),
  saveResult: $("save-result"),
  recordRows: $("record-rows"),
  exportCsv: $("export-csv"),
  clearRecords: $("clear-records")
};

let currentResult = null;

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

// ---------- Step 1: Answer key ----------

function loadKey() {
  const saved = Store.get("key", null);
  if (saved) {
    els.examTitle.value = saved.title;
    els.answerKey.value = saved.text;
    showKeyCount();
  }
}

function showKeyCount() {
  const key = Analyzer.parseKey(els.answerKey.value);
  const count = Object.keys(key).length;
  const marks = Object.values(key).reduce((sum, k) => sum + k.marks, 0);
  els.keyStatus.textContent = count
    ? `${count} questions, ${marks} marks`
    : "No questions found yet";
}

els.saveKey.addEventListener("click", () => {
  Store.set("key", { title: els.examTitle.value.trim(), text: els.answerKey.value });
  showKeyCount();
  els.keyStatus.textContent += " – saved ✓";
});
els.answerKey.addEventListener("input", showKeyCount);

// ---------- Step 2: Photo capture ----------

function showPhoto() {
  Camera.stop();
  els.video.hidden = true;
  els.photo.hidden = false;
  els.placeholder.hidden = true;
  els.snap.disabled = true;
  els.retake.hidden = false;
  els.runOcr.disabled = false;
}

els.startCamera.addEventListener("click", async () => {
  try {
    await Camera.start(els.video);
    els.video.hidden = false;
    els.photo.hidden = true;
    els.placeholder.hidden = true;
    els.snap.disabled = false;
    els.retake.hidden = true;
  } catch (err) {
    alert("Could not open the camera: " + err.message +
      "\n\nTip: allow camera access, or use 'Upload photo'.");
  }
});

els.snap.addEventListener("click", () => {
  Camera.snap(els.video, els.photo);
  showPhoto();
});

els.retake.addEventListener("click", () => els.startCamera.click());

els.upload.addEventListener("change", async () => {
  const file = els.upload.files[0];
  if (!file) return;
  try {
    await Camera.loadFile(file, els.photo);
    showPhoto();
  } catch (err) {
    alert(err.message);
  }
  els.upload.value = "";
});

// ---------- Step 3: OCR ----------

els.runOcr.addEventListener("click", async () => {
  els.runOcr.disabled = true;
  els.progress.hidden = false;
  els.progressBar.style.width = "0%";

  const { key, visionModel } = aiSettings();
  let aiError = null;

  try {
    if (key) {
      els.ocrStatus.textContent = "AI is reading the sheet…";
      els.progressBar.style.width = "50%";
      try {
        const text = await OCR.readWithAI(els.photo, key, visionModel);
        els.ocrText.value = text;
        // Fill in the student's name from the sheet if the teacher hasn't typed one.
        const name = text.match(/^\s*name\s*:\s*(.+)$/im);
        if (name && !els.studentName.value.trim()) els.studentName.value = name[1].trim();
        els.ocrStatus.textContent = "Read by AI. Check the text, then mark.";
        return;
      } catch (err) {
        aiError = err.message;
      }
    }

    els.ocrStatus.textContent = (aiError ? `AI could not read it (${aiError}). ` : "") +
      "Reading on this device… (the first time takes longer)";
    els.progressBar.style.width = "0%";
    const { text, confidence } = await OCR.read(els.photo, p => {
      els.progressBar.style.width = Math.round(p * 100) + "%";
    });
    els.ocrText.value = text;
    els.ocrStatus.textContent = (aiError ? `AI failed (${aiError}), read on this device. ` : "") + (text
      ? `Done. The app is ${confidence}% sure it read the text correctly.`
      : "No text found. Try a clearer, brighter photo.");
  } catch (err) {
    els.ocrStatus.textContent = "Something went wrong: " + err.message;
  } finally {
    els.runOcr.disabled = false;
    els.progress.hidden = true;
  }
});

// ---------- Step 4: Mark & grade ----------

const LABELS = { correct: "✓ Correct", wrong: "✗ Wrong", check: "? Check" };

function renderResult() {
  const { rows, total } = currentResult;
  const earned = Analyzer.score(rows);
  const percent = total ? Math.round((earned / total) * 100) : 0;
  const { grade, remark } = Analyzer.letterGrade(percent);

  Object.assign(currentResult, { earned, percent, grade, remark });

  els.score.textContent = `${earned} / ${total}`;
  els.percent.textContent = `${percent}%`;
  els.grade.innerHTML = `Grade ${grade}<br><small>${remark}</small>`;

  els.resultRows.innerHTML = "";
  rows.forEach((row, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.q}</td>
      <td>${escapeHtml(row.student) || '<span class="muted">(no answer)</span>'}
        <span class="answer-inline">Answer: ${escapeHtml(row.correct)}</span>
        ${row.feedback ? `<span class="feedback">${escapeHtml(row.feedback)}</span>` : ""}</td>
      <td class="answer-col">${escapeHtml(row.correct)}</td>
      <td>${row.awarded ?? (row.status === "correct" ? row.marks : 0)}/${row.marks}</td>
      <td><button class="tag ${row.status}" data-index="${i}">${LABELS[row.status]}</button></td>`;
    els.resultRows.appendChild(tr);
  });
  els.result.hidden = false;
}

// Teacher can tap a result to switch it between correct and wrong.
els.resultRows.addEventListener("click", e => {
  const button = e.target.closest(".tag");
  if (!button) return;
  const row = currentResult.rows[button.dataset.index];
  row.status = row.status === "correct" ? "wrong" : "correct";
  row.awarded = row.status === "correct" ? row.marks : 0;
  renderResult();
});

// ---------- AI settings ----------

// Settings saved in this browser win; otherwise use js/config.local.js if it exists.
function aiSettings() {
  const saved = Store.get("ai", {});
  const local = window.DEMASTER_CONFIG || {};
  return {
    key: saved.key || local.groqKey || "",
    model: saved.model || local.markingModel || AI.defaultModel,
    visionModel: saved.visionModel || local.visionModel || OCR.defaultVisionModel
  };
}

function loadAiSettings() {
  const { key, model, visionModel } = aiSettings();
  els.groqKey.value = key;
  els.groqModel.value = model;
  els.groqVisionModel.value = visionModel;
  els.aiStatus.textContent = key ? "AI reading and marking are on" : "AI is off";
}

els.saveAi.addEventListener("click", () => {
  Store.set("ai", {
    key: els.groqKey.value.trim(),
    model: els.groqModel.value.trim(),
    visionModel: els.groqVisionModel.value.trim()
  });
  loadAiSettings();
  els.aiStatus.textContent += " – saved ✓";
});

els.runGrade.addEventListener("click", async () => {
  if (!els.ocrText.value.trim()) {
    alert("There is no text to mark. Read a sheet in step 3 (or type the answers in).");
    return;
  }

  const { key, model } = aiSettings();
  const hasAnswerKey = Object.keys(Analyzer.parseKey(els.answerKey.value)).length > 0;
  if (!hasAnswerKey && !key) {
    alert("Type the answer key in step 1, or turn on AI marking so it can work out the answers.");
    return;
  }
  if (!key) {
    currentResult = Analyzer.grade(els.answerKey.value, els.ocrText.value);
    els.gradeStatus.textContent = "Marked with built-in rules";
    renderResult();
    return;
  }

  els.runGrade.disabled = true;
  els.gradeStatus.textContent = "AI is marking…";
  try {
    currentResult = await AI.grade(els.answerKey.value, els.ocrText.value, key, model);
    els.gradeStatus.textContent = "Marked by AI";
  } catch (err) {
    // If the AI is unavailable (no internet, bad key), still mark the sheet – if there is a key.
    if (!hasAnswerKey) {
      els.gradeStatus.textContent = "AI failed (" + err.message + "). Add an answer key to mark without AI.";
      return;
    }
    currentResult = Analyzer.grade(els.answerKey.value, els.ocrText.value);
    els.gradeStatus.textContent = "AI failed (" + err.message + "), marked with built-in rules";
  } finally {
    els.runGrade.disabled = false;
  }
  renderResult();
});

// ---------- Records ----------

function renderRecords() {
  const records = Store.get("records", []);
  els.recordRows.innerHTML = records.length ? "" :
    '<tr><td colspan="5" class="muted">No saved results yet.</td></tr>';
  records.forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.student)}</td>
      <td>${escapeHtml(r.exam)}</td>
      <td>${r.earned}/${r.total} (${r.percent}%)</td>
      <td>${r.grade}</td>
      <td><button class="link-btn" data-index="${i}" title="Delete">✕</button></td>`;
    els.recordRows.appendChild(tr);
  });
}

els.saveResult.addEventListener("click", () => {
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
  els.saveResult.textContent = "Saved ✓";
  setTimeout(() => (els.saveResult.textContent = "Save to records"), 1500);
});

els.recordRows.addEventListener("click", e => {
  const button = e.target.closest(".link-btn");
  if (!button) return;
  const records = Store.get("records", []);
  records.splice(button.dataset.index, 1);
  Store.set("records", records);
  renderRecords();
});

els.clearRecords.addEventListener("click", () => {
  if (confirm("Delete all saved results?")) {
    Store.set("records", []);
    renderRecords();
  }
});

els.exportCsv.addEventListener("click", () => {
  const records = Store.get("records", []);
  if (!records.length) return alert("No records to download.");
  const header = ["Student", "Exam", "Score", "Total", "Percent", "Grade", "Remark", "Date"];
  const lines = records.map(r =>
    [r.student, r.exam, r.earned, r.total, r.percent, r.grade, r.remark, r.date]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "exam-results.csv";
  link.click();
  URL.revokeObjectURL(link.href);
});

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

loadKey();
loadAiSettings();
renderRecords();
