# Triage-Aware Heart Risk Assistant — Frontend

A React + Vite frontend for the heart disease risk classification project
(SVM vs. Bayesian Logistic Regression), with a Patient View and a
Clinician View.

## Why this folder, not just the one file

A single `.jsx` file is only the *component* — it isn't something a browser
can open directly. Running it needs three more things, which is what the
rest of this folder provides:

- **`index.html`** — the actual page the browser loads. It has one empty
  `<div id="root">` and a script tag pointing at `src/main.jsx`.
- **`src/main.jsx`** — the entry point that takes your React component and
  mounts it into that empty `<div>`.
- **`package.json` + `vite.config.js`** — tell Node which packages to
  install (React itself, plus Vite as the dev server/bundler) and how to
  run/build the project.

Without these, `HeartRiskAssistant.jsx` is just a text file — nothing
reads it, bundles it, or serves it to a browser.

## Folder structure

```
heart-risk-frontend/
├── index.html              # HTML entry point Vite serves
├── package.json             # dependencies + npm scripts
├── vite.config.js           # Vite/React plugin config
├── README.md                 # this file
└── src/
    ├── main.jsx              # mounts <App /> into index.html's #root
    ├── App.jsx                # top-level component, renders the assistant
    └── components/
        └── HeartRiskAssistant.jsx   # the actual UI (form, both views, charts)
```

## Running it

You need [Node.js](https://nodejs.org) (v18 or newer) installed first.

```bash
# 1. Install dependencies (only needed once)
npm install

# 2. Start the dev server
npm run dev
```

Then open the URL it prints (usually `http://localhost:5173`) in your
browser. The page hot-reloads as you edit any file in `src/`.

## Building for deployment

```bash
npm run build
```

This outputs a static, production-ready bundle into a `dist/` folder,
which you can deploy to any static host (Netlify, Vercel, GitHub Pages,
or your own server).

## Connecting the real backend

`src/components/HeartRiskAssistant.jsx` currently computes risk with an
illustrative placeholder formula (`computeRisk()`), clearly commented at
the top of the file. Once your FastAPI backend is trained and running,
replace the body of `handleSubmit` with a real request, e.g.:

```js
async function handleSubmit(e) {
  e.preventDefault();
  setSubmitting(true);
  const res = await fetch("http://localhost:8000/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(form),
  });
  const data = await res.json();
  setResult(data); // backend should return { p, svmP, lower, upper, width, contribs }
  setSubmitting(false);
}
```

Keep the backend's response shape matching `{ p, svmP, lower, upper,
width, contribs }` and nothing else in the component needs to change —
the ring, the posterior curve, the contribution chart, and the triage
logic all already consume that shape.

You'll also need to enable CORS on the FastAPI side (see
`fastapi.middleware.cors.CORSMiddleware`) so the browser allows requests
from `localhost:5173` during development.
