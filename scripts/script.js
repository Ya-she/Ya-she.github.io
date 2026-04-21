const DEFAULT_DATA_URL = "data/quiz-data.json";
const DATA_URL = document.body?.dataset?.quizDataUrl || DEFAULT_DATA_URL;
const LEGACY_COOKIE_NAMES = ["nbs_quiz_state", "mbi_quiz_state", "mbi_quiz_state_mbi-quiz-v2"];

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
  restartButton: document.getElementById("clear-button"),
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
  questionAnchor: document.getElementById("question-anchor"),
};

init();

async function init() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${DATA_URL}`);

    quizData = await response.json();

    removeOldQuizCookies();
    renderIntro();
    wireEvents();
    hideRestoreBanner();
    startQuiz({ scroll: false });
  } catch (error) {
    if (el.title) el.title.textContent = "Could not load quiz";
    if (el.subtitle) {
      el.subtitle.textContent = `Make sure ${DATA_URL} is uploaded with this page.`;
    }
    hideRestoreBanner();
    console.error(error);
  }
}

function renderIntro() {
  if (el.title) el.title.textContent = quizData.meta?.title || document.title;
  if (el.subtitle) el.subtitle.textContent = quizData.meta?.subtitle || "";
  if (el.intro) el.intro.textContent = quizData.meta?.intro || "";
  document.title = quizData.meta?.title || document.title;
}

function wireEvents() {
  el.backButton?.addEventListener("click", goBack);
  el.restartButton?.addEventListener("click", restartQuiz);
  el.retakeButton?.addEventListener("click", restartQuiz);
  el.clearResultButton?.addEventListener("click", restartQuiz);
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
  currentQuestionIndex = 0;
  selectedAnswers = [];
  finishedResultKey = null;
  latestScores = {};

  if (el.resultPanel) el.resultPanel.hidden = true;
  if (el.questionPanel) el.questionPanel.hidden = false;
  if (el.shareFeedback) el.shareFeedback.textContent = "";

  hideRestoreBanner();
  renderQuestion();

  if (options.scroll) scrollToQuizArea();
}

function restartQuiz(options = {}) {
  removeOldQuizCookies();
  startQuiz({ scroll: options.scroll ?? true });
}

function renderQuestion() {
  const question = quizData?.questions?.[currentQuestionIndex];
  if (!question) {
    startQuiz({ scroll: false });
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
      if (answer.image?.url) {
        image.src = answer.image.url;
        image.alt = answer.image?.label || answer.text;
        image.loading = "lazy";
      } else {
        image.remove();
      }
    }

    if (selectedAnswers[currentQuestionIndex] === answer.id) {
      node.classList.add("is-selected");
    }

    node.addEventListener("click", () => chooseAnswer(answer.id));
    el.answersGrid.appendChild(node);
  });
}

function chooseAnswer(answerId) {
  selectedAnswers[currentQuestionIndex] = answerId;

  if (currentQuestionIndex < quizData.questions.length - 1) {
    currentQuestionIndex += 1;
    renderQuestion();
    scrollToQuizArea();
    return;
  }

  latestScores = calculateScores();
  finishedResultKey = pickWinner(latestScores);
  showResult(finishedResultKey, { scroll: true });
}

function goBack() {
  if (currentQuestionIndex === 0) return;
  currentQuestionIndex -= 1;
  finishedResultKey = null;
  renderQuestion();
  scrollToQuizArea();
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


function distributePercentages(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) {
    return values.map((_, index) => index === 0 ? 100 : 0);
  }

  const raw = values.map((value) => (value / total) * 100);
  const ints = raw.map(Math.floor);
  let remainder = 100 - ints.reduce((sum, value) => sum + value, 0);

  const ranked = raw
    .map((value, index) => ({ index, frac: value - ints[index], raw: value }))
    .sort((a, b) => b.frac - a.frac || b.raw - a.raw || a.index - b.index);

  for (let i = 0; i < ranked.length && remainder > 0; i += 1, remainder -= 1) {
    ints[ranked[i].index] += 1;
  }

  return ints;
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
    startQuiz({ scroll: false });
    return;
  }

  if (el.questionPanel) el.questionPanel.hidden = true;
  if (el.resultPanel) el.resultPanel.hidden = false;
  if (el.shareFeedback) el.shareFeedback.textContent = "";

  const [startColor, endColor] = result.palette || ["#dfeccf", "#fffaf0"];
  if (el.resultHero) el.resultHero.style.background = `linear-gradient(135deg, ${startColor}, ${endColor})`;
  if (el.resultLabel) el.resultLabel.textContent = quizData.meta?.resultLabel || "Your result";
  if (el.resultIcon) el.resultIcon.textContent = result.emoji || iconFor(resultKey);
  if (el.resultTitle) el.resultTitle.textContent = result.name || "";
  if (el.resultSubtitle) el.resultSubtitle.textContent = result.subtitle || result.badge || "";
  if (el.resultDescription) el.resultDescription.textContent = result.description || "";
  if (el.resultBadge) el.resultBadge.textContent = result.badge || result.name || "";

  if (el.fitList) {
    el.fitList.innerHTML = "";
    (result.whyItFits || result.traits || []).forEach((item) => {
      const div = document.createElement("div");
      div.className = "fit-item";
      div.textContent = item;
      el.fitList.appendChild(div);
    });
  }

  renderScoreBreakdown();

  if (options.scroll) scrollToQuizArea();
}

function renderScoreBreakdown() {
  if (!el.scoreBreakdown) return;

  const scores = latestScores && Object.keys(latestScores).length ? latestScores : calculateScores();
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const percentages = distributePercentages(sorted.map(([, score]) => score));

  el.scoreBreakdown.innerHTML = "";

  sorted.forEach(([key], index) => {
    const percent = percentages[index];
    const row = document.createElement("div");
    row.className = "score-row";

    const label = document.createElement("span");
    label.textContent = quizData.results[key]?.name || key;

    const bar = document.createElement("div");
    bar.className = "score-bar";

    const fill = document.createElement("div");
    fill.className = "score-bar-fill";
    fill.style.width = `${percent}%`;
    bar.appendChild(fill);

    const value = document.createElement("span");
    value.textContent = `${percent}%`;

    row.append(label, bar, value);
    el.scoreBreakdown.appendChild(row);
  });
}

async function shareResult() {
  if (!finishedResultKey) return;

  const shareText = buildShareText();

  try {
    await navigator.clipboard.writeText(shareText);
    if (el.shareFeedback) el.shareFeedback.textContent = "Result copied to clipboard.";
  } catch (error) {
    if (el.shareFeedback) {
      el.shareFeedback.textContent = "Could not copy automatically. Please copy your result manually.";
    }
  }
}

function buildShareText() {
  const result = quizData.results[finishedResultKey];
  const scores = latestScores && Object.keys(latestScores).length ? latestScores : calculateScores();
  const sortedScores = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const percentages = distributePercentages(sortedScores.map(([, score]) => score));
  const resultLabel = quizData.meta?.resultLabel || "Your result";
  const url = "https://ya-she.github.io";

  const fitHeading = result.whyItFits ? "Why this fits:" : "Traits:";
  const fitLines = (result.whyItFits || result.traits || [])
    .map((item) => `• ${item}`)
    .join("\n");

  const scoreBreakdown = sortedScores
    .map(([key], index) => {
      const name = quizData.results[key]?.name || key;
      const percent = percentages[index];
      return `${scoreBar(percent)} ${name}: ${percent}%`;
    })
    .join("\n");

  return [
    quizData.meta?.title || "Quiz result",
    "",
    `${resultLabel}: ${result.emoji || ""} ${result.name}`.trim(),
    result.badge || result.subtitle ? `Your badge: ${result.badge || result.subtitle}` : "",
    "",
    fitHeading,
    fitLines,
    "",
    "Score breakdown:",
    scoreBreakdown,
    "",
    url,
  ].filter(Boolean).join("\n");
}

function scoreBar(percent) {
  const filledBlocks = Math.round(percent / 10);
  return "🟩".repeat(filledBlocks) + "⬜".repeat(10 - filledBlocks);
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

function hideRestoreBanner() {
  if (el.restoreBanner) el.restoreBanner.hidden = true;
}

function scrollToQuizArea() {
  const target = el.questionPanel && !el.questionPanel.hidden ? (el.questionAnchor || el.questionPanel) : el.resultPanel;
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function removeOldQuizCookies() {
  const versionedCookie = quizData?.meta?.version ? `mbi_quiz_state_${quizData.meta.version}` : null;
  [...LEGACY_COOKIE_NAMES, versionedCookie].filter(Boolean).forEach(deleteCookie);
}

function deleteCookie(name) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
}
