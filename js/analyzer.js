// analyzer.js – THE ANALYZER
// 1. Understands the answer key the teacher typed.
// 2. Understands the text OCR read from the student's sheet.
// 3. Compares them question by question and works out the score and grade.

const Analyzer = {
  // ---------- Reading the answer key ----------

  // "5. Accra | Akra [2]"  ->  { 5: { answers: ["accra", "akra"], marks: 2 } }
  parseKey(text) {
    const key = {};
    for (const line of text.split("\n")) {
      const match = line.match(/^\s*(?:q(?:uestion)?\.?\s*)?(\d{1,3})\s*[.):\-]?\s*(.+)$/i);
      if (!match) continue;

      let answer = match[2].trim();
      let marks = 1;
      const marksMatch = answer.match(/\[\s*(\d+(?:\.\d+)?)\s*\]\s*$/);
      if (marksMatch) {
        marks = parseFloat(marksMatch[1]);
        answer = answer.slice(0, marksMatch.index).trim();
      }
      const answers = answer.split("|").map(a => a.trim()).filter(Boolean);
      if (answers.length) key[parseInt(match[1], 10)] = { answers, marks };
    }
    return key;
  },

  // ---------- Reading the student's sheet ----------

  // Finds every "number + answer" on the sheet, even when several are on one
  // line, e.g. "1. B   2. C   3) A".
  // On sheets with printed questions ("1. Who was the first President?") the
  // student's answer is on the line below, so that line is used instead.
  parseSheet(text) {
    const answers = {};
    const marker = /(?:^|\s)(?:q(?:uestion)?\.?\s*)?([0-9lI|]{1,3})\s*[.):\-](?!\d)\s*/gi;
    let waitingFor = null; // question number whose answer should be on the next line
    const startsWithNumber = line => /^(?:q(?:uestion)?\.?\s*)?\d{1,3}\s*[.):\-]\s*\S/i.test(line);
    // A number then a long sentence, even with the dot lost: "5 What do we call a person who…"
    const startsLikeQuestion = line => /^(?:q(?:uestion)?\.?\s*)?\d{1,3}\s+\S+(\s+\S+){3,}/i.test(line);

    const lines = text.split("\n")
      // Drop crossed-out words, written as ~~like this~~.
      .map(line => line.replace(/~~.*?~~/g, " "))
      // Ruled lines on the paper often come out as dashes, quotes or underscores at the ends.
      .map(line => line.replace(/^[\s\-–—_~"“”'‘’`.,:;|]+(?=\S)/, "").replace(/[\s\-–—_~]+$/, "").trim())
      .filter(line => line && !/^---\s*page/i.test(line) && /[\p{L}\p{N}]/u.test(line));

    for (const [index, line] of lines.entries()) {

      // The line after a printed question is the student's answer.
      if (waitingFor !== null) {
        if (!startsWithNumber(line) && !startsLikeQuestion(line)) {
          answers[waitingFor] ??= line;
          waitingFor = null;
          continue;
        }
        waitingFor = null;
      }

      // (The dot after the number is often lost when reading a photo: "1 Who was…".)
      const question = line.match(/^(?:q(?:uestion)?\.?\s*)?(\d{1,3})(?:\s*[.):\-]\s*|\s+)(.+)$/i);
      const next = lines[index + 1];
      if (question && this.looksLikeQuestion(question[2], next !== undefined && !startsWithNumber(next))) {
        waitingFor = parseInt(question[1], 10);
        continue;
      }

      const found = [...line.matchAll(marker)]
        .map(m => ({ num: this.fixNumber(m[1]), start: m.index, end: m.index + m[0].length }))
        .filter(m => m.num !== null);

      // A line like "4 12" with no dot: number, space, answer.
      if (found.length === 0) {
        const plain = line.match(/^(\d{1,3})\s+(.+)$/);
        if (plain) answers[parseInt(plain[1], 10)] ??= plain[2].trim();
        continue;
      }
      // Only trust markers at the start of the line or after a gap of answers.
      if (found[0].start > 1) continue;

      found.forEach((m, i) => {
        const next = found[i + 1];
        const answer = line.slice(m.end, next ? next.start : line.length).trim();
        answers[m.num] ??= answer;
      });
    }
    return answers;
  },

  // "Who was the first President of Ghana?", "15 × 4 = ?", "Water turns to ____. (2 marks)",
  // or any longer sentence with an un-numbered line (the answer) under it.
  looksLikeQuestion(text, answerLineBelow) {
    const t = text.trim();
    if (t.length <= 12) return false;
    if (/[?:=]\s*\??\s*$/.test(t) || /_{3,}/.test(t) || /\(\s*\d+\s*marks?\s*\)\s*$/i.test(t)) return true;
    return answerLineBelow && t.split(/\s+/).length >= 4;
  },

  // OCR often reads "1" as "l", "I" or "|". Turn those back into numbers.
  fixNumber(token) {
    const fixed = token.replace(/[lI|]/g, "1");
    return /^\d+$/.test(fixed) ? parseInt(fixed, 10) : null;
  },

  // ---------- Comparing answers ----------

  normalize(text) {
    return text
      .toLowerCase()
      .replace(/[“”"'`]/g, "")
      .replace(/[^\p{L}\p{N}.\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .replace(/[.\s-]+$/, "")
      .trim();
  },

  isLetterChoice(answer) {
    return /^[a-e]$/i.test(answer.trim());
  },

  isNumber(answer) {
    return /^-?\d+(\.\d+)?$/.test(answer.trim());
  },

  // Pull a letter choice (A–E) out of what the student wrote, e.g. "(b)", "B.", "8".
  readLetter(studentAnswer) {
    const cleaned = studentAnswer.trim().replace(/^[\s([{]+/, "");
    const first = cleaned.charAt(0).toLowerCase();
    if (/[a-e]/.test(first) && !/[a-z]/i.test(cleaned.charAt(1))) return { letter: first, guessed: false };
    // Common OCR mix-ups for letters.
    const lookalikes = { "8": "b", "6": "b", "4": "a", "0": "d", "3": "e", "€": "e" };
    if (lookalikes[first]) return { letter: lookalikes[first], guessed: true };
    return { letter: cleaned.toLowerCase(), guessed: false };
  },

  readNumber(studentAnswer) {
    const fixed = studentAnswer
      .replace(/[oO]/g, "0")
      .replace(/[lI|]/g, "1")
      .replace(/[sS]/g, "5")
      .replace(/,/g, "");
    const match = fixed.match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
  },

  // How alike two words are, from 0 (totally different) to 1 (identical).
  similarity(a, b) {
    if (a === b) return 1;
    if (!a.length || !b.length) return 0;
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let diag = prev[0];
      prev[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const temp = prev[j];
        prev[j] = Math.min(
          prev[j] + 1,
          prev[j - 1] + 1,
          diag + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
        diag = temp;
      }
    }
    return 1 - prev[b.length] / Math.max(a.length, b.length);
  },

  // Returns "correct", "wrong" or "check" (= probably right, teacher should look).
  compare(studentAnswer, accepted) {
    if (!studentAnswer || !studentAnswer.trim()) return "wrong";
    let best = "wrong";

    for (const correct of accepted) {
      let result = "wrong";

      if (this.isLetterChoice(correct)) {
        const { letter, guessed } = this.readLetter(studentAnswer);
        if (letter === correct.trim().toLowerCase()) result = guessed ? "check" : "correct";
      } else if (this.isNumber(correct)) {
        const value = this.readNumber(studentAnswer);
        if (value !== null && Math.abs(value - parseFloat(correct)) < 1e-6) result = "correct";
      } else {
        const s = this.normalize(studentAnswer);
        const c = this.normalize(correct);
        const score = this.similarity(s, c);
        const containsWord = new RegExp(`(^|\\s)${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(s);
        if (score >= 0.85 || containsWord) result = "correct";
        else if (score >= 0.65) result = "check";
      }

      if (result === "correct") return "correct";
      if (result === "check") best = "check";
    }
    return best;
  },

  // ---------- Putting it all together ----------

  grade(keyText, sheetText) {
    const key = this.parseKey(keyText);
    const sheet = this.parseSheet(sheetText);
    const rows = [];
    let total = 0;

    const numbers = Object.keys(key).map(Number).sort((a, b) => a - b);
    for (const q of numbers) {
      const { answers, marks } = key[q];
      const student = sheet[q] || "";
      const status = this.compare(student, answers);
      rows.push({ q, student, correct: answers.join(" / "), marks, status });
      total += marks;
    }
    return { rows, total };
  },

  // Marks earned. "check" answers earn nothing until the teacher confirms them.
  // AI marking can give part marks, which are stored in "awarded".
  score(rows) {
    const total = rows.reduce((sum, r) =>
      sum + (r.awarded ?? (r.status === "correct" ? r.marks : 0)), 0);
    return Math.round(total * 100) / 100;
  },

  // Ghana JHS / BECE-style grading scale (1 = best, 9 = lowest).
  letterGrade(percent) {
    const scale = [
      [80, "1", "Highest"],
      [70, "2", "Higher"],
      [60, "3", "High"],
      [55, "4", "High Average"],
      [50, "5", "Average"],
      [45, "6", "Low Average"],
      [40, "7", "Low"],
      [35, "8", "Lower"],
      [0, "9", "Lowest"]
    ];
    const [, grade, remark] = scale.find(([min]) => percent >= min);
    return { grade, remark };
  }
};
