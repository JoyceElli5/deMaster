// ocr.js – OPTICAL CHARACTER RECOGNITION ON THE DEVICE (the backup reader)
// Used only when the AI can't be reached. Tesseract.js reads printed text well,
// but handwriting often comes out wrong – the app warns the teacher when that happens.
// The library (about 15 MB with its language data) is downloaded only the first time it's needed.

const OCR = {
  libraryUrl: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",

  loadLibrary() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = this.libraryUrl;
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        reject(new Error("The backup reader could not be downloaded. Check the internet connection."));
      };
      document.head.appendChild(script);
    });
  },

  // Make a black-and-white copy of the photo. Each pixel is compared with the
  // brightness of the area around it (not the whole page), so shadows across
  // the page don't turn into black blobs.
  preprocess(source) {
    const width = source.width, height = source.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0);
    const image = ctx.getImageData(0, 0, width, height);
    const px = image.data;

    // 1. Grey value of every pixel, and running totals so the brightness
    //    of any rectangle can be found quickly (an "integral image").
    const grey = new Float32Array(width * height);
    const sums = new Float64Array((width + 1) * (height + 1));
    for (let y = 0; y < height; y++) {
      let rowSum = 0;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        grey[y * width + x] = g;
        rowSum += g;
        sums[(y + 1) * (width + 1) + x + 1] = sums[y * (width + 1) + x + 1] + rowSum;
      }
    }

    // 2. A pixel is ink if it is clearly darker than the area around it.
    const half = Math.max(8, Math.round(Math.min(width, height) / 32));
    for (let y = 0; y < height; y++) {
      const y1 = Math.max(0, y - half), y2 = Math.min(height, y + half + 1);
      for (let x = 0; x < width; x++) {
        const x1 = Math.max(0, x - half), x2 = Math.min(width, x + half + 1);
        const area = (x2 - x1) * (y2 - y1);
        const total = sums[y2 * (width + 1) + x2] - sums[y1 * (width + 1) + x2]
                    - sums[y2 * (width + 1) + x1] + sums[y1 * (width + 1) + x1];
        const value = grey[y * width + x] < (total / area) * 0.85 ? 0 : 255;
        const i = (y * width + x) * 4;
        px[i] = px[i + 1] = px[i + 2] = value;
      }
    }

    ctx.putImageData(image, 0, 0);
    return canvas;
  },

  // Read the text. onProgress gets a number from 0 to 1.
  async read(canvas, onProgress) {
    await this.loadLibrary();
    const result = await Tesseract.recognize(this.preprocess(canvas), "eng", {
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
