const DATA_URL = "data/quiz-data.json";
const COOKIE_PREFIX = "mbi_quiz_state";
const COOKIE_DAYS = 30;

let quizData = null;
let currentQuestionIndex = 0;
let selectedAnswers = [];
let finishedResultKey = null;
let latestScores = {};

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

    const restored = restoreState();
    if (restored) el.restoreBanner.hidden = false;

    if (finishedResultKey) {
      latestScores = calculateScores();
      showResult(finishedResultKey);
    } else {
      startQuiz();
    }
  } catch (error) {
    el.title.textContent = "Could not load quiz";
    el.subtitle.textContent = "Make sure the data folder and quiz-data.json file are uploaded with this page.";
    console.error(error);
  }
}

function renderIntro() {
  el.title.textContent = quizData.meta?.title || "What Market-Based Instrument Are You?";
  el.subtitle.textContent = quizData.meta?.subtitle || "";
  el.intro.textContent = quizData.meta?.intro || "";
}

function wireEvents() {
  el.backButton.addEventListener("click", goBack);
  el.clearButton.addEventListener("click", clearAndRestart);
  el.retakeButton.addEventListener("click", clearAndRestart);
  el.clearResultButton.addEventListener("click", clearAndRestart);
  el.shareButton.addEventListener("click", shareResult);

  el.howToPlayButton.addEventListener("click", () => {
    if (typeof el.howToPlayModal.showModal === "function") el.howToPlayModal.showModal();
  });
  el.closeHowToPlay.addEventListener("click", () => el.howToPlayModal.close());
  el.howToPlayModal.addEventListener("click", (event) => {
    if (event.target === el.howToPlayModal) el.howToPlayModal.close();
  });
}

function startQuiz() {
  finishedResultKey = null;
  el.resultPanel.hidden = true;
  el.questionPanel.hidden = false;
  renderQuestion();
}

function renderQuestion() {
  const question = quizData.questions[currentQuestionIndex];
  const total = quizData.questions.length;
  el.questionKicker.textContent = question.kicker || `Question ${currentQuestionIndex + 1}`;
  el.questionTitle.textContent = question.prompt;
  el.progressText.textContent = `${currentQuestionIndex + 1} / ${total}`;
  el.progressFill.style.width = `${((currentQuestionIndex + 1) / total) * 100}%`;
  el.backButton.disabled = currentQuestionIndex === 0;
  el.answersGrid.innerHTML = "";

  question.answers.forEach((answer) => {
    const node = el.answerTemplate.content.firstElementChild.cloneNode(true);
    const image = node.querySelector(".answer-image");
    node.querySelector(".answer-text").textContent = answer.text;
    image.src = answer.image?.url || "";
    image.alt = answer.image?.label || answer.text;
    image.loading = "lazy";
    node.addEventListener("click", () => chooseAnswer(answer.id));
    el.answersGrid.appendChild(node);
  });
}

function chooseAnswer(answerId) {
  selectedAnswers[currentQuestionIndex] = answerId;

  if (currentQuestionIndex < quizData.questions.length - 1) {
    currentQuestionIndex += 1;
    saveState();
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  latestScores = calculateScores();
  finishedResultKey = pickWinner(latestScores);
  saveState();
  showResult(finishedResultKey);
}

function goBack() {
  if (currentQuestionIndex === 0) return;
  currentQuestionIndex -= 1;
  finishedResultKey = null;
  saveState();
  renderQuestion();
}

function calculateScores() {
  const scores = Object.fromEntries(Object.keys(quizData.results).map((key) => [key, 0]));

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
  const tieBreaker = quizData.scoring?.tieBreaker || Object.keys(quizData.results);
  return Object.keys(quizData.results).sort((a, b) => {
    const scoreDifference = (scores[b] || 0) - (scores[a] || 0);
    if (scoreDifference !== 0) return scoreDifference;
    return tieBreaker.indexOf(a) - tieBreaker.indexOf(b);
  })[0];
}

function showResult(resultKey) {
  const result = quizData.results[resultKey];
  if (!result) return clearAndRestart();

  el.questionPanel.hidden = true;
  el.resultPanel.hidden = false;
  el.shareFeedback.textContent = "";

  const [startColor, endColor] = result.palette || ["#dfeccf", "#fffaf0"];
  el.resultHero.style.background = `linear-gradient(135deg, ${startColor}, ${endColor})`;
  el.resultLabel.textContent = quizData.meta?.resultLabel || "Your result";
  el.resultIcon.textContent = iconFor(resultKey);
  el.resultTitle.textContent = result.name;
  el.resultSubtitle.textContent = result.subtitle || "";
  el.resultDescription.textContent = result.description || "";
  el.resultBadge.textContent = result.badge || result.name;

  el.fitList.innerHTML = "";
  (result.whyItFits || []).forEach((item) => {
    const div = document.createElement("div");
    div.className = "fit-item";
    div.textContent = item;
    el.fitList.appendChild(div);
  });

  renderScoreBreakdown();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderScoreBreakdown() {
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
      el.shareFeedback.textContent = "Shared.";
      return;
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    el.shareFeedback.textContent = "Result copied to clipboard.";
  } catch (error) {
    el.shareFeedback.textContent = "Could not share automatically. You can copy the page link manually.";
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
  if (!raw) return false;
  try {
    const state = JSON.parse(raw);
    if (state.version !== (quizData.meta?.version || "v1")) return false;
    selectedAnswers = Array.isArray(state.selectedAnswers) ? state.selectedAnswers : [];
    currentQuestionIndex = Number.isInteger(state.currentQuestionIndex) ? state.currentQuestionIndex : 0;
    currentQuestionIndex = Math.max(0, Math.min(currentQuestionIndex, quizData.questions.length - 1));
    finishedResultKey = state.finishedResultKey || null;
    return true;
  } catch {
    return false;
  }
}

function clearAndRestart() {
  deleteCookie(cookieName());
  selectedAnswers = [];
  currentQuestionIndex = 0;
  finishedResultKey = null;
  latestScores = {};
  el.restoreBanner.hidden = true;
  startQuiz();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setCookie(name, value, days) {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${date.toUTCString()};path=/;SameSite=Lax`;
}

function getCookie(name) {
  return document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split("=")
    .slice(1)
    .join("=")
    ? decodeURIComponent(
        document.cookie
          .split(";")
          .map((cookie) => cookie.trim())
          .find((cookie) => cookie.startsWith(`${name}=`))
          .split("=")
          .slice(1)
          .join("=")
      )
    : "";
}

function deleteCookie(name) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
}
