import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

(function () {
  const config = window.ESHRAHLI_FIREBASE_CONFIG;
  const status = document.getElementById("accountStatus");
  const authForm = document.getElementById("authForm");
  const emailInput = document.getElementById("accountEmail");
  const passwordInput = document.getElementById("accountPassword");
  const nameInput = document.getElementById("accountName");
  const nameField = document.getElementById("accountNameField");
  const signupButton = document.getElementById("signupButton");
  const loginButton = document.getElementById("loginButton");
  const logoutButton = document.getElementById("logoutButton");
  const uploadForm = document.getElementById("pdfUploadForm");
  const fileInput = document.getElementById("pdfFile");
  const docsList = document.getElementById("documentsList");
  const accountButton = document.getElementById("accountButton");
  const dialog = document.getElementById("accountDialog");
  const closeButton = document.getElementById("closeAccountDialog");
  const apiBase = (window.ESHRAHLI_API_BASE || "http://localhost:4000").replace(/\/$/, "");
  let auth = null;
  let currentUser = null;
  let mode = "login";

  function showStatus(message, isError = false) {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = isError ? "error" : "success";
  }

  function setMode(next) {
    mode = next;
    nameField.hidden = mode !== "signup";
    signupButton.classList.toggle("active", mode === "signup");
    loginButton.classList.toggle("active", mode === "login");
    showStatus(mode === "signup" ? "أنشئ حسابًا لحفظ ملفاتك ودروسك." : "سجّل الدخول للوصول إلى ملفاتك.");
  }

  function renderDocuments(documents) {
    docsList.replaceChildren();
    if (!documents.length) {
      const empty = document.createElement("p");
      empty.className = "account-muted";
      empty.textContent = "لسه ما رفعتش ملفات.";
      docsList.appendChild(empty);
      return;
    }
    documents.forEach((doc) => {
      const item = document.createElement("div");
      item.className = "document-item";
      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = doc.name || "ملف PDF";
      const meta = document.createElement("small");
      meta.textContent = (doc.pageCount || 0) + " صفحة · " + (doc.chunkCount || 0) + " مقطع · " + (doc.status || "غير معروف");
      info.append(title, meta);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "حذف";
      remove.addEventListener("click", () => deleteDocument(doc.id));
      item.append(info, remove);
      docsList.appendChild(item);
    });
  }

  async function apiRequest(path, options = {}) {
    if (!currentUser) throw new Error("سجّل الدخول أولًا.");
    const token = await currentUser.getIdToken();
    const headers = { ...(options.headers || {}), Authorization: "Bearer " + token };
    return fetch(apiBase + path, { ...options, headers });
  }

  async function loadDocuments() {
    try {
      const response = await apiRequest("/api/documents");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الملفات.");
      renderDocuments(data.documents || []);
    } catch (error) {
      showStatus(error.message, true);
    }
  }

  async function deleteDocument(id) {
    if (!confirm("هل تريد حذف الملف وكل المقاطع النصية الخاصة به؟")) return;
    try {
      const response = await apiRequest("/api/documents/" + encodeURIComponent(id), { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر حذف الملف.");
      showStatus("تم حذف الملف.");
      loadDocuments();
    } catch (error) {
      showStatus(error.message, true);
    }
  }

  async function authenticate(event) {
    event.preventDefault();
    if (!auth) return showStatus("إعداد Firebase غير مكتمل. راجع firebase-config.js.", true);
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    try {
      let result;
      if (mode === "signup") {
        result = await createUserWithEmailAndPassword(auth, email, password);
        const displayName = nameInput.value.trim();
        if (displayName) await updateProfile(result.user, { displayName });
      } else {
        result = await signInWithEmailAndPassword(auth, email, password);
      }
      currentUser = result.user;
      showStatus("تم تسجيل الدخول بنجاح.");
      await loadDocuments();
    } catch (error) {
      showStatus(error.message || "تعذر تسجيل الدخول.", true);
    }
  }

  async function uploadPdf(event) {
    event.preventDefault();
    if (!fileInput.files?.[0]) return showStatus("اختر ملف PDF أولًا.", true);
    const file = fileInput.files[0];
    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
      return showStatus("ارفع ملف PDF فقط.", true);
    }
    const button = uploadForm.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "جاري الرفع والمعالجة...";
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await apiRequest("/api/documents", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذرت معالجة الملف.");
      showStatus(data.message || "تم رفع الملف.");
      fileInput.value = "";
      await loadDocuments();
    } catch (error) {
      showStatus(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "رفع وتحليل PDF";
    }
  }

  accountButton.addEventListener("click", () => dialog.showModal());
  closeButton.addEventListener("click", () => dialog.close());
  loginButton.addEventListener("click", () => setMode("login"));
  signupButton.addEventListener("click", () => setMode("signup"));
  authForm.addEventListener("submit", authenticate);
  logoutButton.addEventListener("click", async () => {
    if (auth) await signOut(auth);
  });
  uploadForm.addEventListener("submit", uploadPdf);

  if (!config || !config.apiKey || config.apiKey.startsWith("YOUR_")) {
    showStatus("لتمكين الحسابات ورفع PDF: انسخ firebase-config.example.js إلى firebase-config.js وأضف إعدادات تطبيق Firebase Web.", true);
    accountButton.disabled = false;
    return;
  }

  try {
    const app = getApps().length ? getApps()[0] : initializeApp(config);
    auth = getAuth(app);
    onAuthStateChanged(auth, async (user) => {
      currentUser = user;
      logoutButton.hidden = !user;
      authForm.hidden = !!user;
      uploadForm.hidden = !user;
      docsList.hidden = !user;
      showStatus(user ? "أهلًا " + (user.displayName || user.email) + " — ملفاتك محفوظة في حسابك." : "سجّل الدخول للوصول إلى ملفاتك.");
      if (user) await loadDocuments();
      else renderDocuments([]);
    });
  } catch (error) {
    showStatus("تعذر تشغيل Firebase: " + error.message, true);
  }
})();
