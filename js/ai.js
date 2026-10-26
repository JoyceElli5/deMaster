// ai.js – AI READING AND MARKING (the "brains")
// Finds a way to reach the AI, then uses it to read photos and mark sheets.
// There are two ways in:
//   1. "own key"  – a Groq key saved on this device (or in js/config.local.js).
//                   The browser talks to Groq directly.
//   2. "school"   – the app is hosted on Vercel with the school's key kept on the
//                   server (api/ai.js). Teachers only type the school access code.
// If neither works (e.g. no internet), the app falls back to reading on the
// device with Tesseract and marking with the built-in rules (analyzer.js).

const AI = {
  mode: "off",        // "own key", "school" or "off"
  needsCode: false,   // the school server wants an access code
  badCode: false,     // the saved access code was not accepted
  settings: {},       // { key, code, readingModel, markingModel }

  // Work out which way in is available. Call again after the settings change.
  async connect(settings) {
    this.settings = settings;
    this.needsCode = false;
    this.badCode = false;
    if (settings.key) return (this.mode = "own key");

    try {
      const response = await fetch("api/ai", {
        cache: "no-store",
        headers: { "X-Access-Code": settings.code || "" }
      });
      const info = response.ok ? await response.json() : {};
      if (info.enabled) {
        this.badCode = Boolean(info.needsCode && settings.code && !info.codeOk);
        this.needsCode = Boolean(info.needsCode && !info.codeOk);
        return (this.mode = this.needsCode ? "off" : "school");
      }
    } catch {
      // No server here (e.g. running with python's http.server) or offline.
    }
    return (this.mode = "off");
  },

  get on() {
    return this.mode !== "off";
  },

  // ---------- Talking to the AI ----------

  // Called with the number of seconds left while waiting for Groq (set by app.js).
  onWait: null,

  async sendOnce(task, payload, groqRequest) {
    let response, data;
    if (this.mode === "own key") {
      response = await fetch(Groq.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + this.settings.key },
        body: JSON.stringify(groqRequest())
      });
      data = await response.json().catch(() => ({}));
      if (response.ok) {
        return task === "read" ? { text: Groq.readReply(data) } : { results: Groq.markReply(data) };
      }
      data = { error: Groq.errorMessage(response.status, data),
               retryAfter: Groq.retryAfter(response.headers.get("retry-after"), data) };
    } else {
      response = await fetch("api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Access-Code": this.settings.code || "" },
        body: JSON.stringify({ task, ...payload })
      });
      data = await response.json().catch(() => ({}));
      if (response.ok) return data;
    }

    const error = new Error(data.error || `The server returned error ${response.status}`);
    error.badCode = data.code === "bad_code";
    error.busy = response.status === 429;
    error.retryAfter = Number(data.retryAfter) || 10;
    error.hiccup = response.status >= 500;
    throw error;
  },

  // Like sendOnce, but tries again when it makes sense:
  // - Groq says it is busy: wait as long as it asks
  // - the connection dropped or the AI had a hiccup: try twice more, a few seconds apart
  async send(task, payload, groqRequest) {
    const giveUpAt = Date.now() + 90_000;
    let hiccups = 0;
    for (;;) {
      try {
        return await this.sendOnce(task, payload, groqRequest);
      } catch (err) {
        // fetch() throws a TypeError when there is no connection at all.
        const dropped = err instanceof TypeError || err.hiccup;
        if (dropped && hiccups < 2) {
          hiccups++;
          await new Promise(resolve => setTimeout(resolve, 2000 * hiccups));
          continue;
        }
        if (dropped) throw new Error("Could not reach the AI. Check the internet connection.");
        const wait = Math.min(30, Math.ceil(err.retryAfter) + 1);
        if (!err.busy || Date.now() + wait * 1000 > giveUpAt) throw err;
        for (let left = wait; left > 0; left--) {
          if (this.onWait) this.onWait(left);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  },

  // Read one photo. Returns the sheet as text (see readInstructions in groq.js).
  async read(imageDataUrl) {
    const { text } = await this.send("read", { image: imageDataUrl },
      () => Groq.readRequest(imageDataUrl, this.settings.readingModel));
    return text;
  },

  // Mark the sheet text. The answer key is optional.
  async mark(keyText, sheetText) {
    const key = Analyzer.parseKey(keyText);
    const questions = Object.keys(key).map(Number).sort((a, b) => a - b)
      .map(q => ({ q, accepted_answers: key[q].answers, marks: key[q].marks }));

    const { results } = await this.send("mark", { sheet: sheetText, questions },
      () => Groq.markRequest(questions, sheetText, this.settings.markingModel));
    return this.toRows(questions, results || []);
  },

  // Turn the AI's reply into the same shape the rest of the app uses,
  // and never trust it to give more marks than a question is worth.
  // With a key, the key decides which questions exist and what they are worth.
  // Without one, the questions come from the AI's reading of the sheet.
  toRows(questions, results) {
    const byNumber = {};
    for (const r of results) {
      const q = Number(r.q);
      if (Number.isInteger(q) && q > 0) byNumber[q] = r;
    }

    const list = questions.length
      ? questions
      : Object.keys(byNumber).map(Number).sort((a, b) => a - b).map(q => {
          const marks = Number(byNumber[q].marks);
          return {
            q,
            accepted_answers: [String(byNumber[q].expected_answer ?? "?")],
            marks: Number.isFinite(marks) && marks > 0 ? Math.min(marks, 20) : 1,
            fromAI: true
          };
        });

    let total = 0;
    const rows = list.map(({ q, accepted_answers, marks, fromAI }) => {
      total += marks;
      const r = byNumber[q] || {};
      const status = ["correct", "wrong", "check"].includes(r.status) ? r.status : "check";
      let awarded = Number(r.awarded);
      if (!Number.isFinite(awarded)) awarded = status === "correct" ? marks : 0;
      awarded = Math.min(marks, Math.max(0, awarded));

      return {
        q,
        question: String(r.question ?? ""),
        student: String(r.student_answer ?? ""),
        correct: accepted_answers.join(" / "),
        byAI: Boolean(fromAI),
        marks,
        awarded,
        status,
        feedback: String(r.feedback ?? ""),
        // Shown to the teacher when the AI disagrees with their key.
        keyNote: !fromAI && r.key_note ? String(r.key_note) : ""
      };
    });
    return { rows, total };
  }
};
