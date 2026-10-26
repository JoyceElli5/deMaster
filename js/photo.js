// photo.js – PHOTO CAPTURING FEATURE
// The "Take photo" button opens the phone's own camera app (sharper than a
// live preview in the browser, with autofocus and flash). This file turns the
// photo it returns into a canvas, the right way up, and makes small copies
// for the screen and for the AI.

const Photo = {
  maxSide: 2000, // bigger photos are shrunk – plenty for reading, and much faster

  // File from the <input type="file"> -> canvas.
  async load(file) {
    if (!file.type.startsWith("image/")) throw new Error("That file is not a photo.");

    let image;
    try {
      // Turns the photo the right way up using the phone's rotation info.
      image = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Could not open that photo. Try taking it again."));
        img.src = URL.createObjectURL(file);
      });
    }

    const scale = Math.min(1, this.maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    if (image.close) image.close();
    if (image.src) URL.revokeObjectURL(image.src);
    return canvas;
  },

  // Canvas -> JPEG text the AI can receive (or a small thumbnail for the screen).
  toJpeg(canvas, maxSide = 1600, quality = 0.85) {
    const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
    const small = document.createElement("canvas");
    small.width = Math.round(canvas.width * scale);
    small.height = Math.round(canvas.height * scale);
    small.getContext("2d").drawImage(canvas, 0, 0, small.width, small.height);
    return small.toDataURL("image/jpeg", quality);
  }
};
