// camera.js – PHOTO CAPTURING FEATURE
// Opens the device camera, shows a live preview, and takes a still photo
// onto a <canvas>. Also lets the user upload an existing photo instead.

const Camera = {
  stream: null,

  // Turn on the camera. Prefers the back camera on phones.
  async start(video) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("This browser cannot open the camera. Use 'Upload photo' instead.");
    }
    this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });
    video.srcObject = this.stream;
    await video.play();
  },

  // Turn off the camera so the light goes off and battery is saved.
  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  },

  // Copy the current video frame onto the canvas (this is the "photo").
  snap(video, canvas) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
  },

  // Draw an uploaded image file onto the canvas.
  loadFile(file, canvas) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Shrink very large photos so OCR runs faster.
        const maxSide = 2000;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(img.src);
        resolve();
      };
      img.onerror = () => reject(new Error("Could not open that image."));
      img.src = URL.createObjectURL(file);
    });
  }
};
