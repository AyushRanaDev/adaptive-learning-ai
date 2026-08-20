import { promises as fs } from "fs";
import path from "path";

const dataDir = process.env.VERCEL ? "/tmp/adaptive-learning-data" : path.resolve("server", "data");
const dbPath = path.join(dataDir, "db.json");

const starterState = {
  users: {},
  sessions: {}
};

async function ensureDb() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    await fs.writeFile(dbPath, JSON.stringify(starterState, null, 2));
  }
}

export async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(dbPath, "utf8");
  return JSON.parse(raw);
}

export async function writeDb(db) {
  await ensureDb();
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

export function publicUser(user) {
  const { password, ...safeUser } = user;
  return safeUser;
}

export function defaultLearnerState(name = "Student") {
  return {
    name,
    goals: ["Build strong AI/ML foundations", "Prepare for coding interviews"],
    level: "intermediate",
    focusSubjects: ["AI/ML", "DSA", "Operating Systems"],
    topics: {
      "Machine Learning Basics": { covered: 70, quizAverage: 78 },
      "Neural Networks": { covered: 42, quizAverage: 61 },
      "Dynamic Programming": { covered: 55, quizAverage: 58 },
      "DBMS Transactions": { covered: 35, quizAverage: 64 }
    },
    weakAreas: ["backpropagation intuition", "dynamic programming state design", "normalization in DBMS"],
    recentQuizScores: [
      { topic: "Gradient Descent", score: 72, date: "2026-08-19" },
      { topic: "DP Knapsack", score: 56, date: "2026-08-18" }
    ],
    uploads: [],
    quizHistory: []
  };
}
