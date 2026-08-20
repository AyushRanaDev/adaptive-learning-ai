import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BookOpen, Brain, CheckCircle2, FileText, Home, MessageSquare, Sparkles, Target, UploadCloud } from "lucide-react";
import { api, clearToken, getToken, setToken } from "./lib/api";
import "./styles.css";

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "assistant", label: "Assistant", icon: MessageSquare },
  { id: "upload", label: "Upload Notes", icon: UploadCloud },
  { id: "progress", label: "Progress & Quizzes", icon: Target }
];

function Dashboard({ user, setTab }) {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const state = user.learnerState;
  useEffect(() => {
    api("/plan", { method: "POST" }).then((data) => setPlan(data.plan)).catch((err) => setError(err.message));
  }, []);
  return (
    <div className="page-grid">
      <section className="hero">
        <div>
          <p className="eyebrow">Good morning, {state.name}</p>
          <h2>Your learning home for today</h2>
          <p>AI-generated priorities based on your progress, weak areas, recent quiz scores, and goals.</p>
        </div>
        <Sparkles size={44} />
      </section>
      <section className="panel wide">
        <h3>Today's Plan</h3>
        {error && <div className="error">{error}</div>}
        {!plan && !error && <p className="muted">Generating your adaptive plan with Groq...</p>}
        {plan && (
          <div className="plan">
            <div className="plan-head"><strong>{plan.theme}</strong><span>{plan.estimatedMinutes} min</span></div>
            {(plan.reviewTopics || []).map((item) => <article key={item.title}><BookOpen size={18} /><div><b>{item.title}</b><p>{item.why}</p></div><span>{item.minutes}m</span></article>)}
            {plan.newConcept?.title && <article><Brain size={18} /><div><b>Learn: {plan.newConcept.title}</b><p>{plan.newConcept.whyNow}</p></div><span>{plan.newConcept.minutes}m</span></article>}
            {plan.quiz?.topic && <article><CheckCircle2 size={18} /><div><b>Quiz: {plan.quiz.topic}</b><p>{plan.quiz.goal}</p></div><span>{plan.quiz.questionCount} Qs</span></article>}
            <p className="note">{plan.encouragement}</p>
          </div>
        )}
      </section>
      <QuickCard title="Ask the assistant" text="Get text-only explanations tuned to your current level." action="Open chat" onClick={() => setTab("assistant")} />
      <QuickCard title="Analyze notes" text="Upload PDF, text, or an image from storage and turn it into summaries, gaps, and quizzes." action="Upload" onClick={() => setTab("upload")} />
      <ProgressSnapshot state={state} />
    </div>
  );
}

function QuickCard({ title, text, action, onClick }) {
  return <section className="panel"><h3>{title}</h3><p>{text}</p><button onClick={onClick}>{action}</button></section>;
}

function Assistant({ user }) {
  const [messages, setMessages] = useState([{ role: "assistant", content: `Hi ${user.learnerState.name}. Ask me anything from ML, DSA, OS, DBMS, or core CS.` }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const send = async () => {
    if (!input.trim()) return;
    const next = [...messages, { role: "user", content: input.trim() }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const data = await api("/chat", { method: "POST", body: JSON.stringify({ messages: next }) });
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setMessages([...next, { role: "assistant", content: err.message }]);
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className="panel tall">
      <h2>GenAI Study Assistant</h2>
      <div className="chat-log">
        {messages.map((message, index) => <div className={`bubble ${message.role}`} key={index}>{message.content}</div>)}
        {loading && <div className="bubble assistant">Thinking with your learner profile...</div>}
      </div>
      <div className="composer">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ask about backpropagation, DP, indexing, semaphores..." />
        <button className="primary" onClick={send}>Send</button>
      </div>
    </section>
  );
}

function UploadNotes({ refreshUser }) {
  const [file, setFile] = useState(null);
  const [topic, setTopic] = useState("Neural Networks");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const analyze = async () => {
    if (!file) return setError("Choose a PDF, text file, or image first.");
    setError("");
    setLoading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("topic", topic);
    try {
      const data = await api("/uploads/analyze", { method: "POST", body: form });
      setResult(data);
      refreshUser(data.learnerState);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="page-grid">
      <section className="panel wide">
        <h2>Notes / Image Upload Analysis</h2>
        <div className="upload-row">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic or syllabus area" />
          <label className="file-picker"><FileText size={18} />{file ? file.name : "Choose file"}<input type="file" accept=".txt,.md,.pdf,image/*" onChange={(e) => setFile(e.target.files?.[0])} /></label>
          <button className="primary" onClick={analyze} disabled={loading}>{loading ? "Analyzing..." : "Analyze"}</button>
        </div>
        {error && <div className="error">{error}</div>}
      </section>
      {result && <AnalysisResult result={result} />}
    </div>
  );
}

function AnalysisResult({ result }) {
  const a = result.analysis;
  return (
    <section className="panel wide">
      <h3>GenAI Analysis</h3>
      <p className="muted">Extracted preview: {result.extractedPreview}</p>
      <List title="Summary" items={a.summary} />
      <List title="Gaps to close" items={(a.gaps || []).map((g) => `${g.gap}: ${g.recommendedReview}`)} />
      <List title="Next steps" items={a.nextSteps} />
      <h4>Generated Quiz</h4>
      <div className="quiz-list">{(a.quiz || []).map((q, i) => <article key={i}><b>{q.question}</b><p>{q.answer}</p><span>{q.difficulty}</span></article>)}</div>
    </section>
  );
}

function Progress({ user, refreshUser }) {
  const [topic, setTopic] = useState("Dynamic Programming");
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [feedback, setFeedback] = useState({});
  const makeQuiz = async () => setQuiz((await api("/quiz", { method: "POST", body: JSON.stringify({ topic }) })).quiz);
  const grade = async (q) => {
    const data = await api("/quiz/feedback", {
      method: "POST",
      body: JSON.stringify({ topic: quiz.topic, question: q.question, expectedAnswer: q.expectedAnswer, answer: answers[q.id] || "" })
    });
    setFeedback({ ...feedback, [q.id]: data.result });
    refreshUser(data.learnerState);
  };
  return (
    <div className="page-grid">
      <ProgressSnapshot state={user.learnerState} />
      <section className="panel wide">
        <h2>Adaptive Quiz Practice</h2>
        <div className="composer left">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} />
          <button className="primary" onClick={makeQuiz}>Generate Quiz</button>
        </div>
        {quiz && <div className="quiz-list">{quiz.questions.map((q) => <article key={q.id}><b>{q.question}</b><span>{q.difficulty}</span><textarea value={answers[q.id] || ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="Type your answer" /><button onClick={() => grade(q)}>Get feedback</button>{feedback[q.id] && <p className="feedback">{feedback[q.id].feedback} Review next: {feedback[q.id].reviewNext?.join(", ")}</p>}</article>)}</div>}
      </section>
    </div>
  );
}

function List({ title, items = [] }) {
  return <><h4>{title}</h4><ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul></>;
}

function ProgressSnapshot({ state }) {
  const topics = Object.entries(state.topics || {});
  return (
    <section className="panel wide">
      <h3>Progress Snapshot</h3>
      <div className="topic-grid">{topics.map(([name, value]) => <div className="topic" key={name}><div><b>{name}</b><span>{value.quizAverage}% quiz avg</span></div><progress value={value.covered} max="100" /></div>)}</div>
      <h4>Weak areas</h4>
      <div className="chips">{(state.weakAreas || []).map((area) => <span key={area}>{area}</span>)}</div>
    </section>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [bootError, setBootError] = useState("");
  useEffect(() => {
    const startDemoSession = async () => {
      try {
        if (getToken()) {
          const data = await api("/me");
          setUser(data.user);
          return;
        }
        const data = await api("/auth/demo", { method: "POST" });
        setToken(data.token);
        setUser(data.user);
      } catch (err) {
        clearToken();
        setBootError(err.message);
      }
    };
    startDemoSession();
  }, []);
  const refreshUser = (learnerState) => setUser({ ...user, learnerState });
  const content = useMemo(() => {
    if (!user) return null;
    if (tab === "assistant") return <Assistant user={user} />;
    if (tab === "upload") return <UploadNotes refreshUser={refreshUser} />;
    if (tab === "progress") return <Progress user={user} refreshUser={refreshUser} />;
    return <Dashboard user={user} setTab={setTab} />;
  }, [tab, user]);
  if (!user) {
    return (
      <main className="loading-page">
        <div className="brand-mark"><Brain size={26} /></div>
        <h1>Adaptive Learning Intelligence</h1>
        <p>{bootError || "Opening your learning home..."}</p>
      </main>
    );
  }
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="logo"><Brain /> <span>ALI</span></div>
        <nav>{tabs.map((item) => { const Icon = item.icon; return <button className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)} key={item.id}><Icon size={18} />{item.label}</button>; })}</nav>
      </aside>
      <section className="content">{content}</section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
