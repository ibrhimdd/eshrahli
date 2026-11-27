import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, updateProfile, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const config = window.ESHRAHLI_FIREBASE_CONFIG;
const apiBase = (window.ESHRAHLI_API_BASE || "http://localhost:4000").replace(/\/$/, "");
const $ = (id) => document.getElementById(id);
const authPanel = $("authPanel");
const dashboard = $("dashboard");
const authForm = $("authForm");
const authStatus = $("authStatus");
const dashboardStatus = $("dashboardStatus");
const uploadStatus = $("uploadStatus");
const documentsList = $("documentsList");
const submitButton = $("submitButton");
const uploadButton = $("uploadButton");
const fileInput = $("pdfFile");
let auth = null;
let currentUser = null;
let mode = "login";
let documents = [];

function status(element, message, error = false) {
  element.textContent = message;
  element.dataset.error = error ? "true" : "false";
}
function friendlyError(error) {
  const messages = {
    "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    "auth/wrong-password": "كلمة المرور غير صحيحة.",
    "auth/user-not-found": "لا يوجد حساب بهذا البريد الإلكتروني.",
    "auth/email-already-in-use": "هذا البريد مسجل بالفعل؛ سجّل الدخول بدل إنشاء حساب جديد.",
    "auth/weak-password": "كلمة المرور ضعيفة؛ استخدم 6 أحرف على الأقل.",
    "auth/invalid-email": "اكتب بريدًا إلكترونيًا صحيحًا.",
    "auth/too-many-requests": "محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.",
    "auth/network-request-failed": "تعذر الاتصال بالإنترنت. حاول مرة أخرى.",
    "auth/invalid-api-key": "إعداد Firebase غير صحيح. راجع إعدادات التطبيق."
  };
  return messages[error.code] || error.message || "حدث خطأ غير متوقع.";
}
function setMode(next) {
  mode = next;
  $("nameField").classList.toggle("hidden", mode !== "signup");
  $("authTitle").textContent = mode === "signup" ? "إنشاء حساب جديد" : "أهلًا بعودتك 👋";
  $("authDescription").textContent = mode === "signup"
    ? "أنشئ حسابك للوصول إلى ملفاتك وحفظ تقدمك."
    : "سجّل الدخول للوصول إلى ملفاتك ومتابعة التعلم.";
  submitButton.textContent = mode === "signup" ? "إنشاء الحساب" : "تسجيل الدخول";
  $("switchMode").textContent = mode === "signup" ? "لديك حساب؟ تسجيل الدخول" : "إنشاء حساب جديد";
  $("resetPassword").classList.toggle("hidden", mode !== "login");
  $("password").autocomplete = mode === "signup" ? "new-password" : "current-password";
  status(authStatus, mode === "signup" ? "أدخل اسمك وبريدك وكلمة المرور لإنشاء حساب." : "أدخل البريد الإلكتروني وكلمة المرور.");
}
$("switchMode").addEventListener("click", () => setMode(mode === "login" ? "signup" : "login"));

async function authenticate(event) {
  event.preventDefault();
  if (!auth) return status(authStatus, "إعداد Firebase غير مكتمل. راجع firebase-config.js.", true);
  const email = $("email").value.trim();
  const password = $("password").value;
  submitButton.disabled = true;
  submitButton.textContent = mode === "signup" ? "جاري إنشاء الحساب..." : "جاري تسجيل الدخول...";
  try {
    let result;
    if (mode === "signup") {
      result = await createUserWithEmailAndPassword(auth, email, password);
      const displayName = $("displayName").value.trim();
      if (displayName) await updateProfile(result.user, { displayName });
    } else {
      result = await signInWithEmailAndPassword(auth, email, password);
    }
    $("password").value = "";
    currentUser = result.user;
    status(authStatus, "تم بنجاح. جاري فتح حسابك...");
  } catch (error) {
    status(authStatus, friendlyError(error), true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = mode === "signup" ? "إنشاء الحساب" : "تسجيل الدخول";
  }
}
authForm.addEventListener("submit", authenticate);

$("resetPassword").addEventListener("click", async () => {
  const email = $("email").value.trim();
  if (!email) return status(authStatus, "اكتب بريدك الإلكتروني أولًا لإرسال رابط إعادة تعيين كلمة المرور.", true);
  try {
    await sendPasswordResetEmail(auth, email);
    status(authStatus, "لو البريد مسجل، هيوصلك رابط إعادة تعيين كلمة المرور. راجع الوارد والرسائل غير المرغوب فيها.");
  } catch (error) {
    status(authStatus, friendlyError(error), true);
  }
});

async function apiRequest(path, options = {}) {
  if (!currentUser) throw new Error("سجّل الدخول أولًا.");
  let token = await currentUser.getIdToken();
  const send = (value) => fetch(apiBase + path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: "Bearer " + value }
  });
  let response = await send(token);
  if (response.status === 401) {
    token = await currentUser.getIdToken(true);
    response = await send(token);
    if (response.status === 401) {
      await signOut(auth);
      throw new Error("تعذر تجديد جلسة الحساب. تم تسجيل خروجك بأمان؛ سجّل الدخول مرة أخرى.");
    }
  }
  return response;
}
async function readResponse(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallback);
  return data;
}
function renderDocuments(items) {
  documents = items;
  documentsList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "لسه ما رفعتش ملفات. ارفع أول كتاب من القسم الموجود بالأسفل.";
    documentsList.appendChild(empty);
    return;
  }
  items.forEach((doc) => {
    const card = document.createElement("article");
    card.className = "doc";
    const info = document.createElement("div");
    info.className = "doc-info";
    const title = document.createElement("strong");
    title.textContent = doc.name || "ملف PDF";
    const meta = document.createElement("small");
    const indexState = doc.embeddingStatus === "ready" ? "جاهز للسؤال والبحث" :
      doc.embeddingStatus === "failed" ? "استخراج النص اكتمل لكن تجهيز البحث تعثر" :
      doc.embeddingStatus === "processing" ? "جاري تجهيز البحث الذكي" :
      doc.status === "ready" ? "تم استخراج النص — لم تكتمل الفهرسة" : "قيد المعالجة";
    meta.textContent = (doc.pageCount || 0) + " صفحة · " + (doc.chunkCount || 0) + " مقطع · " + indexState;
    info.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "doc-actions";
    if (doc.embeddingStatus !== "ready" && doc.status === "ready") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "secondary";
      retry.textContent = "استكمال التجهيز";
      retry.addEventListener("click", () => indexDocument(doc.id, retry));
      actions.appendChild(retry);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary delete";
    remove.textContent = "حذف";
    remove.addEventListener("click", () => deleteDocument(doc.id));
    actions.appendChild(remove);
    card.append(info, actions);
    documentsList.appendChild(card);
  });
}
async function loadDocuments() {
  documentsList.textContent = "جاري تحميل ملفاتك...";
  try {
    const data = await readResponse(await apiRequest("/api/documents"), "تعذر تحميل ملفاتك.");
    renderDocuments(data.documents || []);
  } catch (error) {
    status(dashboardStatus, error.message, true);
    if (currentUser) documentsList.textContent = "تعذر تحميل الملفات. اضغط تحديث القائمة للمحاولة مرة أخرى.";
  }
}
$("refreshButton").addEventListener("click", loadDocuments);

async function indexDocument(id, button) {
  if (button) { button.disabled = true; button.textContent = "جاري التجهيز..."; }
  try {
    let remaining = Number(documents.find((doc) => doc.id === id)?.remainingChunks ??
      documents.find((doc) => doc.id === id)?.chunkCount ?? 0);
    let rounds = 0;
    while (remaining > 0 && rounds < 250) {
      rounds++;
      const before = remaining;
      const data = await readResponse(await apiRequest("/api/documents/" + encodeURIComponent(id) + "/index", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 8 })
      }), "تعذر تجهيز البحث الذكي.");
      remaining = Number(data.remaining);
      if (!Number.isFinite(remaining)) throw new Error("الخادم لم يرجع حالة الفهرسة.");
      if (data.complete || remaining === 0) break;
      if (remaining >= before) throw new Error("الفهرسة توقفت دون تقدم. جرّب استكمال التجهيز مرة أخرى.");
      status(dashboardStatus, "جاري تجهيز الملف للبحث الذكي — متبقي " + remaining + " مقطع.");
    }
    if (remaining > 0) throw new Error("الملف يحتاج وقتًا إضافيًا. يمكنك استكمال التجهيز لاحقًا.");
    status(dashboardStatus, "اكتمل تجهيز الملف، وأصبح جاهزًا للأسئلة.");
  } catch (error) {
    status(dashboardStatus, error.message, true);
  } finally {
    if (button) { button.disabled = false; button.textContent = "استكمال التجهيز"; }
    await loadDocuments();
  }
}
async function deleteDocument(id) {
  if (!confirm("هل تريد حذف هذا الملف وكل المقاطع والمتجهات المرتبطة به؟")) return;
  try {
    await readResponse(await apiRequest("/api/documents/" + encodeURIComponent(id), { method: "DELETE" }), "تعذر حذف الملف.");
    status(dashboardStatus, "تم حذف الملف من حسابك.");
    await loadDocuments();
  } catch (error) {
    status(dashboardStatus, error.message, true);
  }
}

async function uploadPdf(event) {
  event.preventDefault();
  const file = fileInput.files?.[0];
  if (!file) return status(uploadStatus, "اختر ملف PDF أولًا.", true);
  if (!file.name.toLowerCase().endsWith(".pdf")) return status(uploadStatus, "ارفع ملفًا بامتداد PDF فقط.", true);
  if (file.size > 4 * 1024 * 1024) return status(uploadStatus, "حجم الملف أكبر من 4 ميجابايت. اختر نسخة أصغر.", true);
  uploadButton.disabled = true;
  fileInput.disabled = true;
  try {
    const form = new FormData();
    form.append("file", file);
    status(uploadStatus, "جاري رفع الملف إلى الخادم واستخراج النص...");
    const data = await readResponse(await apiRequest("/api/documents", { method: "POST", body: form }), "تعذر رفع الملف.");
    const doc = data.document;
    if (!doc?.id) throw new Error("لم يرجع الخادم معرّف الملف.");
    fileInput.value = "";
    status(uploadStatus, data.duplicate ? "الملف موجود بالفعل في حسابك." : "تم رفع الملف واستخراج النص بنجاح. جاري تجهيز البحث الذكي...");
    await loadDocuments();
    if (doc.embeddingStatus !== "ready" && Number(doc.remainingChunks ?? doc.chunkCount ?? 0) > 0) {
      await indexDocument(doc.id, null);
      status(uploadStatus, "اكتمل رفع الملف وتجهيزه. يمكنك الآن الرجوع إليه من قائمة ملفاتك.");
    } else {
      status(uploadStatus, "الملف جاهز بالفعل ويمكنك الرجوع إليه من قائمة ملفاتك.");
    }
  } catch (error) {
    status(uploadStatus, error.message || "حدث خطأ أثناء رفع الملف.", true);
  } finally {
    uploadButton.disabled = false;
    fileInput.disabled = false;
  }
}
$("uploadForm").addEventListener("submit", uploadPdf);

$("logoutButton").addEventListener("click", async () => {
  try { await signOut(auth); }
  catch (error) { status(dashboardStatus, friendlyError(error), true); }
});

function showDashboard(user) {
  authPanel.classList.add("hidden");
  dashboard.classList.remove("hidden");
  const name = user.displayName || (user.email || "طالب").split("@")[0];
  $("profileName").textContent = name;
  $("profileEmail").textContent = user.email || "";
  $("avatar").textContent = Array.from(name)[0] || "؟";
  status(dashboardStatus, "أنت مسجل الدخول الآن. ملفاتك محفوظة ومرتبطة بحسابك.");
  loadDocuments();
}
function showLogin() {
  dashboard.classList.add("hidden");
  authPanel.classList.remove("hidden");
  documentsList.replaceChildren();
  status(authStatus, "سجّل الدخول أو أنشئ حسابًا جديدًا للوصول إلى ملفاتك.");
}

if (!config?.apiKey || config.apiKey.startsWith("YOUR_")) {
  status(authStatus, "إعداد Firebase غير مكتمل. راجع firebase-config.js.", true);
} else {
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(config);
    auth = getAuth(app);
    onAuthStateChanged(auth, (user) => {
      currentUser = user;
      window.ESHRAHLI_IS_AUTHENTICATED = !!user;
      if (user) showDashboard(user);
      else showLogin();
    });
  } catch (error) {
    status(authStatus, "تعذر تشغيل Firebase: " + friendlyError(error), true);
  }
}
setMode("login");
