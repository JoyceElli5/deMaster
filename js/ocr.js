// ocr.js – OPTICAL CHARACTER RECOGNITION FEATURE
// Cleans up the photo (black & white, more contrast) so letters are easier
// to read, then uses Tesseract.js to turn the picture into text.

const OCR = {
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

  // Read the text. onProgress gets a number from 0 to 1.
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
  }
};
