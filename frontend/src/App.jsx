import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  CircleUserRound,
  Heart,
  Leaf,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircleMore,
  Mic,
  Paperclip,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Sparkles,
  UsersRound,
  Wind,
  X,
} from "lucide-react";
import {
  authenticate,
  deleteConversation,
  getConversationInsights,
  getConversationMessages,
  getConversations,
  getEmotionTrends,
  isTokenExpired,
  isUnauthorizedError,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  sendChatMessage,
  signInWithGoogle,
  verifyEmail,
} from "./api";
import StudentSuccess from "./StudentSuccess";

const remoteAssets = {
  dashboard:
    "https://framerusercontent.com/images/m2afPbkIuDVyF1oEesVqGznGmCI.png?width=1535&height=1024",
  cloud:
    "https://framerusercontent.com/images/Rorgfh4qpKNsZyFzGNQ9wt5C0i4.png?scale-down-to=1024&width=1185&height=689",
  cloudMiddle:
    "https://framerusercontent.com/images/fLN6Wx8BsWTV2MkQDeC8mB2BQKA.png?scale-down-to=1024&width=1186&height=548",
  cloudFront:
    "https://framerusercontent.com/images/lSZuKptayJeB4Xcw10qjE7IisQw.png?scale-down-to=1024&width=1192&height=714",
  meadow:
    "https://framerusercontent.com/images/QonQfzdUmEwRaww2TW9LW9ODvR0.jpg?width=1920&height=1600",
  meadowDecoration:
    "https://framerusercontent.com/images/OH5Re0X1fnTabOLoEQYYNvYZWdQ.png?width=1960&height=767",
};

function GoogleButton({ onCredential, onError }) {
  const buttonRef = useRef(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  useEffect(() => {
    if (!clientId || !buttonRef.current) return;
    const render = () => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => onCredential(response.credential),
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        width: 320,
        text: "continue_with",
      });
    };
    if (window.google?.accounts?.id) render();
    else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = render;
      script.onerror = () =>
        onError("Google Sign-In could not load. Please try email instead.");
      document.head.appendChild(script);
    }
  }, [clientId]);
  return clientId ? (
    <>
      <div className="auth-divider">
        <span>or</span>
      </div>
      <div className="google-signin" ref={buttonRef} />
    </>
  ) : null;
}

function AuthModal({ onSuccess, onClose }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const finish = (result) => {
    if (result.verification_required) {
      setEmail(result.email || email);
      setMode("verify");
      setNotice(result.message || "We sent a verification code to your email.");
      return;
    }
    onSuccess(result);
  };
  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "verify") finish(await verifyEmail(email, code));
      else if (mode === "forgot") {
        const result = await requestPasswordReset(email);
        setNotice(result.message);
        setMode("reset");
      } else if (mode === "reset")
        finish(await resetPassword(email, code, password));
      else
        finish(
          await authenticate(
            mode,
            mode === "login" ? { email, password } : { name, email, password },
          ),
        );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  async function google(credential) {
    setError("");
    setLoading(true);
    try {
      finish(await signInWithGoogle(credential));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  async function resend() {
    setError("");
    setLoading(true);
    try {
      const result = await resendVerification(email);
      setNotice(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  const verifying = mode === "verify",
    resetting = mode === "reset",
    requestingReset = mode === "forgot";
  return (
    <div className="auth-overlay">
      <section className="auth-modal" role="dialog" aria-modal="true">
        <button
          className="icon-button modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X />
        </button>
        <span className="modal-leaf">
          <Leaf />
        </span>
        <h2>
          {verifying
            ? "Check your email"
            : resetting
              ? "Set a new password"
              : requestingReset
                ? "Reset your password"
                : mode === "login"
                  ? "Welcome back"
                  : "Create your space"}
        </h2>
        <p>
          {verifying
            ? `Enter the six-digit code sent to ${email}.`
            : resetting
              ? "Enter the reset code from your email and choose a new password."
              : requestingReset
                ? "Enter your account email and we’ll send a reset code."
                : mode === "login"
                  ? "Sign in to continue your conversations."
                  : "A gentle place to reflect, one message at a time."}
        </p>
        <form onSubmit={submit}>
          {mode === "register" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              minLength="2"
              required
            />
          )}
          {(mode === "login" || mode === "register" || requestingReset) && (
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Email address"
              required
            />
          )}
          {(mode === "login" || mode === "register" || resetting) && (
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder={
                resetting
                  ? "New password (minimum 8 characters)"
                  : "Password (minimum 8 characters)"
              }
              minLength="8"
              required
            />
          )}
          {(verifying || resetting) && (
            <input
              className="otp-input"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              minLength="6"
              maxLength="6"
              required
            />
          )}
          {notice && <p className="auth-notice">{notice}</p>}
          {error && <p className="auth-error">{error}</p>}
          <button className="dark-pill" disabled={loading}>
            {loading
              ? "Please wait..."
              : verifying
                ? "Verify email"
                : resetting
                  ? "Change password"
                  : requestingReset
                    ? "Send reset code"
                    : mode === "login"
                      ? "Sign in"
                      : "Create account"}
            <ArrowRight />
          </button>
        </form>
        {!verifying && !resetting && !requestingReset && (
          <GoogleButton onCredential={google} onError={setError} />
        )}
        {verifying ? (
          <button className="text-button" disabled={loading} onClick={resend}>
            Resend verification code
          </button>
        ) : resetting ? (
          <button className="text-button" onClick={() => setMode("login")}>
            Back to sign in
          </button>
        ) : requestingReset ? (
          <button className="text-button" onClick={() => setMode("login")}>
            Back to sign in
          </button>
        ) : (
          <>
            {mode === "login" && (
              <button
                className="text-button"
                onClick={() => {
                  setError("");
                  setNotice("");
                  setMode("forgot");
                }}
              >
                Forgot password?
              </button>
            )}
            <button
              className="text-button"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login"
                ? "New here? Create an account"
                : "Already have an account? Sign in"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function ChatScreen({
  user,
  logout,
  onHome,
  onSignIn,
  onSessionExpired,
  studentCoach = false,
  onStudentSuccess,
}) {
  const token = localStorage.getItem("hopemo_access_token") || "";
  const member = user && typeof user === "object" ? user : null;
  const name = member?.name?.trim().split(" ")?.[0] || "user";
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: `Hi ${name}. I'm here whenever you need a calm place to talk. What's on your mind?`,
      time: "Now",
    },
  ]);
  const [conversations, setConversations] = useState([]);
  const [trends, setTrends] = useState([]);
  const [conversationInsights, setConversationInsights] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dark, setDark] = useState(
    () => localStorage.getItem("hopemo_theme") === "dark",
  );
  const [showInsights, setShowInsights] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [currentRisk, setCurrentRisk] = useState("low");
  const bottomRef = useRef(null);
  const greeting =
    new Date().getHours() < 12
      ? "Morning"
      : new Date().getHours() < 17
        ? "Afternoon"
        : new Date().getHours() < 22
          ? "Evening"
          : "";
  const fresh = () => {
    setConversationId("");
    setConversationInsights([]);
    setCurrentRisk("low");
    setMessages([
      {
        role: "assistant",
        content: `Hi ${name}. I'm here whenever you need a calm place to talk. What's on your mind?`,
        time: "Now",
      },
    ]);
  };
  useEffect(() => {
    localStorage.setItem("hopemo_theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);
  useEffect(() => {
    if (!token) return;
    if (isTokenExpired(token)) {
      onSessionExpired();
      return;
    }
    Promise.all([getConversations(token), getEmotionTrends(token)])
      .then(([saved, emotionRows]) => {
        setConversations(saved);
        setTrends(emotionRows);
      })
      .catch((error) => {
        if (isUnauthorizedError(error)) onSessionExpired();
      });
  }, [token, onSessionExpired]);
  async function openConversation(id) {
    if (!token) return onSignIn();
    setLoading(true);
    try {
      const [saved, insights] = await Promise.all([
        getConversationMessages(token, id),
        getConversationInsights(token, id),
      ]);
      setConversationId(id);
      setConversationInsights(insights);
      setCurrentRisk(
        insights.some((row) => row.risk_level === "critical")
          ? "critical"
          : insights.some((row) => row.risk_level === "high")
            ? "high"
            : "low",
      );
      setMessages(
        saved.map((m) => ({
          role: m.role,
          content: m.content,
          time: m.created_at
            ? new Date(m.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "",
        })),
      );
    } catch (error) {
      if (isUnauthorizedError(error)) onSessionExpired();
    } finally {
      setLoading(false);
    }
  }
  async function removeConversation() {
    const id = pendingDelete;
    if (!id) return;
    try {
      await deleteConversation(token, id);
      setConversations((current) => current.filter((item) => item.id !== id));
      if (conversationId === id) fresh();
    } catch (error) {
      if (isUnauthorizedError(error)) onSessionExpired();
    } finally {
      setPendingDelete(null);
    }
  }
  async function sendMessage(event) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    if (!token) {
      onSignIn();
      return;
    }
    setInput("");
    setMessages((current) => [
      ...current,
      { role: "user", content: text, time: "Now" },
    ]);
    setLoading(true);
    try {
      const data = await sendChatMessage(token, {
        message: text,
        conversation_id: conversationId || null,
        student_coach: studentCoach,
      });
      setConversationId(data.conversation_id);
      const risk =
        data.safety?.risk_level ||
        (data.emotion?.intensity > 0.7 ? "high" : "low");
      setCurrentRisk(risk);
      setConversationInsights((current) => [
        ...current,
        {
          intensity: data.emotion?.intensity || 0,
          hope: data.emotion?.hope || 0,
          risk_level: risk,
        },
      ]);
      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.response, time: "Now" },
      ]);
      const [saved, emotionRows] = await Promise.all([
        getConversations(token),
        getEmotionTrends(token),
      ]);
      setConversations(saved);
      setTrends(emotionRows);
    } catch (error) {
      if (
        isUnauthorizedError(error) ||
        (error.message || "").toLowerCase().includes("sign in")
      ) {
        onSessionExpired();
        return;
      }
      const backup = `I could not reach the full AI service right now, ${name}, but I am still here. Tell me one more detail and we can work through it together.`;
      setMessages((current) => [
        ...current,
        { role: "assistant", content: backup, time: "Now" },
      ]);
    } finally {
      setLoading(false);
    }
  }
  const insightRows = conversationId ? conversationInsights : trends;
  const points = insightRows.length
    ? insightRows
        .map(
          (row, index) =>
            `${(index / Math.max(insightRows.length - 1, 1)) * 100},${92 - Math.min(85, (row.intensity ?? 1 - row.hope ?? 0) * 100)}`,
        )
        .join(" ")
    : "0,70 25,58 50,67 75,38 100,45";
  return (
    <main
      className={`workspace ${dark ? "theme-dark" : ""} ${mobileSidebarOpen ? "mobile-sidebar-open" : ""}`}
    >
      <button
        className="mobile-sidebar-scrim"
        type="button"
        aria-label="Close chat menu"
        onClick={() => setMobileSidebarOpen(false)}
      />
      <aside className="chat-sidebar">
        <div className="mobile-sidebar-heading">
          <span>Chat menu</span>
          <button
            type="button"
            aria-label="Close chat menu"
            onClick={() => setMobileSidebarOpen(false)}
          >
            <X />
          </button>
        </div>
        <button className="chat-back" onClick={onHome}>
          <ArrowLeft /> Back to home
        </button>
        <button className="workspace-brand" onClick={onHome}>
          <img className="brand-image" src="/hopemo-logo.jpg" alt="HOPEMO" />
        </button>
        <button className="new-chat" onClick={fresh}>
          + New chat
        </button>
        <div className="side-heading">YOUR CONVERSATIONS</div>
        <div className="history-list">
          {token ? (
            conversations.map((item) => (
              <div
                className={`history-item ${item.id === conversationId ? "selected" : ""}`}
                key={item.id}
              >
                <button
                  onClick={() => openConversation(item.id)}
                  title={item.title}
                >
                  {item.title}
                </button>
                <button
                  className="delete-history"
                  onClick={() => setPendingDelete(item.id)}
                  aria-label={`Delete ${item.title}`}
                >
                  ×
                </button>
              </div>
            ))
          ) : (
            <button onClick={onSignIn}>Sign in to save chat history</button>
          )}
        </div>
        <div className="sidebar-footer">
          <button onClick={() => setDark(!dark)}>
            {dark ? "Light mode" : "Dark mode"}
          </button>
          {member ? (
            <button onClick={logout}>
              <LogOut /> Log out
            </button>
          ) : (
            <button onClick={onSignIn}>Sign in</button>
          )}
        </div>
      </aside>
      <section className="plain-chat">
        <header className="workspace-header">
          <div>
            {greeting && (
              <p>
                {studentCoach
                  ? "STUDENT COACH"
                  : `GOOD ${greeting.toUpperCase()}`}
              </p>
            )}
            <h1>{name}</h1>
          </div>
          <div>
            {studentCoach && (
              <button className="header-action" onClick={onStudentSuccess}>
                <BookOpen /> My plan
              </button>
            )}
            <a
              className="header-action stress-relief"
              href="https://mindful-room-builder.lovable.app/"
              target="_blank"
              rel="noreferrer"
            >
              <Heart /> Stress relief
            </a>
            <button
              className="header-action"
              onClick={() => setShowInsights(!showInsights)}
            >
              <Brain /> Insights
            </button>
            <button
              className="header-action mobile-home"
              onClick={onHome}
              aria-label="Back to home"
            >
              <ArrowLeft />
            </button>
            <button
              className="header-action mobile-chat-menu"
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open chat menu"
              aria-expanded={mobileSidebarOpen}
            >
              <Menu />
            </button>
          </div>
        </header>
        {showInsights && (
          <section className={`insights-panel risk-${currentRisk}`}>
            <div>
              <p className="eyebrow">
                {conversationId ? "THIS CONVERSATION" : "EMOTIONAL TREND"}
              </p>
              <h2>
                {currentRisk === "critical" || currentRisk === "high"
                  ? "High emotional intensity"
                  : "Calm and low intensity"}
              </h2>
              <p>
                {currentRisk === "critical" || currentRisk === "high"
                  ? "This conversation contains high-intensity moments. Take a pause and reach out to someone you trust if you need support."
                  : insightRows.length
                    ? "This conversation is currently showing a calm, low emotional level."
                    : "Send a message to see this conversation's emotional trend."}
              </p>
            </div>
            <div className="trend-chart">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <line x1="0" y1="92" x2="100" y2="92" />
                <polyline points={points} />
              </svg>
              <div>
                {insightRows.slice(-5).map((item, index) => (
                  <span key={item.time || item.date || index}>
                    {item.time
                      ? new Date(item.time).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : item.date?.slice(5)}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}
        <div className="plain-messages">
          {messages.map((message, index) => (
            <article
              className={`plain-message ${message.role}`}
              key={`${index}-${message.content}`}
            >
              <span>{message.role === "assistant" ? "HOPEMO" : name}</span>
              <p>{message.content}</p>
              <time>{message.time}</time>
            </article>
          ))}
          {loading && (
            <article className="plain-message assistant">
              <span>HOPEMO</span>
              <p className="typing-text">Thinking...</p>
            </article>
          )}
          <div ref={bottomRef} />
        </div>
        <form className="plain-composer" onSubmit={sendMessage}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Message HOPEMO..."
            aria-label="Your message"
          />
          <button disabled={!input.trim() || loading} aria-label="Send message">
            <Send />
          </button>
        </form>
        <p className="composer-note">
          HOPEMO provides emotional support, not emergency or medical care.
        </p>
      </section>
      {pendingDelete && (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-card">
            <h2>Delete conversation?</h2>
            <p>
              This removes this conversation and its insights from your history.
            </p>
            <div>
              <button onClick={() => setPendingDelete(null)}>Cancel</button>
              <button className="danger-button" onClick={removeConversation}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
function Landing({ startChat, token, logout, onNavigate, openReport }) {
  const landingRef = useRef(null);
  const comparisonScrollRef = useRef(null);
  const integrationsRef = useRef(null);
  const impactRef = useRef(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [comparisonMode, setComparisonMode] = useState("before");
  const [journeyStep, setJourneyStep] = useState(0);
  const [activeInsight, setActiveInsight] = useState(0);
  const [integrationsReady, setIntegrationsReady] = useState(false);
  const [impactReady, setImpactReady] = useState(false);
  const wellbeingInsights = [
    [Leaf, "Calm and grounded", "Feeling supported starts with being seen."],
    [Heart, "Needs a gentle check-in", "A small moment of care can make a meaningful difference."],
    [Sparkles, "Positive momentum", "Progress becomes clearer when the right signals are connected."],
  ];
  const journeySteps = [
    [
      "Connect securely",
      "Connect your organization, workflow, or professional workspace with privacy-first handling and controlled access.",
      Heart,
    ],
    [
      "Understand patterns",
      "Hopemo analyzes relevant signals and identifies meaningful patterns across interactions and time.",
      MessageCircleMore,
    ],
    [
      "Support better decisions",
      "Professionals review the context, apply their expertise, and decide what action is appropriate.",
      Brain,
    ],
  ];
  const [journeyTitle, journeyCopy, JourneyIcon] = journeySteps[journeyStep];
  useEffect(() => {
    let frame = 0;
    let lastProgress = -1;
    const update = () => {
      frame = 0;
      const progress = Math.min(
        1,
        Math.max(0, window.scrollY / Math.max(window.innerHeight * 1.05, 1)),
      );
      if (Math.abs(progress - lastProgress) < 0.002) return;
      lastProgress = progress;
      landingRef.current?.style.setProperty(
        "--scroll-progress",
        progress.toFixed(3),
      );
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setJourneyStep((current) => (current + 1) % journeySteps.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [journeySteps.length]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveInsight((current) => (current + 1) % wellbeingInsights.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [wellbeingInsights.length]);
  useEffect(() => {
    const section = integrationsRef.current;
    if (!section) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIntegrationsReady(true);
          observer.unobserve(section);
        }
      },
      { threshold: 0.28 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const section = impactRef.current;
    if (!section) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setImpactReady(true);
          observer.unobserve(section);
        }
      },
      { threshold: 0.28 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let frame = 0;
    const updateComparison = () => {
      frame = 0;
      const track = comparisonScrollRef.current;
      if (!track) return;
      const bounds = track.getBoundingClientRect();
      const distance = Math.max(1, bounds.height - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -bounds.top / distance));
      const switchAt = window.innerWidth <= 760 ? 0.28 : 0.5;
      const nextMode = progress >= switchAt ? "after" : "before";
      setComparisonMode((current) =>
        current === nextMode ? current : nextMode,
      );
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateComparison);
    };
    updateComparison();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <main ref={landingRef} className="landing scroll-landing">
      <nav className={`ref-nav ${mobileMenuOpen ? "mobile-menu-open" : ""}`}>
        <a className="wordmark" href="#top">
          <img
            className="brand-image front-wordmark"
            src="/hopemo-logo.jpg"
            alt="HOPEMO — Emotionally Intelligent AI"
          />
        </a>
        <div className="ref-nav-links">
          <a href="#products" onClick={() => setMobileMenuOpen(false)}>Products</a>
          <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
          <a href="#showcase-use-cases" onClick={() => setMobileMenuOpen(false)}>Use Cases</a>
          <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
        </div>
        {token ? (
          <button className="try-button" onClick={logout}>
            Log out <LogOut />
          </button>
        ) : (
          <button className="try-button" onClick={startChat}>
            Explore platform <ArrowRight />
          </button>
        )}
        <button
          className="mobile-menu-toggle"
          type="button"
          aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </nav>
      <section
        className="reference-hero"
        id="top"
        style={{
          "--cloud-back": `url(${remoteAssets.cloud})`,
          "--cloud-mid": `url(${remoteAssets.cloudMiddle})`,
          "--cloud-front": `url(${remoteAssets.cloudFront})`,
          "--meadow": `url(${remoteAssets.meadow})`,
          "--meadow-decoration": `url(${remoteAssets.meadowDecoration})`,
        }}
      >
        <div className="cloud-layer one" />
        <div className="cloud-layer two" />
        <div className="cloud-layer three" />
        <div className="hero-inner">
          <h1>
            Human
            <br />
            Intelligence Platform
          </h1>
          <p>
            Turn human experiences into meaningful insights that help
            professionals understand people, recognize changing patterns, and
            take the right action.
          </p>
          <div className="reference-actions">
            <button className="blue-pill" onClick={startChat}>
              Explore Hopemo <ArrowRight />
            </button>
            <button
              className="white-pill"
              onClick={() => onNavigate("student-success")}
            >
              Student Success <BookOpen />
            </button>
            <button className="report-pill" onClick={openReport}>
              Open your wellbeing report <ArrowRight />
            </button>
          </div>
          <div className="hero-proof">
            <span>Human-Centered AI</span>
            <i /> <span>Privacy-First</span>
            <i /> <span>Professional Insights</span>
          </div>
          <img
            className="dashboard-preview"
            src={remoteAssets.dashboard}
            alt="HOPEMO human intelligence dashboard"
          />
        </div>
      </section>
      <div className="comparison-scroll-track" ref={comparisonScrollRef}>
      <section className={`comparison-section ${comparisonMode}`}>
        <h2>
          Better support starts
          <br />
          with better understanding
        </h2>
        <div className="comparison-tabs">
          <button
            onClick={() => setComparisonMode("before")}
            className={comparisonMode === "before" ? "active" : ""}
          >
            Before HOPEMO
          </button>
          <button
            onClick={() => setComparisonMode("after")}
            className={comparisonMode === "after" ? "active" : ""}
          >
            With HOPEMO
          </button>
          <button
            className="comparison-knob"
            onClick={() =>
              setComparisonMode(
                comparisonMode === "before" ? "after" : "before",
              )
            }
            aria-label="Switch comparison"
          >
            <img src="/home-visuals/comparison-switch.png" alt="" />
          </button>
        </div>
        <div className="comparison-card">
          <div>
            <h3>
              {comparisonMode === "before"
                ? "Too much happens between the moments professionals can see"
                : "Turn human signals into meaningful professional insight"}
            </h3>
            <ul>
              {(comparisonMode === "before"
                ? [
                    "Important changes can happen between sessions, surveys, or classroom interactions.",
                    "Professionals often rely on limited observations and periodic feedback.",
                    "Behavioural and emotional patterns can be difficult to connect over time.",
                    "Valuable context can be scattered across conversations, check-ins, and assessments.",
                  ]
                : [
                    "Identify changing emotional and behavioural patterns.",
                    "Connect signals across conversations, check-ins, and interactions.",
                    "Surface relevant context before challenges become harder to address.",
                    "Keep humans in control of interpretation and action.",
                  ]
              ).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="comparison-visual" aria-hidden="true">
            <span className="comparison-status">
              {comparisonMode === "before"
                ? "Disconnected signals"
                : "Connected human context"}
            </span>
            <div className="comparison-network">
              <i /><i /><i /><i /><i /><i />
              <b>{comparisonMode === "before" ? "?" : "✦"}</b>
            </div>
            <p>
              {comparisonMode === "before"
                ? "The wider story stays hidden when signals live apart."
                : "A living view of the moments, patterns, and progress that matter."}
            </p>
          </div>
        </div>
      </section>
      </div>
      <section className="split-section" id="products">
        <div>
          <p className="section-label">EMOTIONAL WELLBEING, MADE CLEAR</p>
          <h2>Smarter decisions start with clear emotional data.</h2>
          <p>
            HOPEMO turns everyday conversations into meaningful, supportive
            insights—before difficult feelings become a crisis.
          </p>
          <button className="outline-pill" onClick={startChat}>
            Explore platform <ArrowRight />
          </button>
        </div>
        <div className="insight-card interactive-insight-card">
          <small>LIVE EMOTIONAL INSIGHT</small>
          <h3>
            {activeInsight === 2 ? (
              <>
                Progress becomes clearer
                <br />
                when the right signals are connected.
              </>
            ) : (
              wellbeingInsights[activeInsight][2]
            )}
          </h3>
          {wellbeingInsights.map(([Icon, label], index) => (
            <button
              className={`insight-line ${activeInsight === index ? "active" : ""}`}
              onClick={() => setActiveInsight(index)}
              key={label}
            >
              <Icon /> {label}
            </button>
          ))}
        </div>
      </section>
      <section className="feature-section core-intelligence" id="features">
        <div className="core-intelligence-heading">
          <div>
            <p className="section-label">CORE INTELLIGENCE</p>
            <h2>Everything you need to understand people, not just data.</h2>
          </div>
          <div>
            <p>
              From emotional and behavioural signals to contextual insights,
              Hopemo helps professionals and organizations turn human
              experiences into clearer understanding and meaningful action.
            </p>
            <button
              className="core-features-button"
              onClick={() =>
                document
                  .querySelector("#use-cases")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              View all features <ArrowRight />
            </button>
          </div>
        </div>
        <div className="feature-cards">
          {[
            [
              Bot,
              "Emotion-Aware Intelligence",
              "Recognize meaningful emotional signals across conversations and interactions, giving professionals additional context.",
              "/home-visuals/security-shield-transparent.png",
              "emotion",
            ],
            [
              Brain,
              "Behavioral Intelligence",
              "Identify patterns in engagement, behaviour, and interaction over time.",
              "/home-visuals/insights-chart.jpeg",
              "behavior",
            ],
            [
              Sparkles,
              "AI-Powered Insights",
              "Transform complex human signals into clear, contextual insights for the people responsible for support.",
              "/home-visuals/emotion-brain.jpeg",
              "insights",
            ],
            [
              Leaf,
              "Personalized Recovery Plans",
              "Bring weekly recovery context, micro-actions, recommendations, and progress signals together in one supportive view.",
              "/home-visuals/recovery-plans.png",
              "recovery",
            ],
          ].map(([, title, text, image, tone], index) => (
            <article
              className={`core-feature-card core-feature-${tone}`}
              style={{ "--feature-delay": `${index * 80}ms` }}
              key={title}
            >
              <div className="core-card-top">
                {tone === "emotion" && (
                  <h3 className="emotion-card-label">Emotion Recognition AI</h3>
                )}
                <img src={image} alt="" />
              </div>
              <div className="core-card-copy">
                {tone !== "emotion" && <h3>{title}</h3>}
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="platform-panel" id="use-cases">
        <div>
          <p className="section-label">PLATFORM OVERVIEW</p>
          <h2>See Emotional Intelligence in Action</h2>
          <p>
            Explore a real-time emotional intelligence space that transforms
            conversations into compassionate insights and meaningful actions.
          </p>
          <div className="platform-actions">
            <button className="blue-pill" onClick={startChat}>
              Open conversation <ArrowRight />
            </button>
            <button
              className="outline-pill"
              onClick={() => onNavigate("student-success")}
            >
              Student Success <BookOpen />
            </button>
          </div>
        </div>
        <img
          src="/home-visuals/emotion-brain.jpeg"
          alt="Illustration of emotional intelligence"
        />
      </section>
      <section className="stats-section">
        <p className="section-label">WHAT WE'RE BUILDING</p>
        <h2>One intelligence layer. Multiple human ecosystems.</h2>
        <div>
          {[
            ["Psychology", "Client ↔ Psychologist"],
            ["Workplace", "Employee ↔ HR"],
            ["Education", "Student ↔ Institution"],
            ["Human-first", "AI with oversight"],
          ].map(([stat, label], index) => (
            <article style={{ "--card-index": index }} key={stat}>
              <strong>{stat}</strong>
              <span>{label}</span>
            </article>
          ))}
        </div>
      </section>
      <section className="pricing-section" id="pricing">
        <p className="section-label">SUBSCRIPTION PLANS</p>
        <h2>Simple, transparent support.</h2>
        <div className="pricing-grid">
          {[
            ["Starter", "For a personal reflective space", "Free"],
            ["Plus", "For deeper emotional insights", "₹149 / month"],
            ["Care", "For teams and organizations", "Talk to us"],
          ].map(([plan, copy, price], index) => (
            <article className={index === 1 ? "popular" : ""} key={plan}>
              {index === 1 && <em>Most popular</em>}
              <h3>{plan}</h3>
              <p>{copy}</p>
              <strong>{price}</strong>
              <button
                className={index === 1 ? "blue-pill" : "outline-pill"}
                onClick={index === 0 ? startChat : undefined}
                disabled={index > 0}
              >
                {index === 0 ? "Get started" : "Coming soon"}
                <ArrowRight />
              </button>
              <ul>
                <li>Private conversations</li>
                <li>Emotional insights</li>
                <li>Secure by design</li>
              </ul>
            </article>
          ))}
        </div>
      </section>
      <section className="showcase-how">
        <div className="showcase-copy">
          <p className="section-label">HOW IT WORKS</p>
          <h2>From human experience to professional insight.</h2>
          <p>
            Hopemo connects human experiences, behavioural signals, and
            contextual information to help professionals understand what is
            changing and where attention may be needed.
          </p>
          <div className="showcase-metrics">
            <b>
              Continuous <span>Context across meaningful interactions</span>
            </b>
            <b>
              Connected <span>Signals organized into one intelligent view</span>
            </b>
          </div>
        </div>
        <div className="journey-card">
          <div className="journey-tabs">
            {journeySteps.map(([title], index) => (
              <button
                onClick={() => setJourneyStep(index)}
                className={journeyStep === index ? "active" : ""}
                key={title}
              >
                Step 0{index + 1}
              </button>
            ))}
          </div>
          <div className="journey-icon">
            <JourneyIcon />
          </div>
          <h3>{journeyTitle}</h3>
          <p>{journeyCopy}</p>
          <div className="journey-line">
            {journeySteps.map((_, index) => (
              <span
                className={journeyStep === index ? "active" : ""}
                key={index}
              />
            ))}
          </div>
        </div>
      </section>
      <section className="showcase-security">
        <div className="security-orbit">
          <div className="security-core">
            <ShieldCheck />
          </div>
          <div>
            <LockKeyhole />
            <span>Privacy-first</span>
          </div>
          <div>
            <Heart />
            <span>Human oversight</span>
          </div>
          <div>
            <Brain />
            <span>Clear context</span>
          </div>
        </div>
        <div>
          <p className="section-label">PRIVACY & SECURITY</p>
          <h2>Your data deserves responsible intelligence.</h2>
          <p>
            Hopemo is built around privacy-first architecture, controlled
            access, secure data handling, responsible AI practices, and human
            oversight.
          </p>
          <ul>
            <li>Privacy-first architecture</li>
            <li>Controlled access</li>
            <li>Secure data handling</li>
            <li>Responsible AI practices</li>
            <li>Human oversight</li>
          </ul>
          <button className="dark-pill" onClick={() => onNavigate("contact")}>
            Talk to us <ArrowRight />
          </button>
        </div>
      </section>
      <section className="showcase-cases" id="showcase-use-cases">
        <p className="section-label">ONE PLATFORM. THREE CONNECTIONS.</p>
        <h2>Who HOPEMO is built for.</h2>
        <div className="audience-marquee" aria-label="Who HOPEMO is built for">
          <div className="audience-track">
          {[
            [
              "Psychology",
              "Client and psychologist. Help psychologists understand what happens between appointments through continuous context and structured insights.",
              "https://images.unsplash.com/photo-1525134479668-1bee5c7c6845?auto=format&fit=crop&w=700&q=85",
            ],
            [
              "Education",
              "Student and institution. Help institutions understand student engagement and wellbeing beyond the classroom.",
              "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=700&q=85",
            ],
            [
              "Workplace",
              "Employee and HR. Give HR teams a clearer view of changing employee experiences beyond periodic feedback.",
              "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=700&q=85",
            ],
            [
              "Organizations",
              "Build emotional intelligence into the systems, workflows, and decisions of people-focused organizations.",
              "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=700&q=85",
            ],
            [
              "Care teams",
              "Give support teams clearer emotional context so they can deliver thoughtful, connected care.",
              "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=700&q=85",
            ],
            [
              "Individuals",
              "A private space to reflect, understand patterns, and take meaningful next steps.",
              "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=700&q=85",
            ],
          ].concat([
            ["Psychology", "Client and psychologist. Help psychologists understand what happens between appointments through continuous context and structured insights.", "https://images.unsplash.com/photo-1525134479668-1bee5c7c6845?auto=format&fit=crop&w=700&q=85"],
            ["Education", "Student and institution. Help institutions understand student engagement and wellbeing beyond the classroom.", "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=700&q=85"],
            ["Workplace", "Employee and HR. Give HR teams a clearer view of changing employee experiences beyond periodic feedback.", "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=700&q=85"],
            ["Organizations", "Build emotional intelligence into the systems, workflows, and decisions of people-focused organizations.", "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=700&q=85"],
            ["Care teams", "Give support teams clearer emotional context so they can deliver thoughtful, connected care.", "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=700&q=85"],
            ["Individuals", "A private space to reflect, understand patterns, and take meaningful next steps.", "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=700&q=85"],
          ]).map(([title, copy, image], index) => (
            <article className="audience-card" key={`${title}-${index}`}>
              <img className="case-art audience-image" src={image} alt="" />
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
          </div>
        </div>
      </section>
      <section
        className={`showcase-impact ${impactReady ? "is-ready" : ""}`}
        ref={impactRef}
      >
        <div>
          <p className="section-label">OUR IMPACT</p>
          <h2>A calmer way to support emotional wellbeing.</h2>
          <p>
            Every feature is designed to make reflection more approachable and
            emotional support easier to return to.
          </p>
          <button className="blue-pill" onClick={startChat}>
            Explore HOPEMO <ArrowRight />
          </button>
        </div>
        <aside>
          {[
            ["Private by design", "Your conversations stay personal."],
            ["Always available", "A gentle space when it matters."],
            ["Clearer insights", "Notice patterns over time."],
            ["Human-centered", "Built to support—not judge."],
          ].map(([stat, copy], index) => (
            <article key={stat}>
              <span>
                {index === 0
                  ? "✦"
                  : index === 1
                    ? "24/7"
                    : index === 2
                      ? "↗"
                      : "♡"}
              </span>
              <strong>{stat}</strong>
              <p>{copy}</p>
            </article>
          ))}
        </aside>
      </section>
      <section className="showcase-testimonials">
        <div className="showcase-testimonial-heading">
          <p className="section-label">WHAT PEOPLE SAY</p>
          <h2>Small moments of clarity can change a day.</h2>
          <div>
            <span>★ 4.9/5 rating</span>
            <i /> <span>Made for reflection</span>
            <i /> <span>Privacy-first</span>
          </div>
        </div>
        <div className="testimonial-marquee" aria-label="HOPEMO reviews">
          <div className="showcase-quotes testimonial-track">
          {[
            [
              "I finally have space to pause and understand what I’m feeling, without pressure.",
              "A daily HOPEMO user",
              "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=85",
            ],
            [
              "The insights help me notice patterns I would usually overlook.",
              "A student using HOPEMO",
              "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=85",
            ],
            [
              "It feels thoughtful, calm, and genuinely easy to come back to.",
              "A wellbeing-focused user",
              "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=160&q=85",
            ],
          ].concat([
            ["I finally have space to pause and understand what I’m feeling, without pressure.", "A daily HOPEMO user", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=85"],
            ["The insights help me notice patterns I would usually overlook.", "A student using HOPEMO", "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=85"],
            ["It feels thoughtful, calm, and genuinely easy to come back to.", "A wellbeing-focused user", "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=160&q=85"],
          ]).map(([quote, person, image], index) => (
            <article key={`${person}-${index}`}>
              <span>★★★★★</span>
              <p>“{quote}”</p>
              <div className="quote-person">
                <img src={image} alt="" />
                <b>{person}</b>
              </div>
            </article>
          ))}
          </div>
        </div>
      </section>
      <section
        className={`showcase-integrations ${integrationsReady ? "is-ready" : ""}`}
        ref={integrationsRef}
      >
        <p className="section-label">FLEXIBLE BY DESIGN</p>
        <h2>An intelligence layer, not another isolated tool.</h2>
        <p>
          Hopemo is being built to connect with existing organizational
          workflows and systems, bringing human signals and professional insight
          together in one place.
        </p>
        <button className="blue-pill" onClick={startChat}>
          Explore the platform <ArrowRight />
        </button>
        <div>
          {[
            "Psychology",
            "Workplace",
            "Education",
            "Organizations",
            "Professional insight",
            "Human action",
          ].map((item, index) => (
            <article style={{ "--card-index": index }} key={item}>
              <span>{["✦", "♡", "◌", "↗", "☼", "⌁"][index]}</span>
              {item}
            </article>
          ))}
        </div>
      </section>
      <section className="showcase-faq">
        <div>
          <p className="section-label">FREQUENTLY ASKED QUESTIONS</p>
          <h2>Helpful answers, without the jargon.</h2>
          <p>
            Everything organizations and individuals need to know about Hopemo's
            human intelligence platform.
          </p>
          <button
            className="dark-pill"
            onClick={() => onNavigate("contact")}
          >
            Talk to our team <ArrowRight />
          </button>
        </div>
        <aside>
          {[
            [
              "What is Hopemo?",
              "Hopemo is building an Emotional Intelligence OS — an intelligence layer that helps organizations understand human signals, connect people with the right support, and create better professional insight.",
            ],
            [
              "Who is Hopemo built for?",
              "Hopemo is designed for people-focused organizations across psychology, workplace, and education — connecting clients with psychologists, employees with HR teams, and students with institutions.",
            ],
            [
              "How does Hopemo's AI work?",
              "Hopemo analyzes relevant emotional, behavioural, and engagement signals to provide additional context and insights. The goal is to support professional understanding and decision-making, not replace human judgment.",
            ],
            [
              "Does Hopemo replace professionals?",
              "No. Hopemo is designed to support professionals, not replace them. It provides additional context and intelligence so professionals can make more informed, human-centered decisions.",
            ],
            [
              "Is my data private and secure?",
              "Privacy and responsible data handling are fundamental to Hopemo. We design our infrastructure around controlled access, responsible data practices, and protecting sensitive human information.",
            ],
          ].map(([q, a]) => (
            <article key={q}>
              <h3>
                {q}
                <span>−</span>
              </h3>
              <p>{a}</p>
            </article>
          ))}
        </aside>
      </section>
      <section className="dark-cta" id="pricing">
        <p className="section-label">READY TO UNDERSTAND PEOPLE BETTER?</p>
        <h2>One intelligence layer. Four enterprise possibilities.</h2>
        <button className="white-pill" onClick={startChat}>
          Try the live demo <ArrowRight />
        </button>
      </section>
      <footer className="site-footer">
        <div className="footer-main">
          <div>
            <img className="footer-logo" src="/hopemo-logo.jpg" alt="HOPEMO" />
            <p>Connecting human experience with professional insight.</p>
            <a className="footer-email" href="mailto:Ceo@hopemoai.in">
              Ceo@hopemoai.in
            </a>
          </div>
          <div>
            <h3>Quick links</h3>
            <button onClick={() => onNavigate("features")}>Features</button>
            <button onClick={() => onNavigate("how-it-works")}>
              How it works
            </button>
            <button onClick={() => onNavigate("use-cases")}>Use cases</button>
            <button onClick={() => onNavigate("integrations")}>
              Integrations
            </button>
          </div>
          <div>
            <h3>Pages</h3>
            <button onClick={() => onNavigate("about")}>About</button>
            <button onClick={() => onNavigate("features")}>Feature</button>
            <button onClick={() => onNavigate("blog")}>Blog</button>
            <button onClick={() => onNavigate("waitlist")}>Waitlist</button>
            <button onClick={() => onNavigate("demo")}>Request a demo</button>
          </div>
          <div>
            <h3>Support</h3>
            <button onClick={() => onNavigate("faqs")}>FAQs</button>
            <button onClick={() => onNavigate("contact")}>Contact</button>
            <button onClick={() => onNavigate("privacy")}>
              Privacy policy
            </button>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} HOPEMO. Built for more human
            decisions.
          </span>
          <div>
            <a
              href="https://www.instagram.com/"
              target="_blank"
              rel="noreferrer"
            >
              ◎
            </a>
            <a
              href="https://www.linkedin.com/"
              target="_blank"
              rel="noreferrer"
            >
              in
            </a>
            <a
              href="https://www.facebook.com/"
              target="_blank"
              rel="noreferrer"
            >
              f
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

const pageDetails = {
  features: [
    "Core intelligence",
    "Everything you need to understand people, not just data.",
    "Hopemo organizes relevant emotional, behavioural, and engagement signals into contextual insights that help professionals understand changing experiences and choose meaningful next steps.",
  ],
  "how-it-works": [
    "How it works",
    "From human experience to professional insight.",
    "People share relevant experiences and check-ins. Hopemo connects the signals and patterns over time. Professionals review the context and use their expertise to decide what support is appropriate.",
  ],
  "use-cases": [
    "One platform. Three connections.",
    "Connecting human experience with professional insight.",
    "For psychology: client to psychologist, beyond the session. For workplaces: employee to HR, beyond the survey. For education: student to institution, beyond the classroom.",
  ],
  integrations: [
    "Platform overview",
    "One intelligent workspace for people-focused organizations.",
    "Hopemo is being built to fit existing organizational workflows, bringing relevant human signals, progress context, and professional insights together without replacing human judgment.",
  ],
  about: [
    "About HOPEMO",
    "An Emotional Intelligence OS for a more human world.",
    "We are building an intelligence layer that helps psychologists, HR teams, educators, and organizations understand people with greater context and clarity. AI provides context; people make the decisions.",
  ],
  blog: [
    "HOPEMO journal",
    "Ideas for better human understanding.",
    "Explore practical thinking on emotional intelligence, responsible AI, psychology, workplace experience, education, and people-centered technology.",
  ],
  waitlist: [
    "Build a more human future with us.",
    "Stay close to what Hopemo is building.",
    "We are building emotional intelligence infrastructure for the places where people learn, work, and seek support.",
  ],
  demo: [
    "Request a demo",
    "Ready to understand people better?",
    "See how Hopemo connects human signals, intelligence, and professional insight across psychology, workplace, education, and other people-focused organizations.",
  ],
  faqs: [
    "Frequently asked questions",
    "Clear answers for people-focused organizations.",
    "Hopemo supports professional understanding, not professional replacement. It uses relevant signals and context to help people make more informed, human-centered decisions.",
  ],
  contact: [
    "Customer support",
    "How can we help?",
    "Get help with your account, platform setup, integrations, or technical questions.",
  ],
  privacy: [
    "Privacy and security",
    "Your data deserves responsible intelligence.",
    "Privacy-first architecture, controlled access, secure data handling, responsible AI practices, and human oversight are fundamental to how Hopemo is being built.",
  ],
  "mental-report": [
    "Mental health report",
    "Your personal wellbeing questionnaire.",
    "This short self-reflection uses your selected answers to create a score-based report. It is not a diagnosis, treatment, or a substitute for professional care.",
  ],
};

const infoPageNames = new Set(Object.keys(pageDetails));

function infoPageFromAddress() {
  if (typeof window === "undefined" || !window.location.hash.startsWith("#/")) {
    return "";
  }
  const page = window.location.hash.slice(2);
  return infoPageNames.has(page) ? page : "";
}

function AboutPage({ onHome, startChat, onNavigate }) {
  const features = [
    [
      Brain,
      "Emotion AI Engine",
      "Understands emotional patterns and conversational context to create more human interactions.",
    ],
    [
      MessageCircleMore,
      "Intelligent Conversation Analysis",
      "Analyzes conversations to generate meaningful insights for organizations and support teams.",
    ],
    [
      Sparkles,
      "Personalized AI Responses",
      "Creates adaptive, human-like responses based on context and user needs.",
    ],
    [
      Bot,
      "Enterprise AI Solutions",
      "Scalable AI systems built for healthcare, education, businesses, and organizations.",
    ],
    [
      Leaf,
      "Privacy-First AI",
      "Responsible AI principles, user privacy, and secure data handling.",
    ],
    [
      Heart,
      "Human-Centered Intelligence",
      "Technology designed to support people, not replace them.",
    ],
  ];
  return (
    <main className="enterprise-page about-reference-page">
      <nav>
        <button className="page-back" onClick={onHome}>
          <ArrowLeft /> Back
        </button>
        <img
          className="enterprise-logo front-wordmark"
          src="/hopemo-logo.jpg"
          alt="HOPEMO — Emotionally Intelligent AI"
        />
        <div>
          <button
            onClick={() =>
              document
                .querySelector("#enterprise-insights")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Platform
          </button>
          <button
            onClick={() =>
              document
                .querySelector("#enterprise-use-cases")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Solutions
          </button>
          <button className="try-button" onClick={startChat}>
            Explore platform <ArrowRight />
          </button>
        </div>
      </nav>
      <section className="enterprise-hero about-reference-hero">
        <p className="about-chip">ABOUT HOPEMO</p>
        <h1>
          Human-Centered AI
          <br />
          That Understands People.
        </h1>
        <span>
          Build meaningful conversations, improve wellbeing, and deliver
          intelligent experiences with HOPEMO AI's Emotion AI platform.
        </span>
      </section>
      <section className="enterprise-meadow" aria-label="A calm HOPEMO environment">
        <img src="/home-visuals/about-meadow.png" alt="A calm meadow with wildflowers" />
        <span>HOPEMO AI</span>
      </section>
      <section className="enterprise-intro about-mission-values">
        <div className="about-mission">
          <h2>Our mission</h2>
          <p>
          HOPEMO AI understands emotional context, conversation patterns, and
          human behavior to deliver more meaningful interactions across
          communication, customer experience, employee engagement, education,
          and healthcare support.
          </p>
          <button className="try-button" onClick={startChat}>
            Explore the platform <ArrowRight />
          </button>
        </div>
        <div className="about-values">
          <h2>Our values</h2>
        <ul>
          {[
            "Emotion-aware conversations",
            "Contextual AI understanding",
            "Personalized responses",
            "Responsible AI architecture",
            "Privacy-first design",
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        </div>
      </section>
      <section className="about-journey">
        <h2>How HOPEMO started</h2>
        <article>
          <header>
            <strong>Our journey</strong>
            <span>A note from the founder</span>
          </header>
          <div>
            <p>We are building an intelligence layer that helps psychologists, HR teams, educators, and organizations understand people with greater context and clarity.</p>
            <p>HOPEMO AI helps organizations create more meaningful digital interactions across every important touchpoint, while keeping human judgment central.</p>
            <p>Our work is grounded in responsible, privacy-first intelligence that supports people rather than replacing them.</p>
            <b>Hadi Shaheed</b>
            <small>Founder, CEO</small>
          </div>
        </article>
      </section>
      <section className="enterprise-team about-reference-team">
        <p>OUR TEAM</p>
        <h2>Meet our team</h2>
        <div>
          {[
            ["Hadi Shaheed", "Founder, CEO"],
            ["Ifthis", "CMO, Co-Founder"],
            ["Fadhy", "Co-Founder"],
          ].map(([name, role]) => (
            <article key={name}>
              <div className="team-photo-placeholder" aria-hidden="true" />
              <h3>{name}</h3>
              <span>{role}</span>
            </article>
          ))}
        </div>
      </section>
      <section className="enterprise-use about-impact" id="enterprise-use-cases">
        <div>
          <p>OUR IMPACT IN NUMBERS</p>
          <h2>Human insight, made useful.</h2>
          <span>
            HOPEMO AI helps organizations create more meaningful digital
            interactions across every important touchpoint.
          </span>
          <div className="about-impact-metrics">
            {["5,000+", "20,000+", "Since 2022"].map((item) => <strong key={item}>{item}</strong>)}
          </div>
        </div>
        <aside>
          {[
            [
              "Healthcare",
              "Emotion-aware patient engagement and communication support.",
            ],
            [
              "Education",
              "Personalized learning support and student wellbeing.",
            ],
            [
              "Enterprise",
              "Employee engagement, customer support, and intelligent workplace experiences.",
            ],
          ].map(([title, copy]) => (
            <article key={title}>
              <h3>{title}</h3>
              <span>{copy}</span>
            </article>
          ))}
        </aside>
      </section>
      <section className="enterprise-insights">
        <p>AI INSIGHTS THAT DRIVE BETTER DECISIONS</p>
        <h2>Turn every conversation into a meaningful signal.</h2>
        <span>
          Understand user needs, identify trends, improve engagement, and make
          informed decisions.
        </span>
        <div>
          {[
            "Emotional Intelligence Analytics",
            "Conversation Insights",
            "Behavioral Patterns",
            "AI Performance Monitoring",
            "Intelligent Recommendations",
          ].map((item) => (
            <b key={item}>{item}</b>
          ))}
        </div>
      </section>
      <section className="enterprise-why">
        <p>WHY CHOOSE HOPEMO AI?</p>
        <h2>Human-centered. Enterprise ready. Responsible by design.</h2>
        <div>
          {[
            ["Human-Centered AI", "Technology designed around people."],
            [
              "Emotionally Intelligent",
              "AI that understands context and emotions.",
            ],
            [
              "Enterprise Ready",
              "Built for business, healthcare, and education.",
            ],
            ["Responsible AI", "Ethical, secure, and privacy-first by design."],
            [
              "Research Driven",
              "Built on years of AI research and continuous innovation.",
            ],
          ].map(([title, copy]) => (
            <article key={title}>
              <h3>{title}</h3>
              <span>{copy}</span>
            </article>
          ))}
        </div>
      </section>
      <PageClosing onHome={onHome} onNavigate={onNavigate} startChat={startChat} />
    </main>
  );
}
const infoContent = {
  features: {
    sections: [
      [
        "Core capabilities",
        [
          "Emotion-Aware Intelligence — recognize meaningful emotional signals across conversations and interactions.",
          "Behavioral Intelligence — identify patterns in engagement, behaviour, and interaction over time.",
          "AI-Powered Insights — transform complex human signals into clear, contextual insights.",
          "Smart Alerts — surface important changes and emerging patterns for professional review.",
        ],
      ],
      [
        "Built around people",
        [
          "Relevant insights and progress context in one intelligent workspace.",
          "Human oversight and professional judgment remain central to every decision.",
          "Responsible intelligence designed for the people being supported.",
        ],
      ],
    ],
  },
  "how-it-works": {
    sections: [
      [
        "The Hopemo flow",
        [
          "People share relevant experiences, check-ins, and updates.",
          "Hopemo organizes signals and identifies meaningful patterns over time.",
          "Professionals review the context, apply their expertise, and decide what action is appropriate.",
        ],
      ],
      [
        "A guiding principle",
        ["AI provides the context. People make the decisions."],
      ],
    ],
  },
  "use-cases": {
    sections: [
      [
        "Psychology — beyond the session",
        [
          "Client → Hopemo → Psychologist",
          "Collect relevant check-ins and behavioural signals between sessions, organize them over time, and bring useful context into the next conversation.",
        ],
      ],
      [
        "Workplace — beyond the survey",
        [
          "Employee → Hopemo → HR",
          "Give HR teams a clearer view of changing employee experiences beyond periodic feedback.",
        ],
      ],
      [
        "Education — beyond the classroom",
        [
          "Student → Hopemo → Institution",
          "Help educators and student-support teams understand changing engagement and behavioural signals with more context.",
        ],
      ],
    ],
  },
  integrations: {
    sections: [
      [
        "One connected intelligence layer",
        [
          "Bring relevant human signals, patterns, progress, and professional context together in one intelligent workspace.",
          "Hopemo is being built to fit existing organizational workflows and systems.",
        ],
      ],
      [
        "Where it can fit",
        [
          "Psychology and clinic workflows",
          "HR and people operations",
          "Education and student-support systems",
          "Enterprise applications, APIs, and custom integrations",
        ],
      ],
    ],
  },
  blog: {
    sections: [
      [
        "What we explore",
        [
          "Emotional intelligence and responsible AI",
          "Psychology, wellbeing, and professional support",
          "Workplace experience and people-centred organizations",
          "Education, student engagement, and connected support",
        ],
      ],
      [
        "The Hopemo perspective",
        [
          "Technology should help people understand people better — not reduce them to numbers or labels.",
        ],
      ],
    ],
  },
  waitlist: {
    sections: [
      [
        "What we're building",
        [
          "An Emotional Intelligence OS for the places where people learn, work, and seek support.",
          "One intelligence layer connecting human signals with professional insight.",
          "Privacy, human oversight, and responsible use built in from the start.",
        ],
      ],
      [
        "Who we want to build with",
        [
          "Organizations, professionals, researchers, and partners working toward a more human future.",
        ],
      ],
    ],
  },
  demo: {
    sections: [
      [
        "Explore the platform",
        [
          "See human signals, behavioural patterns, contextual insights, and professional actions in one connected view.",
          "Explore use cases across psychology, workplace, education, and people-focused organizations.",
        ],
      ],
      [
        "For your organization",
        [
          "Discuss enterprise requirements, integration possibilities, and how Hopemo can support your existing workflow.",
        ],
      ],
    ],
  },
  faqs: {
    sections: [
      [
        "Common questions",
        [
          "What is Hopemo? An Emotional Intelligence OS that helps organizations understand human signals and connect people with better support.",
          "Who is it for? Psychology, workplace, and education organizations — as well as the people they support.",
          "Does it replace professionals? No. It provides additional context so professionals can make informed, human-centred decisions.",
          "How does the AI work? It organizes relevant emotional, behavioural, and engagement signals into contextual insights.",
          "Is data private? Hopemo is built around privacy-first architecture, controlled access, and responsible data handling.",
        ],
      ],
    ],
  },
  contact: {
    sections: [
      [
        "Customer support",
        [
          "Get help with your account, platform setup, integrations, or technical questions.",
          "Ceo@hopemoai.in",
        ],
      ],
    ],
  },
  privacy: {
    sections: [
      [
        "Information we collect",
        [
          "Personal information such as your name, email address, phone number, organization details, and account information when you create an account, contact us, or use our services.",
          "Emotional and behavioural information that you choose to provide through the platform, including experiences, interactions, engagement, feedback, or wellbeing-related information.",
          "Usage, device, browser, and approximate-location data that helps us operate, secure, and improve the platform.",
          "Organization and integration data needed to deliver connected workflows and services.",
        ],
      ],
      [
        "How we use your information",
        [
          "Operate and personalize Hopemo, generate relevant insights, provide customer and technical support, and communicate important service updates.",
          "Maintain platform security and reliability, investigate misuse or security incidents, and meet applicable legal obligations.",
          "Improve our technology and understand platform usage without selling personal information.",
        ],
      ],
      [
        "Emotional intelligence and AI processing",
        [
          "Hopemo uses artificial intelligence and related technologies to help identify patterns, organize information, and generate contextual insights.",
          "AI-generated insights provide additional context; they are not definitive judgments about an individual.",
          "The relevant professional or organization remains responsible for decisions and actions involving individuals.",
        ],
      ],
      [
        "Data security and sharing",
        [
          "We use reasonable measures such as encryption, access controls, secure infrastructure, authentication, monitoring, and organizational safeguards to protect information.",
          "Information may be shared with trusted service providers when needed to operate, maintain, secure, or support Hopemo, or when required by law.",
          "We do not sell personal information.",
        ],
      ],
      [
        "Retention and your rights",
        [
          "We retain information only as long as reasonably necessary to provide services, improve the platform, meet legal obligations, resolve disputes, and protect our services.",
          "Depending on your location and applicable law, you may have rights to access, correct, delete, restrict, object to certain processing, request a copy of information, or withdraw consent where applicable.",
        ],
      ],
      [
        "Cookies and third-party services",
        [
          "Hopemo may use cookies and similar technologies to operate the website, remember preferences, understand usage, improve performance, and maintain security.",
          "Trusted third-party providers may support infrastructure, analytics, communications, security, authentication, integrations, and other operational purposes under appropriate safeguards.",
        ],
      ],
      [
        "Children, international processing, and updates",
        [
          "Hopemo is not intended to knowingly collect personal information from children except where a service is specifically designed for an educational institution or organization with appropriate authorization and safeguards.",
          "Information may be processed or stored in countries other than your own where required safeguards apply.",
          "We may update this policy as services, legal requirements, or our practices evolve. The updated date will appear at the top of this page.",
        ],
      ],
      [
        "Contact us",
        [
          "For questions about this Privacy Policy or how Hopemo processes information, contact Customer Support at Ceo@hopemoai.in.",
        ],
      ],
    ],
  },
};
function InfoPage({ page, onHome, startChat, onNavigate }) {
  const [label, title, copy] = pageDetails[page] || pageDetails.about;
  const content = infoContent[page] || infoContent.features;
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    phone: "",
    organization: "",
    subject: "",
    message: "",
  });
  const updateContactField = (event) => {
    const { name, value } = event.target;
    setContactForm((current) => ({ ...current, [name]: value }));
  };
  const sendContactEmail = (event) => {
    event.preventDefault();
    const subject =
      contactForm.subject.trim() || "How can we help your organization?";
    const body = [
      `Full name: ${contactForm.name}`,
      `Email address: ${contactForm.email}`,
      `Phone number: ${contactForm.phone || "Not provided"}`,
      `Organization: ${contactForm.organization || "Not provided"}`,
      "",
      "Message:",
      contactForm.message,
    ].join("\n");
    window.location.href = `mailto:Ceo@hopemoai.in?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  return (
    <main className="info-page">
      <nav>
        <button className="page-back" onClick={onHome}>
          <ArrowLeft /> Back
        </button>
        <img
          className="enterprise-logo front-wordmark"
          src="/hopemo-logo.jpg"
          alt="HOPEMO — Emotionally Intelligent AI"
        />
        <button className="try-button" onClick={startChat}>
          Explore platform <ArrowRight />
        </button>
      </nav>
      {page === "contact" ? (
        <section className="contact-page-section">
          <p>{label.toUpperCase()}</p>
          <h1>Get in touch with our team</h1>
          <span>
            Have questions about Hopemo, our platform, integrations, or
            enterprise solutions? Our team is ready to help you explore how
            emotional intelligence infrastructure can support your organization.
          </span>
          <div className="contact-layout">
            <aside>
              <h2>Built for people-first organizations</h2>
              <ul>
                <li>Human-centered intelligence</li>
                <li>Secure data infrastructure</li>
                <li>Privacy-first design</li>
                <li>Enterprise-ready solutions</li>
              </ul>
              <a href="mailto:Ceo@hopemoai.in">Ceo@hopemoai.in</a>
            </aside>
            <form onSubmit={sendContactEmail}>
              <label>
                Full name *
                <input
                  name="name"
                  value={contactForm.name}
                  onChange={updateContactField}
                  autoComplete="name"
                  required
                />
              </label>
              <label>
                Email address *
                <input
                  name="email"
                  type="email"
                  value={contactForm.email}
                  onChange={updateContactField}
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                Phone number
                <input
                  name="phone"
                  type="tel"
                  value={contactForm.phone}
                  onChange={updateContactField}
                  autoComplete="tel"
                />
              </label>
              <label>
                Organization
                <input
                  name="organization"
                  value={contactForm.organization}
                  onChange={updateContactField}
                  autoComplete="organization"
                />
              </label>
              <label className="contact-form-wide">
                Subject
                <input
                  name="subject"
                  value={contactForm.subject}
                  onChange={updateContactField}
                  placeholder="How can we help your organization?"
                />
              </label>
              <label className="contact-form-wide">
                Message
                <textarea
                  name="message"
                  value={contactForm.message}
                  onChange={updateContactField}
                  required
                />
              </label>
              <button className="blue-pill contact-form-wide" type="submit">
                Send Message <ArrowRight />
              </button>
            </form>
          </div>
        </section>
      ) : (
        <section>
          <p>{label.toUpperCase()}</p>
          <h1>{title}</h1>
          <span>{copy}</span>
          <div className="info-detail-grid">
            {content.sections.map(([heading, items]) => (
              <article key={heading}>
                <h2>{heading}</h2>
                {items.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </article>
            ))}
          </div>
          <button
            className="blue-pill"
            onClick={page === "privacy" ? () => onNavigate("contact") : startChat}
          >
            Talk to our team <ArrowRight />
          </button>
        </section>
      )}
      <PageClosing onHome={onHome} onNavigate={onNavigate} startChat={startChat} />
    </main>
  );
}

function PageClosing({ onHome, onNavigate, startChat }) {
  const navigate = (page) => onNavigate?.(page);
  return (
    <section className="page-closing">
      <div className="page-closing-cta">
        <p>READY TO BUILD MORE HUMAN AI EXPERIENCES?</p>
        <h2>Discover more meaningful digital experiences with HOPEMO AI.</h2>
        <span>
          Improve communication, engagement, and wellbeing with an emotionally
          intelligent AI platform.
        </span>
        <div>
          <button className="blue-pill" onClick={startChat}>
            Get started <ArrowRight />
          </button>
          <button className="white-pill" onClick={() => navigate("demo")}>
            Request a demo
          </button>
        </div>
      </div>
      <footer className="page-closing-footer">
        <div>
          <button className="page-closing-logo" onClick={onHome} aria-label="Back to home">
            <img src="/hopemo-logo.jpg" alt="HOPEMO — Emotionally Intelligent AI" />
          </button>
          <p>A more connected view of human experience.</p>
          <a href="mailto:Ceo@hopemoai.in">Ceo@hopemoai.in</a>
        </div>
        <div>
          <h3>Quick links</h3>
          <button onClick={() => navigate("features")}>Features</button>
          <button onClick={() => navigate("about")}>How it works</button>
          <button onClick={() => navigate("pricing")}>Pricing</button>
        </div>
        <div>
          <h3>Pages</h3>
          <button onClick={() => navigate("about")}>About</button>
          <button onClick={() => navigate("blog")}>Blog</button>
          <button onClick={() => navigate("waitlist")}>Waitlist</button>
        </div>
        <div>
          <h3>Support</h3>
          <button onClick={() => navigate("contact")}>Contact</button>
          <button onClick={() => navigate("privacy")}>Privacy Policy</button>
        </div>
      </footer>
    </section>
  );
}

const assessmentQuestions = [
  ["I felt emotionally balanced for most of today.", false],
  [
    "When something upset me today, I was able to recover and move forward.",
    false,
  ],
  ["My emotions felt difficult to manage today.", true],
  ["My thoughts felt clear rather than overwhelming today.", false],
  [
    "I kept dwelling on worries or negative thoughts longer than I wanted.",
    true,
  ],
  ["I was able to focus on what mattered today.", false],
  [
    "I had enough energy and motivation to do what I needed to do today.",
    false,
  ],
  ["I found moments of enjoyment, meaning, or satisfaction in my day.", false],
  ["Much of today felt like I was simply trying to get through it.", true],
  ["I treated myself with kindness when things didn't go as planned.", false],
  ["I felt capable of handling today's challenges.", false],
  ["I felt hopeful about tomorrow.", false],
  ["I felt emotionally connected to at least one person today.", false],
  ["I felt comfortable being myself today.", false],
  ["Small difficulties felt bigger than I could cope with today.", true],
];
const assessmentChoices = [
  "Strongly disagree",
  "Disagree",
  "Neither agree nor disagree",
  "Agree",
  "Strongly agree",
];

function MentalHealthReport({ onHome }) {
  const [page, setPage] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showResult, setShowResult] = useState(false);
  const pageQuestions = assessmentQuestions.slice(page * 5, page * 5 + 5);
  const pageComplete = pageQuestions.every(
    (_, index) => answers[page * 5 + index],
  );
  const score = assessmentQuestions.reduce(
    (total, [, reverse], index) =>
      total + (reverse ? 6 - (answers[index] || 0) : answers[index] || 0),
    0,
  );
  const continueAssessment = () => {
    if (!pageComplete) return;
    if (page === 2) setShowResult(true);
    else setPage((current) => current + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <main className="assessment-page">
      <nav>
        <button className="page-back" onClick={onHome}>
          <ArrowLeft /> Back
        </button>
        <img
          className="enterprise-logo front-wordmark"
          src="/hopemo-logo.jpg"
          alt="HOPEMO"
        />
        <span>Daily wellbeing check-in</span>
      </nav>
      {showResult ? (
        <section className="assessment-result">
          <p>YOUR REFLECTION SCORE</p>
          <strong>
            {score}
            <small>/75</small>
          </strong>
          <h1>Your personal report is ready.</h1>
          <span>
            Your responses have been scored using the questionnaire you
            completed today. This is a self-reflection tool, not a diagnosis or
            medical advice.
          </span>
          <a
            className="blue-pill"
            href={`/reports/${score}.pdf`}
            download={`hopemo-report-${score}.pdf`}
          >
            Download my report <ArrowRight />
          </a>
          <button
            className="assessment-secondary"
            onClick={() => {
              setPage(0);
              setAnswers({});
              setShowResult(false);
            }}
          >
            Start a new check-in
          </button>
          <small>Report file: {score}.pdf</small>
        </section>
      ) : (
        <section className="assessment-card">
          <div className="assessment-progress">
            <span>QUESTION SET {page + 1} OF 3</span>
            <b>
              {page * 5 + 1}-{page * 5 + 5} of 15
            </b>
            <div>
              <i style={{ width: `${((page + 1) / 3) * 100}%` }} />
            </div>
          </div>
          <h1>Take a moment to reflect on today.</h1>
          <p>
            Choose the response that feels most true for you. There are no right
            or wrong answers.
          </p>
          <div className="assessment-questions">
            {pageQuestions.map(([question], localIndex) => {
              const index = page * 5 + localIndex;
              return (
                <article key={question}>
                  <h2>
                    <span>{index + 1}</span>
                    {question}
                  </h2>
                  <div>
                    {assessmentChoices.map((label, choiceIndex) => (
                      <button
                        className={
                          answers[index] === choiceIndex + 1 ? "selected" : ""
                        }
                        onClick={() =>
                          setAnswers((current) => ({
                            ...current,
                            [index]: choiceIndex + 1,
                          }))
                        }
                        key={label}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="assessment-actions">
            {page > 0 && (
              <button
                className="assessment-secondary"
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
            )}
            <button
              className="blue-pill"
              onClick={continueAssessment}
              disabled={!pageComplete}
            >
              {page === 2 ? "View my report" : "Continue"}
              <ArrowRight />
            </button>
          </div>
          {!pageComplete && (
            <small className="assessment-note">
              Answer all five statements to continue.
            </small>
          )}
        </section>
      )}
    </main>
  );
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="recovery-screen">
          <div>
            <span className="modal-leaf">
              <Leaf />
            </span>
            <h1>Let’s start fresh.</h1>
            <p>
              We couldn’t open this screen. Returning home will keep your saved
              sign-in session.
            </p>
            <button
              className="dark-pill"
              onClick={() => {
                window.location.hash = "#top";
                window.location.reload();
              }}
            >
              Return home <ArrowRight />
            </button>
          </div>
        </main>
      );
    return this.props.children;
  }
}

function HopemoApp() {
  const [screen, setScreen] = useState("home");
  const [authOpen, setAuthOpen] = useState(false);
  const [infoPage, setInfoPage] = useState(infoPageFromAddress);
  const landingScrollPosition = useRef(0);
  const returnToLanding = useRef(false);
  const [token, setToken] = useState(
    localStorage.getItem("hopemo_access_token") || "",
  );
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("hopemo_user")) || null;
    } catch {
      return null;
    }
  });
  function rememberLandingPosition() {
    if (screen === "home" && !infoPage) {
      landingScrollPosition.current = window.scrollY;
      returnToLanding.current = true;
    }
  }
  function startChat() {
    rememberLandingPosition();
    setInfoPage("");
    setScreen("chat");
  }
  function startStudentSuccess() {
    if (!token) {
      setAuthOpen(true);
      return;
    }
    rememberLandingPosition();
    setInfoPage("");
    setScreen("student");
  }
  function startStudentCoach() {
    setInfoPage("");
    setScreen("student-coach");
  }
  function authSuccess(data) {
    localStorage.setItem("hopemo_access_token", data.access_token);
    localStorage.setItem("hopemo_user", JSON.stringify(data.user));
    setToken(data.access_token);
    setUser(data.user);
    setAuthOpen(false);
    setScreen("chat");
  }
  function logout() {
    localStorage.removeItem("hopemo_access_token");
    localStorage.removeItem("hopemo_user");
    localStorage.removeItem("hopemo_conversation_id");
    setToken("");
    setUser(null);
    setScreen("home");
  }
  function sessionExpired() {
    logout();
    setScreen("chat");
    setAuthOpen(true);
  }

  function navigateToInfoPage(page) {
    const returningToLanding = !page && Boolean(infoPage);
    if (page && !infoPage && screen === "home") {
      landingScrollPosition.current = window.scrollY;
    }
    const nextHash = page ? `#/${page}` : "";
    if (window.location.hash !== nextHash) {
      window.history.pushState(
        { hopemoPage: page || "home" },
        "",
        `${window.location.pathname}${window.location.search}${nextHash}`,
      );
    }
    setInfoPage(page);
    setScreen("home");
    if (returningToLanding) {
      window.requestAnimationFrame(() =>
        window.scrollTo({ top: landingScrollPosition.current, behavior: "auto" }),
      );
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  useEffect(() => {
    const restoreFromBrowserHistory = () => {
      const nextPage = infoPageFromAddress();
      setInfoPage(nextPage);
      setScreen("home");
      window.requestAnimationFrame(() =>
        window.scrollTo({
          top: nextPage ? 0 : landingScrollPosition.current,
          behavior: "auto",
        }),
      );
    };
    window.addEventListener("popstate", restoreFromBrowserHistory);
    return () => window.removeEventListener("popstate", restoreFromBrowserHistory);
  }, []);

  useEffect(() => {
    if (!infoPage) return;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  }, [infoPage]);

  const goHome = () => {
    if (returnToLanding.current) {
      returnToLanding.current = false;
      setInfoPage("");
      setScreen("home");
      window.requestAnimationFrame(() =>
        window.scrollTo({ top: landingScrollPosition.current, behavior: "auto" }),
      );
      return;
    }
    navigateToInfoPage("");
  };
  return (
    <>
      {screen === "chat" ? (
        <ChatScreen
          key={user?.email || "guest"}
          user={user}
          logout={logout}
          onHome={goHome}
          onSignIn={() => setAuthOpen(true)}
          onSessionExpired={sessionExpired}
        />
      ) : screen === "student-coach" ? (
        <ChatScreen
          key={`${user?.email || "guest"}-coach`}
          user={user}
          logout={logout}
          onHome={() => setScreen("student")}
          onSignIn={() => setAuthOpen(true)}
          onSessionExpired={sessionExpired}
          studentCoach
          onStudentSuccess={() => setScreen("student")}
        />
      ) : screen === "student" ? (
        <StudentSuccess
          token={token}
          user={user}
          onHome={goHome}
          onChat={startStudentCoach}
          onSignIn={() => setAuthOpen(true)}
          onSessionExpired={sessionExpired}
        />
      ) : infoPage === "mental-report" ? (
        <MentalHealthReport onHome={goHome} />
      ) : infoPage === "about" ? (
        <AboutPage
          onHome={goHome}
          startChat={startChat}
          onNavigate={navigateToInfoPage}
        />
      ) : infoPage ? (
        <InfoPage
          page={infoPage}
          onHome={goHome}
          startChat={startChat}
          onNavigate={navigateToInfoPage}
        />
      ) : (
        <Landing
          startChat={startChat}
          token={token}
          logout={logout}
          openReport={() => navigateToInfoPage("mental-report")}
          onNavigate={(page) => {
            if (page === "student-success") startStudentSuccess();
            else navigateToInfoPage(page);
          }}
        />
      )}
      {authOpen && (
        <AuthModal onSuccess={authSuccess} onClose={() => setAuthOpen(false)} />
      )}
    </>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <HopemoApp />
    </AppErrorBoundary>
  );
}
