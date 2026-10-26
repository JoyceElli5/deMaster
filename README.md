# deMaster – Exam Marker

A web app that photographs a student's exam sheet, reads the handwriting, and marks it.
Built with plain HTML, CSS and JavaScript, plus one small server function for the AI.

## How a teacher uses it

1. **Exam** – type the exam title. The answer key is optional: without one, the AI works
   out the answers from the questions on the sheet.
2. **Take photo of sheet** – opens the phone's camera. Add more pages if the sheet has them.
3. **Read & mark** – the AI reads the photo (handwriting, crossed-out words, the student's
   name) and marks every answer.
4. **Check** – answers marked **? Check** need a look: the writing was unclear, or the student
   may be right even though the key says otherwise. Tap any result to change it.
5. **Save & mark next student** – the result goes into **Saved results**, ready to download as CSV.

### Answer key format

One answer per line: `1. B`, `3. photosynthesis`. Marks go in brackets: `5. Accra [2]`
(default is 1 mark). More than one right answer: `6. half | 0.5`.

When there is a key, the key leads – but the AI also flags answers that are right but
missing from the key, and key answers that look wrong.

## How the AI is set up

The AI runs on [Groq](https://console.groq.com):
`qwen/qwen3.8-27b` reads the photo, `openai/gpt-oss-120b` does the marking.

### On Vercel (for the school)

The Groq key stays on the server (`api/ai.js`), so it is never sent to phones and never
appears in this public repository. Teachers type a school **access code** once per phone,
so strangers who find the link can't use up the school's Groq account.

Set these in Vercel → Project → Settings → Environment Variables, then redeploy:

| Name | What it is |
|------|------------|
| `GROQ_API_KEY` | The school's Groq key (required) |
| `ACCESS_CODE` | The code teachers type (recommended) |
| `READING_MODEL`, `MARKING_MODEL` | Optional, to change models |

Groq's free plan reads about 3 photos a minute. If teachers hit the limit, the app waits
and tries again by itself; a paid Groq plan removes the wait.

### On your own computer

```bash
cp js/config.example.js js/config.local.js   # then put your Groq key in it
python3 -m http.server 8000
```

Open http://localhost:8000. `js/config.local.js` is ignored by git and by Vercel.
Or open **Settings** (the gear) and paste a key there – it is saved on that device only.

**Never put a key in any other file** – this repository is public.

### Without AI

With no internet or no AI set up, the app reads the photo on the device with Tesseract.js
and marks with built-in rules. That works for printed text and neat block capitals, but
handwriting often comes out wrong, so the app asks the teacher to check the text first.
Without AI, an answer key is required.

## Files

| File | What it does |
|------|--------------|
| `index.html` | The page layout |
| `css/style.css` | How it looks (phone first, dark mode) |
| `js/photo.js` | Turns the camera photo into an image, the right way up |
| `js/groq.js` | The instructions sent to the AI – shared by the browser and the server |
| `js/ai.js` | Reaches the AI (school server or own key), retries when it's busy |
| `api/ai.js` | Vercel server function that keeps the Groq key secret |
| `js/ocr.js` | Backup reader on the device (Tesseract.js) |
| `js/analyzer.js` | Built-in marking rules and the Ghana 1–9 grading scale |
| `js/app.js` | Connects the page to everything else |

## Tips for good photos

- Lay the page flat in good light and fill the screen with it.
- One photo per page; add each page of a sheet.
- Answers numbered like the questions (`1.`, `2.` …) are easiest to match.
