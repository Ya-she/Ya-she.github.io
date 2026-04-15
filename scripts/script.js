const DATA_URL = "data/quiz-data.json";
const COOKIE_PREFIX = "mbi_quiz_state";
const LEGACY_COOKIE_NAME = "nbs_quiz_state";
const COOKIE_DAYS = 30;

let quizData = null;
let currentQuestionIndex = 0;
let selectedAnswers = [];
let finishedResultKey = null;
let latestScores = {};
let restoredProgress = false;

const el = {
  title: document.getElementById("quiz-title"),
  subtitle: document.getElementById("quiz-subtitle"),
  intro: document.getElementById("quiz-intro"),
  questionPanel: document.getElementById("question-panel"),
  resultPanel: document.getElementById("result-panel"),
  questionKicker: document.getElementById("question-kicker"),
  questionTitle: document.getElementById("question-title"),
  progressText: document.getElementById("progress-text"),
  progressFill: document.getElementById("progress-fill"),
  answersGrid: document.getElementById("answers-grid"),
  answerTemplate: document.getElementById("answer-card-template"),
  backButton: document.getElementById("back-button"),
  clearButton: document.getElementById("clear-button"),
  restoreBanner: document.getElementById("restore-banner"),
  resultHero: document.getElementById("result-hero"),
  resultLabel: document.getElementById("result-label"),
  resultIcon: document.getElementById("result-icon"),
  resultTitle: document.getElementById("result-title"),
  resultSubtitle: document.getElementById("result-subtitle"),
  resultDescription: document.getElementById("result-description"),
  resultBadge: document.getElementById("result-badge"),
  fitList: document.getElementById("fit-list"),
  scoreBreakdown: document.getElementById("score-breakdown"),
  retakeButton: document.getElementById("retake-button"),
  clearResultButton: document.getElementById("clear-result-button"),
  shareButton: document.getElementById("share-button"),
  shareFeedback: document.getElementById("share-feedback"),
  howToPlayButton: document.getElementById("how-to-play-button"),
  howToPlayModal: document.getElementById("how-to-play-modal"),
  closeHowToPlay: document.getElementById("close-how-to-play"),
};

init();

async function init() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${DATA_URL}`);
    quizData = await response.json();

    renderIntro();
    wireEvents();

    restoredProgress = restoreState();
    setRestoreBanner(restoredProgress);

    if (finishedResultKey) {
      latestScores = calculateScores();
      showResult(finishedResultKey, { scroll: false });
    } else {
      startQuiz({ scroll: false });
    }
  } catch (error) {
    if (el.title) el.title.textContent = "Could not load quiz";
    if (el.subtitle) el.subtitle.textContent = "Make sure the data folder and quiz-data.json file are uploaded with this page.";
    setRestoreBanner(false);
    console.error(error);
  }
}

function renderIntro() {
  if (el.title) el.title.textContent = quizData.meta?.title || "What Market-Based Instrument Are You?";
  if (el.subtitle) el.subtitle.textContent = quizData.meta?.subtitle || "";
  if (el.intro) el.intro.textContent = quizData.meta?.intro || "";
  document.title = quizData.meta?.title || document.title;
}

function wireEvents() {
  el.backButton?.addEventListener("click", goBack);
  el.clearButton?.addEventListener("click", clearAndRestart);
  el.retakeButton?.addEventListener("click", clearAndRestart);
  el.clearResultButton?.addEventListener("click", clearAndRestart);
  el.shareButton?.addEventListener("click", shareResult);

  el.howToPlayButton?.addEventListener("click", () => {
    if (typeof el.howToPlayModal?.showModal === "function") {
      el.howToPlayModal.showModal();
    }
  });
  el.closeHowToPlay?.addEventListener("click", () => el.howToPlayModal?.close());
  el.howToPlayModal?.addEventListener("click", (event) => {
    if (event.target === el.howToPlayModal) el.howToPlayModal.close();
  });
}

function startQuiz(options = {}) {
  finishedResultKey = null;
  latestScores = {};
  if (el.resultPanel) el.resultPanel.hidden = true;
  if (el.questionPanel) el.questionPanel.hidden = false;
  if (el.shareFeedback) el.shareFeedback.textContent = "";
  renderQuestion();

  if (options.scroll) {
    scrollToQuizArea();
  }
}

function renderQuestion() {
  const question = quizData?.questions?.[currentQuestionIndex];
  if (!question) {
    clearAndRestart({ scroll: false });
    return;
  }

  const total = quizData.questions.length;
  if (el.questionKicker) el.questionKicker.textContent = question.kicker || `Question ${currentQuestionIndex + 1}`;
  if (el.questionTitle) el.questionTitle.textContent = question.prompt;
  if (el.progressText) el.progressText.textContent = `${currentQuestionIndex + 1} / ${total}`;
  if (el.progressFill) el.progressFill.style.width = `${((currentQuestionIndex + 1) / total) * 100}%`;
  if (el.backButton) el.backButton.disabled = currentQuestionIndex === 0;
  if (!el.answersGrid || !el.answerTemplate) return;

  el.answersGrid.innerHTML = "";

  question.answers.forEach((answer) => {
    const node = el.answerTemplate.content.firstElementChild.cloneNode(true);
    const image = node.querySelector(".answer-image");
    const text = node.querySelector(".answer-text");

    if (text) text.textContent = answer.text;
    if (image) {
      image.src = answer.image?.url || "";
      image.alt = answer.image?.label || answer.text;
      image.loading = "lazy";
    }

    if (selectedAnswers[currentQuestionIndex] === answer.id) {
      node.classList.add("is-selected");
    }

    node.addEventListener("click", () => chooseAnswer(answer.id));
    el.answersGrid.appendChild(node);
  });
}

function chooseAnswer(answerId) {
  setRestoreBanner(false);
  restoredProgress = false;
  selectedAnswers[currentQuestionIndex] = answerId;

  if (currentQuestionIndex < quizData.questions.length - 1) {
    currentQuestionIndex += 1;
    saveState();
    renderQuestion();
    // Do not scroll to the top after each answer. This keeps the next answers in view.
    return;
  }

  latestScores = calculateScores();
  finishedResultKey = pickWinner(latestScores);
  saveState();
  showResult(finishedResultKey, { scroll: true });
}

function goBack() {
  if (currentQuestionIndex === 0) return;
  currentQuestionIndex -= 1;
  finishedResultKey = null;
  saveState();
  renderQuestion();
}

function calculateScores() {
  const scores = Object.fromEntries(Object.keys(quizData.results || {}).map((key) => [key, 0]));

  selectedAnswers.forEach((answerId, index) => {
    const question = quizData.questions[index];
    const answer = question?.answers.find((item) => item.id === answerId);
    if (!answer?.points) return;
    Object.entries(answer.points).forEach(([key, value]) => {
      scores[key] = (scores[key] || 0) + Number(value || 0);
    });
  });

  return scores;
}

function pickWinner(scores) {
  const resultKeys = Object.keys(quizData.results || {});
  const tieBreaker = quizData.scoring?.tieBreaker || resultKeys;
  return resultKeys.sort((a, b) => {
    const scoreDifference = (scores[b] || 0) - (scores[a] || 0);
    if (scoreDifference !== 0) return scoreDifference;
    return tieBreaker.indexOf(a) - tieBreaker.indexOf(b);
  })[0];
}

function showResult(resultKey, options = {}) {
  const result = quizData.results?.[resultKey];
  if (!result) {
    clearAndRestart({ scroll: false });
    return;
  }

  if (el.questionPanel) el.questionPanel.hidden = true;
  if (el.resultPanel) el.resultPanel.hidden = false;
  if (el.shareFeedback) el.shareFeedback.textContent = "";

  const [startColor, endColor] = result.palette || ["#dfeccf", "#fffaf0"];
  if (el.resultHero) el.resultHero.style.background = `linear-gradient(135deg, ${startColor}, ${endColor})`;
  if (el.resultLabel) el.resultLabel.textContent = quizData.meta?.resultLabel || "Your result";
  if (el.resultIcon) el.resultIcon.textContent = iconFor(resultKey);
  if (el.resultTitle) el.resultTitle.textContent = result.name;
  if (el.resultSubtitle) el.resultSubtitle.textContent = result.subtitle || "";
  if (el.resultDescription) el.resultDescription.textContent = result.description || "";
  if (el.resultBadge) el.resultBadge.textContent = result.badge || result.name;

  if (el.fitList) {
    el.fitList.innerHTML = "";
    (result.whyItFits || []).forEach((item) => {
      const div = document.createElement("div");
      div.className = "fit-item";
      div.textContent = item;
      el.fitList.appendChild(div);
    });
  }

  renderScoreBreakdown();

  if (options.scroll) {
    scrollToQuizArea();
  }
}

function renderScoreBreakdown() {
  if (!el.scoreBreakdown) return;
  const scores = latestScores && Object.keys(latestScores).length ? latestScores : calculateScores();
  const maxScore = Math.max(1, ...Object.values(scores));
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  el.scoreBreakdown.innerHTML = "";

  sorted.forEach(([key, score]) => {
    const row = document.createElement("div");
    row.className = "score-row";

    const label = document.createElement("span");
    label.textContent = quizData.results[key]?.name || key;

    const bar = document.createElement("div");
    bar.className = "score-bar";
    const fill = document.createElement("div");
    fill.className = "score-bar-fill";
    fill.style.width = `${(score / maxScore) * 100}%`;
    bar.appendChild(fill);

    const value = document.createElement("span");
    value.textContent = score;

    row.append(label, bar, value);
    el.scoreBreakdown.appendChild(row);
  });
}

async function shareResult() {
  if (!finishedResultKey) return;
  const result = quizData.results[finishedResultKey];
  const text = `I got ${result.name} on What MBI Are You?`;
  const url = window.location.href.split("#")[0];
  const shareData = { title: quizData.meta?.title || "What MBI Are You?", text, url };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      if (el.shareFeedback) el.shareFeedback.textContent = "Shared.";
      return;
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    if (el.shareFeedback) el.shareFeedback.textContent = "Result copied to clipboard.";
  } catch (error) {
    if (el.shareFeedback) el.shareFeedback.textContent = "Could not share automatically. You can copy the page link manually.";
  }
}

function iconFor(key) {
  return {
    nbs: "🌿",
    nature_as_infrastructure: "🌉",
    carbon_offset_biodiversity: "🦜",
    ccs: "🪨",
    pes: "💸",
    biodiversity_credits: "🧬",
    redd_plus: "🌲",
  }[key] || "🌍";
}

function cookieName() {
  const version = quizData?.meta?.version || "v1";
  return `${COOKIE_PREFIX}_${version}`;
}

function saveState() {
  if (!quizData) return;

  const state = {
    version: quizData.meta?.version || "v1",
    currentQuestionIndex,
    selectedAnswers,
    finishedResultKey,
  };
  setCookie(cookieName(), JSON.stringify(state), COOKIE_DAYS);
}

function restoreState() {
  const raw = getCookie(cookieName());
  if (!raw) {
    deleteCookie(LEGACY_COOKIE_NAME);
    return false;
  }

  try {
    const savedState = JSON.parse(raw);
    const expectedVersion = quizData.meta?.version || "v1";

    if (savedState.version !== expectedVersion) {
      deleteCookie(cookieName());
      return false;
    }

    const questionCount = quizData.questions.length;
    const restoredAnswers = Array.isArray(savedState.selectedAnswers)
      ? savedState.selectedAnswers.slice(0, questionCount)
      : [];

    const validAnswers = restoredAnswers.map((answerId, questionIndex) => {
      const question = quizData.questions[questionIndex];
      return question?.answers.some((answer) => answer.id === answerId) ? answerId : undefined;
    });

    const hasAnsweredAnything = validAnswers.some((answerId) => answerId !== undefined);
    const restoredResultKey = quizData.results?.[savedState.finishedResultKey]
      ? savedState.finishedResultKey
      : null;

    // Empty cookies should not trigger the restored banner or leave the page in a half-loaded state.
    if (!hasAnsweredAnything && !restoredResultKey) {
      deleteCookie(cookieName());
      deleteCookie(LEGACY_COOKIE_NAME);
      return false;
    }

    selectedAnswers = validAnswers;
    finishedResultKey = restoredResultKey;

    if (finishedResultKey) {
      currentQuestionIndex = questionCount - 1;
    } else {
      const firstUnansweredIndex = validAnswers.findIndex((answerId) => answerId === undefined);
      currentQuestionIndex = firstUnansweredIndex === -1
        ? Math.max(0, questionCount - 1)
        : firstUnansweredIndex;
    }

    currentQuestionIndex = Math.max(0, Math.min(currentQuestionIndex, questionCount - 1));
    deleteCookie(LEGACY_COOKIE_NAME);
    return true;
  } catch (error) {
    console.warn("Saved quiz progress was invalid and has been cleared.", error);
    deleteCookie(cookieName());
    deleteCookie(LEGACY_COOKIE_NAME);
    return false;
  }
}

function clearAndRestart(options = {}) {
  deleteCookie(cookieName());
  deleteCookie(LEGACY_COOKIE_NAME);
  selectedAnswers = [];
  currentQuestionIndex = 0;
  finishedResultKey = null;
  latestScores = {};
  restoredProgress = false;
  setRestoreBanner(false);
  startQuiz({ scroll: options.scroll ?? true });
}

function setRestoreBanner(show) {
  if (el.restoreBanner) el.restoreBanner.hidden = !show;
}

function scrollToQuizArea() {
  const target = el.questionPanel && !el.questionPanel.hidden ? el.questionPanel : el.resultPanel;
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setCookie(name, value, days) {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${date.toUTCString()};path=/;SameSite=Lax`;
}

function getCookie(name) {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));

  if (!cookie) return "";
  return decodeURIComponent(cookie.slice(prefix.length));
}

function deleteCookie(name) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
}
