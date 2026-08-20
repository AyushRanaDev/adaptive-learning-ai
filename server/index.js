import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "crypto";
import { promises as fs } from "fs";
import pdf from "pdf-parse";
import { createWorker } from "tesseract.js";
import {
  analyzeNotes,
  chatWithAssistant,
  generateDailyPlan,
  generateQuiz,
  gradeAnswer
} from "./groqService.js";
import { defaultLearnerState, publicUser, readDb, writeDb } from "./store.js";

const app = express();
const uploadDir = process.env.VERCEL ? "/tmp/adaptive-learning-uploads" : "server/data/uploads";
const upload = multer({ dest: uploadDir, limits: { fileSize: 12 * 1024 * 1024 } });
const port = process.env.PORT || 8080;

const allowedOrigins = new Set([
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
  ...(process.env.CLIENT_ORIGIN || "").split(",").map((origin) => origin.trim()).filter(Boolean)
]);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS."));
  },
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));

async function auth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const db = await readDb();
  const email = db.sessions[token];
  if (!token || !email || !db.users[email]) return res.status(401).json({ error: "Please log in again." });
  req.db = db;
  req.user = db.users[email];
  req.email = email;
  next();
}

async function extractFileText(file) {
  const mime = file.mimetype || "";
  if (mime.includes("pdf")) {
    const buffer = await fs.readFile(file.path);
    const parsed = await pdf(buffer);
    return parsed.text.trim();
  }
  if (mime.startsWith("image/")) {
    const worker = await createWorker("eng");
    const result = await worker.recognize(file.path);
    await worker.terminate();
    return result.data.text.trim();
  }
  return fs.readFile(file.path, "utf8");
}

app.post("/api/auth/signup", async (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
  const db = await readDb();
  const key = email.toLowerCase();
  if (db.users[key]) return res.status(409).json({ error: "An account already exists for this email." });
  const token = crypto.randomUUID();
  db.users[key] = {
    id: crypto.randomUUID(),
    name: name || "Student",
    email: key,
    password,
    learnerState: defaultLearnerState(name || "Student"),
    createdAt: new Date().toISOString()
  };
  db.sessions[token] = key;
  await writeDb(db);
  res.json({ token, user: publicUser(db.users[key]) });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const db = await readDb();
  const key = email?.toLowerCase();
  const user = db.users[key];
  if (!user || user.password !== password) return res.status(401).json({ error: "Invalid email or password." });
  const token = crypto.randomUUID();
  db.sessions[token] = key;
  await writeDb(db);
  res.json({ token, user: publicUser(user) });
});

app.post("/api/auth/demo", async (req, res) => {
  const db = await readDb();
  const key = "demo@student.local";
  const token = crypto.randomUUID();
  if (!db.users[key]) {
    db.users[key] = {
      id: crypto.randomUUID(),
      name: "Demo Student",
      email: key,
      password: "",
      learnerState: defaultLearnerState("Demo Student"),
      createdAt: new Date().toISOString()
    };
  }
  db.sessions[token] = key;
  await writeDb(db);
  res.json({ token, user: publicUser(db.users[key]) });
});

app.get("/api/me", auth, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post("/api/plan", auth, async (req, res) => {
  try {
    const plan = await generateDailyPlan(req.user.learnerState);
    res.json({ plan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chat", auth, async (req, res) => {
  try {
    const reply = await chatWithAssistant({ learnerState: req.user.learnerState, messages: req.body.messages || [] });
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/uploads/analyze", auth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Upload a text, PDF, or image file." });
    const extractedText = await extractFileText(req.file);
    if (!extractedText) return res.status(400).json({ error: "No readable text was found in this file." });
    const analysis = await analyzeNotes({
      learnerState: req.user.learnerState,
      extractedText,
      topic: req.body.topic
    });
    req.user.learnerState.uploads.unshift({
      fileName: req.file.originalname,
      topic: req.body.topic || "General CS",
      analyzedAt: new Date().toISOString(),
      summary: analysis.summary,
      gaps: analysis.gaps
    });
    const gapNames = (analysis.gaps || []).map((gap) => gap.gap).filter(Boolean);
    req.user.learnerState.weakAreas = [...new Set([...gapNames.slice(0, 3), ...req.user.learnerState.weakAreas])].slice(0, 8);
    await writeDb(req.db);
    res.json({ extractedPreview: extractedText.slice(0, 900), analysis, learnerState: req.user.learnerState });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (req.file) fs.unlink(req.file.path).catch(() => {});
  }
});

app.post("/api/quiz", auth, async (req, res) => {
  try {
    const quiz = await generateQuiz({ learnerState: req.user.learnerState, topic: req.body.topic || "Machine Learning" });
    res.json({ quiz });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/quiz/feedback", auth, async (req, res) => {
  try {
    const result = await gradeAnswer({ learnerState: req.user.learnerState, ...req.body });
    const topic = req.body.topic || "General";
    req.user.learnerState.quizHistory.unshift({
      topic,
      question: req.body.question,
      answer: req.body.answer,
      score: result.score,
      date: new Date().toISOString()
    });
    req.user.learnerState.recentQuizScores.unshift({ topic, score: result.score, date: new Date().toISOString().slice(0, 10) });
    req.user.learnerState.weakAreas = [...new Set([...(result.reviewNext || []), ...req.user.learnerState.weakAreas])].slice(0, 8);
    await writeDb(req.db);
    res.json({ result, learnerState: req.user.learnerState });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default app;

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Adaptive Learning Intelligence API running on http://127.0.0.1:${port}`);
  });
}
