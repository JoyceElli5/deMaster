// api/ai.js – THE SCHOOL'S AI SERVER (runs on Vercel, not in the browser)
// Keeps the Groq key secret: phones send the photo or the sheet text here,
// this function adds the key and asks Groq, then sends back only the answer.
//
// Settings (Vercel → Project → Settings → Environment Variables):
//   GROQ_API_KEY   the school's Groq key (required for AI)
//   ACCESS_CODE    a code teachers type once, so strangers can't use up the key
//   READING_MODEL / MARKING_MODEL   optional, to change the AI models
//
// It only does the two jobs the app needs ("read" and "mark") with fixed
// instructions, so it can't be used as a general-purpose AI by anyone else.

const crypto = require("crypto");
const Groq = require("../js/groq.js");

const MAX_IMAGE_CHARS = 4_000_000; // about 3 MB of photo
const MAX_SHEET_CHARS = 20_000;
const MAX_QUESTIONS = 150;

function codeMatches(given) {
  const expected = process.env.ACCESS_CODE || "";
  if (!expected) return true;
  const a = crypto.createHash("sha256").update(String(given || "").trim().toLowerCase()).digest();
  const b = crypto.createHash("sha256").update(expected.trim().toLowerCase()).digest();
  return crypto.timingSafeEqual(a, b);
}

function cleanQuestions(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_QUESTIONS).map(item => ({
    q: Number(item.q),
    accepted_answers: (Array.isArray(item.accepted_answers) ? item.accepted_answers : [])
      .slice(0, 10).map(a => String(a).slice(0, 200)),
    marks: Math.min(20, Math.max(0, Number(item.marks) || 1))
  })).filter(item => Number.isInteger(item.q) && item.q > 0);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  // The app asks this first, to know whether AI is available here.
  if (req.method === "GET") {
    // If the app sends a code, also say whether it is right.
    return res.status(200).json({
      enabled: Boolean(process.env.GROQ_API_KEY),
      needsCode: Boolean(process.env.ACCESS_CODE),
      codeOk: codeMatches(req.headers["x-access-code"])
    });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({ error: "AI is not set up on this server" });
  }
  if (!codeMatches(req.headers["x-access-code"])) {
    return res.status(401).json({ error: "Wrong access code", code: "bad_code" });
  }

  const { task, image, sheet, questions } = req.body || {};
  let request;
  if (task === "read") {
    if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(image)) {
      return res.status(400).json({ error: "Send the photo as a JPEG, PNG or WebP" });
    }
    if (image.length > MAX_IMAGE_CHARS) return res.status(413).json({ error: "The photo is too large" });
    request = Groq.readRequest(image, process.env.READING_MODEL);
  } else if (task === "mark") {
    if (typeof sheet !== "string" || !sheet.trim()) {
      return res.status(400).json({ error: "There is no sheet text to mark" });
    }
    if (sheet.length > MAX_SHEET_CHARS) return res.status(413).json({ error: "The sheet text is too long" });
    request = Groq.markRequest(cleanQuestions(questions), sheet, process.env.MARKING_MODEL);
  } else {
    return res.status(400).json({ error: "Unknown task" });
  }

  try {
    const response = await fetch(Groq.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.GROQ_API_KEY
      },
      body: JSON.stringify(request)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // A bad school key is the server's problem, not the teacher's.
      const status = response.status === 401 ? 502 : response.status;
      const reply = { error: Groq.errorMessage(response.status, data) };
      if (response.status === 429) reply.retryAfter = Groq.retryAfter(response.headers.get("retry-after"), data);
      return res.status(status).json(reply);
    }
    return task === "read"
      ? res.status(200).json({ text: Groq.readReply(data) })
      : res.status(200).json({ results: Groq.markReply(data) });
  } catch (err) {
    return res.status(502).json({ error: "Could not reach the AI: " + err.message });
  }
};
