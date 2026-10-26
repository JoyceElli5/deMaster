// ocr.js – OPTICAL CHARACTER RECOGNITION FEATURE
// Turns the photo of the sheet into text.
// With a Groq key, an AI vision model looks at the photo itself – it copes with
// handwriting, tilted pages and crossed-out answers.
// Without a key (or offline), Tesseract.js reads it on this device instead.

const OCR = {
  visionUrl: "https://api.groq.com/openai/v1/chat/completions",
  defaultVisionModel: "qwen/qwen3.8-27b",

  // Make a black-and-white copy of the photo. Returns a new canvas.
  preprocess(source) {
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0);

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = image.data;

    // 1. Convert every pixel to grey and find the average brightness.
    let total = 0;
    for (let i = 0; i < px.length; i += 4) {
      const grey = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      px[i] = px[i + 1] = px[i + 2] = grey;
      total += grey;
    }
    const average = total / (px.length / 4);

    // 2. Anything darker than the paper becomes black, the rest white.
    const threshold = average * 0.85;
    for (let i = 0; i < px.length; i += 4) {
      const value = px[i] < threshold ? 0 : 255;
      px[i] = px[i + 1] = px[i + 2] = value;
    }

    ctx.putImageData(image, 0, 0);
    return canvas;
  },

  // Read the text on this device with Tesseract. onProgress gets a number from 0 to 1.
  async read(canvas, onProgress) {
    if (typeof Tesseract === "undefined") {
      throw new Error("The OCR library did not load. Check your internet connection and refresh.");
    }
    const cleaned = this.preprocess(canvas);
    const result = await Tesseract.recognize(cleaned, "eng", {
      logger: m => {
        if (m.status === "recognizing text" && onProgress) onProgress(m.progress);
      }
    });
    return {
      text: result.data.text.trim(),
      confidence: Math.round(result.data.confidence)
    };
  },

  // Shrink the photo and turn it into a JPEG the AI can receive.
  toJpeg(canvas, maxSide = 1600) {
    const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
    const small = document.createElement("canvas");
    small.width = Math.round(canvas.width * scale);
    small.height = Math.round(canvas.height * scale);
    small.getContext("2d").drawImage(canvas, 0, 0, small.width, small.height);
    return small.toDataURL("image/jpeg", 0.85);
  },

  // Read the sheet with an AI vision model.
  async readWithAI(canvas, apiKey, model) {
    const response = await fetch(this.visionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: model || this.defaultVisionModel,
        temperature: 0,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: this.visionInstructions },
            { type: "image_url", image_url: { url: this.toJpeg(canvas) } }
          ]
        }]
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Groq returned error ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  },

  visionInstructions: `This is a photo of a student's exam sheet.
Copy it out in this exact format, in question order:

Name: <student's name, if written>
[Q1] <the printed question, with its options and marks, if the question is on the sheet>
1. <exactly what the student wrote for question 1>
[Q2] <question 2>
2. <the student's answer to question 2>

Leave out a [Q] line when the question is not on the sheet (e.g. an answer-only sheet).
Keep the student's own spelling and mistakes – do not correct or answer anything.
If something is crossed out, write it as ~~like this~~.
If you cannot read something, write [unclear].
Reply with the text only.`
};
