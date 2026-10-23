# deMaster – Exam Marker

A web app that photographs a student's exam sheet, reads it, and marks it.
Built with plain HTML, CSS and JavaScript.

## How to run

The camera only works on a "secure" page, so start a small local server
instead of double-clicking `index.html`:

```bash
cd deMaster
python3 -m http.server 8000
```

Then open http://localhost:8000 in Chrome, Edge or Safari.
You need internet the first time, because the OCR library loads from the web.

## How to use

1. **Answer key** – type one answer per line, e.g. `1. B`, `3. photosynthesis`, `5. Accra [2]`.
   `[2]` means the question is worth 2 marks. Use `|` for more than one accepted answer: `6. half | 0.5`.
2. **Capture** – start the camera and take a photo, or upload one.
3. **Read** – the app reads the text from the photo. Fix any mistakes in the box.
4. **Mark** – the app compares each answer to the key and gives a score and grade (1–9).
   Tap a result to change it. Answers marked **? Check** might be right, so look at them yourself.

## Files

| File | What it does |
|------|--------------|
| `index.html` | The page layout |
| `css/style.css` | How it looks |
| `js/camera.js` | Photo capture |
| `js/ocr.js` | Cleans the photo and reads the text (uses Tesseract.js) |
| `js/analyzer.js` | Understands the answers and marks them |
| `js/app.js` | Connects the buttons to everything else |

## Tips for good results

- Students should write each answer on its own line, starting with the question number: `1. B`.
- Use good light, hold the phone straight above the page, and avoid shadows.
- Printed or neat block-capital handwriting reads best. Joined-up handwriting is hard for OCR.
