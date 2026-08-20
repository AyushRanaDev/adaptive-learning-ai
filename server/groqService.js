import Groq from "groq-sdk";

let client;
const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

function requireKey() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing. Add it to .env before using GenAI features.");
  }
  if (!client) client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return client;
}

async function completeJson(messages, fallback) {
  const groq = requireKey();
  const response = await groq.chat.completions.create({
    model,
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages
  });
  const content = response.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

async function completeText(messages) {
  const groq = requireKey();
  const response = await groq.chat.completions.create({
    model,
    temperature: 0.45,
    messages
  });
  return response.choices[0]?.message?.content?.trim() || "I could not generate a response.";
}

const profilePrompt = (learnerState) => `
Learner profile:
${JSON.stringify(learnerState, null, 2)}
Personalize for an Engineering/BTech student. Do not mention voice, camera, webcam, speech, or live capture features.
`;

export async function generateDailyPlan(learnerState) {
  return completeJson([
    { role: "system", content: "You are an adaptive learning planner. Return only JSON." },
    {
      role: "user",
      content: `${profilePrompt(learnerState)}
Create today's study plan. JSON shape:
{
  "theme": "short theme",
  "estimatedMinutes": number,
  "reviewTopics": [{"title": "", "why": "", "minutes": number}],
  "newConcept": {"title": "", "whyNow": "", "minutes": number},
  "quiz": {"topic": "", "questionCount": number, "goal": ""},
  "encouragement": ""
}`
    }
  ], {
    theme: "Strengthen weak foundations",
    estimatedMinutes: 90,
    reviewTopics: [],
    newConcept: {},
    quiz: {},
    encouragement: "Small focused sessions compound quickly."
  });
}

export async function chatWithAssistant({ learnerState, messages }) {
  return completeText([
    {
      role: "system",
      content: `You are a text-only GenAI study assistant for BTech students learning AI/ML, DSA, and core CS.
Use the learner state to adapt depth, examples, and next steps.
Keep answers clear, structured, and student-friendly.
Never suggest voice, camera, webcam, live image capture, speech-to-text, or text-to-speech.
${profilePrompt(learnerState)}`
    },
    ...messages.slice(-12)
  ]);
}

export async function analyzeNotes({ learnerState, extractedText, topic }) {
  return completeJson([
    { role: "system", content: "You analyze uploaded study notes for adaptive learning. Return only JSON." },
    {
      role: "user",
      content: `${profilePrompt(learnerState)}
Topic or syllabus area: ${topic || "not specified"}
Extracted notes:
${extractedText.slice(0, 12000)}

Return JSON:
{
  "summary": ["bullet"],
  "keyConcepts": [{"concept": "", "confidence": "high|medium|low", "whyItMatters": ""}],
  "gaps": [{"gap": "", "recommendedReview": ""}],
  "quiz": [{"question": "", "answer": "", "difficulty": "easy|medium|hard"}],
  "nextSteps": ["action"]
}`
    }
  ], { summary: [], keyConcepts: [], gaps: [], quiz: [], nextSteps: [] });
}

export async function generateQuiz({ learnerState, topic }) {
  return completeJson([
    { role: "system", content: "You generate adaptive quizzes. Return only JSON." },
    {
      role: "user",
      content: `${profilePrompt(learnerState)}
Generate a 5-question quiz for: ${topic}.
Return JSON: {"topic":"", "questions":[{"id":"","question":"","difficulty":"","expectedAnswer":"","rubric":""}]}`
    }
  ], { topic, questions: [] });
}

export async function gradeAnswer({ learnerState, topic, question, expectedAnswer, answer }) {
  return completeJson([
    { role: "system", content: "You grade learning answers with reasoning and adaptive feedback. Return only JSON." },
    {
      role: "user",
      content: `${profilePrompt(learnerState)}
Topic: ${topic}
Question: ${question}
Expected answer: ${expectedAnswer}
Student answer: ${answer}
Return JSON: {"score": number, "isCorrect": boolean, "feedback": "", "reasoning": "", "reviewNext": [""]}`
    }
  ], { score: 0, isCorrect: false, feedback: "", reasoning: "", reviewNext: [] });
}
