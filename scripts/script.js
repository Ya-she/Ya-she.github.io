const QUIZ_STATE_COOKIE = "nbs_quiz_state";
const COOKIE_DAYS = 14;

const RESULT_ICONS = {
  nbs: "🌿",
  nature_as_infrastructure: "🏗️",
  carbon_offset_biodiversity: "🎟️",
  ccs: "🛢️",
  pes: "💸",
  biodiversity_credits: "🦋",
  redd_plus: "🌳",
};

const fallbackTheme = {
  sage: "#63945B",
  sageLight: "#ABD4A7",
};

const state = {
  quizData: null,
  hasStarted: false,
  showResult: false,
  currentQuestionIndex: 0,
  selectedAnswerIndexes: [],
  restoredFromCookie: false,
};

const elements = {
  quizTitle: document.getElementById("quiz-title"),
  quizSubtitle: document.getElementById("quiz-subtitle"),
  quizIntro: document.getElementById("quiz-intro"),
  dataSourcePill: document.getElementById("data-source-pill"),
  startButton: document.getElementById("start-button"),
  clearButton: document.getElementById("clear-button"),
  restoreBanner: document.getElementById("restore-banner"),
  questionPanel: document.getElementById("question-panel"),
  resultPanel: document.getElementById("result-panel"),
  questionKicker: document.getElementById("question-kicker"),
  questionTitle: document.getElementById("question-title"),
  progressText: document.getElementById("progress-text"),
  progressFill: document.getElementById("progress-fill"),
  answersGrid: document.getElementById("answers-grid"),
  backButton: document.getElementById("back-button"),
  resultLabel: document.getElementById("result-label"),
  resultIcon: document.getElementById("result-icon"),
  resultHero: document.getElementById("result-hero"),
  resultTitle: document.getElementById("result-title"),
  resultSubtitle: document.getElementById("result-subtitle"),
  resultDescription: document.getElementById("result-description"),
  resultBadge: document.getElementById("result-badge"),
  fitList: document.getElementById("fit-list"),
  scoreBreakdown: document.getElementById("score-breakdown"),
  retakeButton: document.getElementById("retake-button"),
  clearResultButton: document.getElementById("clear-result-button"),
  answerCardTemplate: document.getElementById("answer-card-template"),
};

init();

async function init() {
  bindEvents();
  const { quizData, loadedFromExternalJson } = await loadQuizData();
  state.quizData = quizData;
  populateIntro(quizData, loadedFromExternalJson);
  restoreSavedState();

  if (!state.showResult) {
    state.hasStarted = true;
  }

  render();
}

function bindEvents() {
  elements.startButton.addEventListener("click", () => {
    state.hasStarted = true;
    state.showResult = false;
    state.currentQuestionIndex = 0;
    state.selectedAnswerIndexes = [];
    state.restoredFromCookie = false;
    persistState();
    render();
  });

  elements.clearButton.addEventListener("click", clearAllProgress);
  elements.clearResultButton.addEventListener("click", clearAllProgress);

  elements.backButton.addEventListener("click", () => {
    if (state.currentQuestionIndex <= 0) return;
    state.currentQuestionIndex -= 1;
    persistState();
    render();
  });

  elements.retakeButton.addEventListener("click", () => {
    state.hasStarted = true;
    state.showResult = false;
    state.currentQuestionIndex = 0;
    state.selectedAnswerIndexes = [];
    state.restoredFromCookie = false;
    persistState();
    render();
  });
}

async function loadQuizData() {
  try {
    const response = await fetch("./data/quiz-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Quiz data request failed");
    const quizData = await response.json();
    return { quizData, loadedFromExternalJson: true };
  } catch (error) {
    console.error("Failed to load quiz-data.json", error);
    const message = window.location.protocol === "file:"
      ? "Could not load data/quiz-data.json. If you opened index.html directly from your computer, your browser is probably blocking local JSON loading. Use a tiny local server or host the folder online. The file paths themselves may still be correct."
      : "Could not load data/quiz-data.json. Check that index.html, styles.css, the scripts folder, and the data folder were all uploaded together.";
    alert(message);
    throw error;
  }
}

function populateIntro(quizData, loadedFromExternalJson) {
  document.title = quizData.meta.title;
  elements.quizTitle.textContent = quizData.meta.title;
  elements.quizSubtitle.textContent = quizData.meta.subtitle;
  elements.quizIntro.textContent = quizData.meta.intro;
  elements.dataSourcePill.hidden = true;
}

function restoreSavedState() {
  const rawValue = getCookie(QUIZ_STATE_COOKIE);
  if (!rawValue) return;

  try {
    const saved = JSON.parse(rawValue);
    if (saved.version !== state.quizData.meta.version) return;

    const questionCount = state.quizData.questions.length;
    const maxQuestionIndex = Math.max(questionCount - 1, 0);

    state.selectedAnswerIndexes = Array.isArray(saved.selectedAnswerIndexes)
      ? saved.selectedAnswerIndexes.slice(0, questionCount)
      : [];
    state.currentQuestionIndex = clamp(
      Number.isInteger(saved.currentQuestionIndex) ? saved.currentQuestionIndex : 0,
      0,
      maxQuestionIndex
    );
    state.hasStarted = Boolean(saved.hasStarted || state.selectedAnswerIndexes.length > 0 || saved.showResult);
    state.showResult = Boolean(saved.showResult);
    state.restoredFromCookie =
      state.selectedAnswerIndexes.length > 0 || state.showResult;
  } catch (error) {
    console.warn("Saved quiz state could not be parsed and will be ignored.", error);
  }
}

function render() {
  const hasData = Boolean(state.quizData);
  if (!hasData) return;

  elements.restoreBanner.hidden = !state.restoredFromCookie;

  if (!state.hasStarted) {
    elements.questionPanel.hidden = true;
    elements.resultPanel.hidden = true;
    elements.startButton.textContent = state.restoredFromCookie ? "Restart quiz fresh" : "Start quiz";
    updateScoreBreakdownEmpty();
    return;
  }

  elements.startButton.textContent = "Restart quiz fresh";

  if (state.showResult) {
    renderResult();
    elements.questionPanel.hidden = true;
    elements.resultPanel.hidden = false;
    return;
  }

  renderQuestion();
  elements.questionPanel.hidden = false;
  elements.resultPanel.hidden = true;
}

function renderQuestion() {
  const question = state.quizData.questions[state.currentQuestionIndex];
  const answeredCount = state.selectedAnswerIndexes.filter((value) => value !== undefined).length;
  const progressValue = questionCount() === 0 ? 0 : (answeredCount / questionCount()) * 100;

  elements.questionKicker.textContent = question.kicker || `Question ${state.currentQuestionIndex + 1}`;
  elements.questionTitle.textContent = question.prompt;
  elements.progressText.textContent = `${Math.min(state.currentQuestionIndex + 1, questionCount())} / ${questionCount()}`;
  elements.progressFill.style.width = `${progressValue}%`;
  elements.backButton.disabled = state.currentQuestionIndex === 0;
  elements.answersGrid.replaceChildren();

  question.answers.forEach((answer, answerIndex) => {
    const fragment = elements.answerCardTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".answer-card");
    const image = fragment.querySelector(".answer-image");
    const text = fragment.querySelector(".answer-text");

    image.src = getAnswerImage(answer);
    image.alt = answer.image?.label || answer.text;
    text.textContent = answer.text;

    if (state.selectedAnswerIndexes[state.currentQuestionIndex] === answerIndex) {
      button.classList.add("is-selected");
    }

    button.addEventListener("click", () => {
      selectAnswer(answerIndex);
    });

    elements.answersGrid.appendChild(fragment);
  });

  updateScoreBreakdownEmpty();
}

function renderResult() {
  const resultData = calculateResult(state.quizData, state.selectedAnswerIndexes);
  const winningResultId = resultData.winner;
  const winningResult = state.quizData.results[winningResultId];

  elements.resultLabel.textContent = state.quizData.meta.resultLabel;
  elements.resultIcon.textContent = RESULT_ICONS[winningResultId] || "✨";
  elements.resultTitle.textContent = winningResult.name;
  elements.resultSubtitle.textContent = winningResult.subtitle;
  elements.resultDescription.textContent = winningResult.description;
  elements.resultBadge.textContent = winningResult.badge;

  const palette = Array.isArray(winningResult.palette) ? winningResult.palette : [fallbackTheme.sage, fallbackTheme.sageLight];
  elements.resultHero.style.background = `linear-gradient(135deg, ${palette[0]} 0%, ${palette[1]} 100%)`;

  elements.fitList.replaceChildren();
  winningResult.whyItFits.forEach((item) => {
    const div = document.createElement("div");
    div.className = "fit-item";
    div.textContent = item;
    elements.fitList.appendChild(div);
  });

  renderScoreBreakdown(resultData);
}

function selectAnswer(answerIndex) {
  state.restoredFromCookie = false;
  state.selectedAnswerIndexes[state.currentQuestionIndex] = answerIndex;

  if (state.currentQuestionIndex >= questionCount() - 1) {
    state.showResult = true;
  } else {
    state.currentQuestionIndex += 1;
  }

  persistState();
  render();
}

function renderScoreBreakdown(resultData) {
  elements.scoreBreakdown.classList.remove("empty-state");
  elements.scoreBreakdown.replaceChildren();

  const highestScore = Math.max(...resultData.ranked.map(([, score]) => score), 1);

  resultData.ranked.forEach(([resultId, score]) => {
    const result = state.quizData.results[resultId];
    const row = document.createElement("div");
    row.className = "score-row";

    const top = document.createElement("div");
    top.className = "score-row-top";

    const name = document.createElement("span");
    name.className = "score-name";
    name.textContent = result.name;

    const value = document.createElement("span");
    value.className = "score-value";
    value.textContent = `${score} pts`;

    top.append(name, value);

    const track = document.createElement("div");
    track.className = "score-track";

    const fill = document.createElement("div");
    fill.className = "score-fill";
    fill.style.width = `${(score / highestScore) * 100}%`;
    fill.style.background = result.palette?.[0] || fallbackTheme.sage;

    track.appendChild(fill);
    row.append(top, track);
    elements.scoreBreakdown.appendChild(row);
  });
}

function updateScoreBreakdownEmpty() {
  elements.scoreBreakdown.classList.add("empty-state");
  elements.scoreBreakdown.textContent = "Finish the quiz to see how each instrument scored.";
}

function calculateResult(quizData, selectedAnswerIndexes) {
  const scores = {};
  Object.keys(quizData.results).forEach((resultId) => {
    scores[resultId] = 0;
  });

  quizData.questions.forEach((question, questionIndex) => {
    const answerIndex = selectedAnswerIndexes[questionIndex];
    if (answerIndex === undefined) return;
    const answer = question.answers[answerIndex];
    Object.entries(answer.points || {}).forEach(([resultId, points]) => {
      scores[resultId] += Number(points) || 0;
    });
  });

  const ranked = Object.entries(scores).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return quizData.scoring.tieBreaker.indexOf(a[0]) - quizData.scoring.tieBreaker.indexOf(b[0]);
  });

  return {
    winner: ranked[0][0],
    scores,
    ranked,
  };
}

function persistState() {
  if (!state.quizData) return;

  if (!state.hasStarted && state.selectedAnswerIndexes.length === 0 && !state.showResult) {
    deleteCookie(QUIZ_STATE_COOKIE);
    return;
  }

  const resultId = state.showResult
    ? calculateResult(state.quizData, state.selectedAnswerIndexes).winner
    : undefined;

  const payload = {
    version: state.quizData.meta.version,
    currentQuestionIndex: state.currentQuestionIndex,
    selectedAnswerIndexes: state.selectedAnswerIndexes,
    hasStarted: state.hasStarted,
    showResult: state.showResult,
    resultId,
    timestamp: new Date().toISOString(),
  };

  setCookie(QUIZ_STATE_COOKIE, JSON.stringify(payload), COOKIE_DAYS);
}

function clearAllProgress() {
  state.hasStarted = true;
  state.showResult = false;
  state.currentQuestionIndex = 0;
  state.selectedAnswerIndexes = [];
  state.restoredFromCookie = false;
  deleteCookie(QUIZ_STATE_COOKIE);
  render();
}

function setCookie(name, value, days = COOKIE_DAYS) {
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

function getCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const match = document.cookie.split("; ").find((row) => row.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

function deleteCookie(name) {
  document.cookie = `${encodeURIComponent(name)}=; Max-Age=0; path=/; SameSite=Lax`;
}

function getAnswerImage(answer) {
  if (answer.image?.url) return answer.image.url;
  return makePlaceholder(
    answer.image?.label || answer.text,
    answer.image?.emoji || "🌿",
    answer.image?.palette || [fallbackTheme.sage, fallbackTheme.sageLight]
  );
}

function makePlaceholder(label, emoji = "🌿", palette = [fallbackTheme.sage, fallbackTheme.sageLight]) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette[0]}" />
          <stop offset="100%" stop-color="${palette[1]}" />
        </linearGradient>
      </defs>
      <rect width="800" height="520" fill="url(#g)" rx="32" />
      <circle cx="680" cy="100" r="70" fill="rgba(255,255,255,0.12)" />
      <circle cx="130" cy="420" r="120" fill="rgba(255,255,255,0.08)" />
      <text x="50%" y="42%" text-anchor="middle" dominant-baseline="middle" font-size="80">${emoji}</text>
      <text x="50%" y="68%" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff">${escapeXml(label)}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function questionCount() {
  return state.quizData?.questions?.length || 0;
}
