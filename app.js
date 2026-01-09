let booksIndex = [];
let currentBook = null;      // {title, items:[{no,en,ja}]}
let currentPicked = [];      // 抽選された items（順番維持）
let answersVisible = false;

// いま選択中のバナーURLを保持
let currentCoverSrc = "";

// 生徒名（ブラウザ単位で保持）
let userName = "";

// ✅ GAS設定
const GAS_URL = "https://script.google.com/macros/s/AKfycbw_wxaQ7lUF8UbLJygMZAQ4CR3wQjSZZ3lkIORBkGJocxNnXObQG3gaDsxnTTCpjlLX/exec"; // ←あなたのURLに変更
const TOKEN   = "y0k0juku"; // GAS側 TOKEN と一致させる

const $ = (id) => document.getElementById(id);

/* =========================
   ストップウォッチ（カウントアップ）
========================= */
let timerInterval = null;
let startMs = 0;
let elapsedSec = 0;

function formatMMSS(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function renderTimer() {
  const el = $("timerText");
  if (el) el.textContent = formatMMSS(elapsedSec);
}

function startTimer() {
  stopTimer();
  elapsedSec = 0;
  renderTimer();
  startMs = Date.now();
  timerInterval = setInterval(() => {
    elapsedSec = Math.floor((Date.now() - startMs) / 1000);
    renderTimer();
  }, 250);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/* =========================
   ユーティリティ
========================= */
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickUniqueRandom(items, k) {
  const copy = items.slice();
  shuffleInPlace(copy);
  return copy.slice(0, k);
}

/* =========================
   データ読み込み
========================= */
async function loadBooksIndex() {
  const res = await fetch("data/books.json");
  if (!res.ok) throw new Error("data/books.json を読み込めませんでした");
  booksIndex = await res.json();
}

async function loadBookById(bookId) {
  const res = await fetch(`data/${bookId}.json`);
  if (!res.ok) throw new Error(`data/${bookId}.json を読み込めませんでした`);
  currentBook = await res.json();
}

/* =========================
   バナー制御（setup/test 共通）
========================= */
function hideBanner(wrapId, imgId) {
  const wrap = $(wrapId);
  const img = $(imgId);
  if (img) {
    img.classList.add("hidden");
    img.removeAttribute("src");
    img.alt = "";
  }
  if (wrap) {
    wrap.classList.add("hidden");
    wrap.setAttribute("aria-hidden", "true");
  }
}

function showBanner(wrapId, imgId, src, altText) {
  const wrap = $(wrapId);
  const img = $(imgId);
  if (!wrap || !img) return;

  img.src = src;
  img.alt = altText || "";
  img.classList.remove("hidden");

  wrap.classList.remove("hidden");
  wrap.setAttribute("aria-hidden", "false");
}

/* =========================
   名前入力モーダル（キャンセル無し）
========================= */
function openNameModal() {
  const modal = $("nameModal");
  const input = $("nameInput");
  const err = $("nameError");
  if (!modal || !input) return;

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");

  if (err) err.textContent = "";
  input.value = "";
  setTimeout(() => input.focus(), 50);
}

function closeNameModal() {
  const modal = $("nameModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function ensureUserName() {
  if (userName) return true;

  const saved = localStorage.getItem("userName");
  if (saved && saved.trim()) {
    userName = saved.trim();
    return true;
  }

  openNameModal();
  return false;
}

function bindNameModal() {
  const okBtn = $("nameOkBtn");
  const input = $("nameInput");
  const err = $("nameError");
  if (!okBtn || !input || !err) return;

  const submit = () => {
    const name = input.value.trim();
    if (!name) {
      err.textContent = "名前を入力してください。";
      return;
    }
    userName = name;
    localStorage.setItem("userName", name);
    closeNameModal();
  };

  okBtn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

/* =========================
   単語帳セレクト描画
========================= */
function renderBookSelect() {
  const sel = $("bookSelect");
  sel.innerHTML = "";

  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "単語帳を選択してください";
  ph.selected = true;
  sel.appendChild(ph);

  for (const b of booksIndex) {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = `${b.title}（${b.count}語）`;
    sel.appendChild(opt);
  }

  updateBookInfo();
}

function updateBookInfo() {
  const sel = $("bookSelect");
  const b = booksIndex.find(x => x.id === sel.value);

  if (!b) {
    $("bookInfo").textContent = "";
    currentCoverSrc = "";
    hideBanner("setupBannerWrap", "setupBannerImg");
    return;
  }

  $("bookInfo").textContent = `単語数: ${b.count}`;

  if (b.cover) {
    currentCoverSrc = b.cover;
    showBanner("setupBannerWrap", "setupBannerImg", b.cover, "単語帳のバナー");
  } else {
    currentCoverSrc = "";
    hideBanner("setupBannerWrap", "setupBannerImg");
  }
}

/* =========================
   画面切り替え・エラー
========================= */
function setScreen(setupVisible) {
  $("screen-setup").classList.toggle("hidden", !setupVisible);
  $("screen-test").classList.toggle("hidden", setupVisible);
}

function clearErrors() {
  $("setupError").textContent = "";
  $("testError").textContent = "";
}

/* =========================
   入力チェック
========================= */
function validateRange(startNo, endNo) {
  if (!Number.isInteger(startNo) || !Number.isInteger(endNo)) {
    return "開始Noと終了Noは整数で入力してください。";
  }
  if (startNo < 1 || endNo < 1) {
    return "開始No/終了Noは1以上にしてください。";
  }
  if (startNo > endNo) {
    return "開始Noは終了No以下にしてください。";
  }
  return null;
}

function filterByRange(items, startNo, endNo) {
  return items.filter(x => x.no >= startNo && x.no <= endNo);
}

/* =========================
   テーブル表示
========================= */
function renderLists(picked) {
  const tbody = $("qaBody");
  tbody.innerHTML = "";

  picked.forEach((it, index) => {
    const tr = document.createElement("tr");

    const tdEn = document.createElement("td");
    tdEn.textContent = it.en;

    const tdJa = document.createElement("td");
    tdJa.className = "answerCell";

    if (answersVisible) {
      tdJa.textContent = `${it.ja} (${it.no})`;
      tdJa.classList.remove("answerHidden");
    } else {
      tdJa.textContent = "dummy";
      tdJa.classList.add("answerHidden");
    }

    tr.appendChild(tdEn);
    tr.appendChild(tdJa);
    tbody.appendChild(tr);

    // ✅ 10問ごとに半行スペースを入れる
    if ((index + 1) % 10 === 0 && index !== picked.length - 1) {
      const spacer = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 2;
      td.style.height = "21px";   // ← 半行分控え目
      spacer.appendChild(td);
      tbody.appendChild(spacer);
    }
  });
}

function updateTestHeader(startNo, endNo, poolCount) {
  $("testTitle").textContent = `${currentBook.title}：No.${startNo}〜No.${endNo}`;
  $("testMeta").textContent = `範囲内の語数: ${poolCount} / 出題数: ${currentPicked.length}`;
}

/* =========================
   リトライ表示制御
========================= */
function setRetryVisible(visible) {
  $("retryBtn").classList.toggle("hidden", !visible);
}

function hideAnswers() {
  answersVisible = false;
  setRetryVisible(false);
  if (currentPicked.length) renderLists(currentPicked);
}

/* =========================
   GASへ送信（キー名をGASに合わせる！）
========================= */
async function sendRecordToGAS() {
  // GASが期待する payload に合わせる
  const sel = $("bookSelect");
  const bookId = sel ? sel.value : "";

  const startNo = parseInt($("startNo").value, 10);
  const endNo   = parseInt($("endNo").value, 10);

  const payload = {
    token: TOKEN,                             // ← GASは data.token をチェック
    student: userName || "",                  // ← GASは data.student
    bookTitle: currentBook?.title || "",      // ← data.bookTitle
    bookId: bookId || "",                     // ← data.bookId
    startNo: Number.isFinite(startNo) ? startNo : "",
    endNo: Number.isFinite(endNo) ? endNo : "",
    questionCount: currentPicked.length || 0, // ← data.questionCount
    elapsedSec: elapsedSec,                   // ← data.elapsedSec
    elapsedText: formatMMSS(elapsedSec),      // ← data.elapsedText
    pickedNos: currentPicked.map(x => x.no),  // ← data.pickedNos (配列)
  };

  // 表示はいらない要望なので、失敗しても黙る
  try {
    await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
  } catch (e) {}
}

/* =========================
   答え表示（ここでタイマー停止＆自動送信）
========================= */
async function showAnswers() {
  // 念のため（名前が無いと送れない）
  if (!ensureUserName()) return;

  answersVisible = true;
  setRetryVisible(true);
  if (currentPicked.length) renderLists(currentPicked);

  stopTimer();

  // ✅ 自動送信
  await sendRecordToGAS();
}

/* =========================
   値取得
========================= */
function getRangeInputs() {
  const startNo = parseInt($("startNo").value, 10);
  const endNo = parseInt($("endNo").value, 10);
  return { startNo, endNo };
}

/* =========================
   生成（最大40問 / 範囲が少なければその数）
========================= */
async function generateTest() {
  clearErrors();
  hideAnswers();

  if (!ensureUserName()) return;

  const bookId = $("bookSelect").value;
  if (!bookId) {
    $("setupError").textContent = "単語帳を選択してください。";
    return;
  }

  const { startNo, endNo } = getRangeInputs();
  const msg = validateRange(startNo, endNo);
  if (msg) {
    $("setupError").textContent = msg;
    return;
  }

  await loadBookById(bookId);

  const pool = filterByRange(currentBook.items, startNo, endNo);
  if (pool.length === 0) {
    $("setupError").textContent = "指定範囲に単語がありません。";
    return;
  }

  // ✅ 最大40
  currentPicked = pickUniqueRandom(pool, Math.min(40, pool.length));

  renderLists(currentPicked);
  updateTestHeader(startNo, endNo, pool.length);

  // テスト画面バナー
  if (currentCoverSrc) {
    showBanner("testBannerWrap", "testBannerImg", currentCoverSrc, "単語帳のバナー");
  } else {
    hideBanner("testBannerWrap", "testBannerImg");
  }

  // ✅ タイマー開始
  startTimer();

  setScreen(false);
}

/* =========================
   リトライ（最大40）
========================= */
function retryTest() {
  clearErrors();
  hideAnswers();

  if (!ensureUserName()) return;

  const { startNo, endNo } = getRangeInputs();
  const pool = filterByRange(currentBook.items, startNo, endNo);

  if (pool.length === 0) {
    $("testError").textContent = "指定範囲に単語がありません。";
    return;
  }

  currentPicked = pickUniqueRandom(pool, Math.min(40, pool.length));
  renderLists(currentPicked);
  updateTestHeader(startNo, endNo, pool.length);

  // ✅ タイマー再スタート
  startTimer();
}

/* =========================
   初期化
========================= */
async function init() {
  try {
    bindNameModal();

    await loadBooksIndex();
    renderBookSelect();

    hideBanner("setupBannerWrap", "setupBannerImg");
    hideBanner("testBannerWrap", "testBannerImg");

    $("bookSelect").addEventListener("change", updateBookInfo);
    $("generateBtn").addEventListener("click", generateTest);
    $("showAnswerBtn").addEventListener("click", showAnswers);
    $("retryBtn").addEventListener("click", retryTest);

    $("backBtn").addEventListener("click", () => {
      clearErrors();
      stopTimer();
      elapsedSec = 0;
      renderTimer();
      setScreen(true);
    });

    setScreen(true);

    // 起動時：名前が無ければ聞く
    ensureUserName();
  } catch (e) {
    $("setupError").textContent = String(e);
  }
}

init();
