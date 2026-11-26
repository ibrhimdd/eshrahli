import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail
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
  const forgotPasswordButton = document.getElementById("forgotPasswordButton");
  const togglePasswordButton = document.getElementById("togglePassword");
  const authSubmitButton = document.getElementById("authSubmitButton");
  const logoutButton = document.getElementById("logoutButton");
  const uploadForm = document.getElementById("pdfUploadForm");
  const fileInput = document.getElementById("pdfFile");
  const docsList = document.getElementById("documentsList");
  const sessionsList = document.getElementById("sessionsList");
  const askForm = document.getElementById("askDocumentForm");
  const askDocumentSelect = document.getElementById("askDocumentSelect");
  const askQuestionInput = document.getElementById("askQuestion");
  const askAnswer = document.getElementById("askDocumentAnswer");
  const generateMapButton = document.getElementById("generateDocumentMap");
  const generateQuizButton = document.getElementById("generateDocumentQuiz");
  const generatedQuiz = document.getElementById("generatedQuiz");
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
    if (authSubmitButton) authSubmitButton.textContent = mode === "signup" ? "إنشاء الحساب" : "تسجيل الدخول";
    if (passwordInput) passwordInput.autocomplete = mode === "signup" ? "new-password" : "current-password";
    if (forgotPasswordButton) forgotPasswordButton.hidden = mode !== "login";
    showStatus(mode === "signup" ? "أنشئ حسابًا لحفظ ملفاتك ودروسك." : "أدخل بريدك الإلكتروني وكلمة المرور للمتابعة.");
  }

  function renderDocuments(documents) {
    docsList.replaceChildren();
    askDocumentSelect.replaceChildren();
    documents.forEach((doc) => {
      const option = document.createElement("option");
      option.value = doc.id;
      option.textContent = doc.name || "ملف PDF";
      askDocumentSelect.appendChild(option);
    });
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
      meta.textContent = (doc.pageCount || 0) + " صفحة · " + (doc.chunkCount || 0) + " مقطع · " + (doc.embeddingStatus === "ready" ? "جاهز للبحث" : doc.status || "بانتظار الفهرسة");
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

  window.ESHRAHLI_API_REQUEST = apiRequest;
  window.ESHRAHLI_IS_AUTHENTICATED = false;

  async function loadSessions() {
    if (!currentUser || !sessionsList) return;
    try {
      const response = await apiRequest("/api/sessions");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تحميل المحادثات.");
      sessionsList.replaceChildren();
      (data.sessions || []).forEach((session) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "document-item";
        button.textContent = session.title || "محادثة";
        button.addEventListener("click", async () => {
          const detailResponse = await apiRequest("/api/sessions/" + encodeURIComponent(session.id));
          const detail = await detailResponse.json();
          if (!detailResponse.ok) return showStatus(detail.error || "تعذر فتح المحادثة.", true);
          window.dispatchEvent(new CustomEvent("eshrahli:load-session", {
            detail: { id: session.id, messages: detail.messages || [] }
          }));
        });
        sessionsList.appendChild(button);
      });
      if (!(data.sessions || []).length) {
        const empty = document.createElement("p");
        empty.className = "account-muted";
        empty.textContent = "لم تحفظ أي محادثات بعد. ابدأ بسؤال المدرس بعد تسجيل الدخول.";
        sessionsList.appendChild(empty);
      }
    } catch (error) {
      showStatus(error.message, true);
    }
  }

  window.ESHRAHLI_REFRESH_SESSIONS = loadSessions;

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

  function friendlyAuthError(error) {
    const messages = {
      "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      "auth/wrong-password": "كلمة المرور غير صحيحة.",
      "auth/user-not-found": "لا يوجد حساب بهذا البريد الإلكتروني.",
      "auth/email-already-in-use": "هذا البريد مسجل بالفعل؛ جرّب تسجيل الدخول.",
      "auth/weak-password": "كلمة المرور ضعيفة؛ استخدم 6 أحرف على الأقل.",
      "auth/invalid-email": "اكتب بريدًا إلكترونيًا صحيحًا.",
      "auth/too-many-requests": "محاولات كثيرة مؤقتًا. انتظر قليلًا ثم حاول مرة أخرى.",
      "auth/network-request-failed": "تعذر الاتصال. تحقق من الإنترنت وحاول مجددًا."
    };
    return messages[error.code] || error.message || "تعذر إكمال العملية.";
  }

  async function authenticate(event) {
    event.preventDefault();
    if (!auth) return showStatus("إعداد Firebase غير مكتمل. راجع إعدادات التطبيق.", true);
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    authSubmitButton.disabled = true;
    authSubmitButton.textContent = mode === "signup" ? "جاري إنشاء الحساب..." : "جاري تسجيل الدخول...";
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
      passwordInput.value = "";
      showStatus(mode === "signup" ? "تم إنشاء حسابك بنجاح." : "تم تسجيل الدخول بنجاح.");
      // onAuthStateChanged handles loading private files and sessions once the session settles.
    } catch (error) {
      showStatus(friendlyAuthError(error), true);
    } finally {
      authSubmitButton.disabled = false;
      authSubmitButton.textContent = mode === "signup" ? "إنشاء الحساب" : "تسجيل الدخول";
    }
  }

  async function resetPassword() {
    if (!auth) return showStatus("إعداد Firebase غير مكتمل.", true);
    const email = emailInput.value.trim();
    if (!email) {
      emailInput.focus();
      return showStatus("اكتب بريدك الإلكتروني أولًا لإرسال رابط إعادة تعيين كلمة المرور.", true);
    }
    forgotPasswordButton.disabled = true;
    forgotPasswordButton.textContent = "جاري الإرسال...";
    try {
      await sendPasswordResetEmail(auth, email);
      showStatus("لو البريد مسجل، هيوصلك رابط إعادة تعيين كلمة المرور. راجع صندوق الوارد والرسائل غير المرغوب فيها.");
    } catch (error) {
      showStatus(friendlyAuthError(error), true);
    } finally {
      forgotPasswordButton.disabled = false;
      forgotPasswordButton.textContent = "نسيت كلمة المرور؟";
    }
  }

  async function askDocument(event) {
    event.preventDefault();
    const documentId = askDocumentSelect.value;
    const question = askQuestionInput.value.trim();
    if (!documentId || !question) return showStatus("اختر ملفًا واكتب سؤالك.", true);
    const button = askForm.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "جاري البحث والإجابة...";
    askAnswer.textContent = "";
    try {
      const response = await apiRequest("/api/documents/" + encodeURIComponent(documentId) + "/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question, model: window.ESHRAHLI_SELECTED_MODEL || "openrouter/free" })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذرت الإجابة.");
      const pages = [...new Set((data.sources || []).map((source) => source.pageStart).filter(Boolean))];
      askAnswer.textContent = data.answer + (pages.length ? "\n\nالمصادر: الصفحات " + pages.join("، ") : "");
      askQuestionInput.value = "";
      showStatus("تمت الإجابة بالاعتماد على مقاطع من الكتاب.");
    } catch (error) {
      showStatus(error.message, true);
      askAnswer.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "اسأل الكتاب";
    }
  }
  function renderQuiz(quiz) {
    generatedQuiz.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = quiz.title || "اختبار من الكتاب";
    const form = document.createElement("div");
    form.id = "generatedQuizForm";
    (quiz.questions || []).forEach((question, index) => {
      const fieldset = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = (index + 1) + ". " + question.question;
      fieldset.appendChild(legend);
      question.options.forEach((option, optionIndex) => {
        const label = document.createElement("label");
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "question-" + index;
        radio.value = String(optionIndex);
        radio.required = true;
        label.append(radio, document.createTextNode(" " + option));
        fieldset.appendChild(label);
      });
      form.appendChild(fieldset);
    });
    const submit = document.createElement("button");
    submit.type = "button";
    submit.textContent = "صحّح إجاباتي";
    form.appendChild(submit);
    const resultBox = document.createElement("div");
    resultBox.setAttribute("aria-live", "polite");
    submit.addEventListener("click", async () => {
      const answers = (quiz.questions || []).map((_question, index) => {
        const selected = form.querySelector('input[name="question-' + index + '"]:checked');
        return selected ? Number(selected.value) : -1;
      });
      submit.disabled = true;
      try {
        const response = await apiRequest("/api/learning/quizzes/" + encodeURIComponent(quiz.id) + "/submit", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "تعذر تصحيح الاختبار.");
        resultBox.replaceChildren();
        const score = document.createElement("h3");
        score.textContent = "نتيجتك: " + data.score + " من " + data.total + " (" + data.percentage + "%)";
        resultBox.appendChild(score);
        data.results.forEach((item, index) => {
          const line = document.createElement("p");
          line.textContent = (index + 1) + ". " + (item.correct ? "إجابة صحيحة" : "إجابة غير صحيحة") +
            " — الإجابة الصحيحة: " + (quiz.questions[index].options[item.correctIndex] || "") +
            (item.explanation ? " — " + item.explanation : "");
          resultBox.appendChild(line);
        });
        form.querySelectorAll("input").forEach((input) => { input.disabled = true; });
      } catch (error) {
        showStatus(error.message, true);
        submit.disabled = false;
      }
    });
    generatedQuiz.append(heading, form, resultBox);
  }

  async function createBookLearning(kind) {
    const documentId = askDocumentSelect.value;
    if (!documentId) return showStatus("ارفع كتابًا واختره أولًا.", true);
    const button = kind === "mindmap" ? generateMapButton : generateQuizButton;
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = kind === "mindmap" ? "جاري إنشاء الخريطة..." : "جاري إعداد الاختبار...";
    try {
      const response = await apiRequest("/api/learning/documents/" + encodeURIComponent(documentId) + "/" + (kind === "mindmap" ? "mindmap" : "quiz"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: askQuestionInput.value.trim(),
          count: 5,
          model: window.ESHRAHLI_SELECTED_MODEL || "openrouter/free"
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر إنشاء المحتوى التعليمي.");
      if (kind === "mindmap") {
        window.dispatchEvent(new CustomEvent("eshrahli:render-mindmap", { detail: data.mindmap }));
        showStatus("تم إنشاء خريطة ذهنية من مقاطع الكتاب.");
      } else {
        renderQuiz(data.quiz);
        showStatus("تم إنشاء اختبار من محتوى الكتاب.");
      }
    } catch (error) {
      showStatus(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  async function uploadPdf(event) {
    event.preventDefault();
    if (!fileInput.files?.[0]) return showStatus("اختر ملف PDF أولًا.", true);
    const file = fileInput.files[0];
    const maxBytes = 4 * 1024 * 1024;
    const hasPdfExtension = file.name.toLowerCase().endsWith(".pdf");
    const acceptedMime = !file.type || file.type === "application/pdf" || file.type === "application/x-pdf" || file.type === "application/octet-stream";
    if (!hasPdfExtension || !acceptedMime) {
      return showStatus("اختَر ملف PDF. بعض الهواتف ترسل نوع الملف فارغًا، لذلك نعتمد أيضًا على امتداد الملف وفحصه على الخادم.", true);
    }
    if (file.size > maxBytes) {
      return showStatus("حجم الملف أكبر من 4 ميجابايت. قلّل حجمه أو ارفع نسخة أصغر.", true);
    }

    const button = uploadForm.querySelector("button[type=submit]");
    button.disabled = true;
    fileInput.disabled = true;
    button.textContent = "جاري رفع الملف...";
    let uploaded = false;
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await apiRequest("/api/documents", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذرت معالجة الملف.");
      uploaded = true;
      fileInput.value = "";
      const documentId = data.document?.id;
      if (!documentId) throw new Error("تم استلام الملف لكن لم يرجع الخادم معرّف المستند.");

      if (data.document?.embeddingStatus === "ready") {
        showStatus(data.duplicate ? "الملف موجود ومفهرس بالفعل؛ تقدر تسأله مباشرة." : "تم رفع الملف وتجهيزه بنجاح. تقدر تسأله الآن.");
      } else {
        let remaining = Number(data.document?.remainingChunks ?? data.document?.chunkCount ?? 0);
        let rounds = 0;
        while (remaining > 0 && rounds < 250) {
          rounds += 1;
          button.textContent = "جاري تجهيز البحث " + rounds + "...";
          showStatus("تم استخراج النص. جاري تجهيز البحث الدلالي؛ المتبقي " + remaining + " مقطع.");
          const previousRemaining = remaining;
          const indexResponse = await apiRequest("/api/documents/" + encodeURIComponent(documentId) + "/index", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ limit: 8 })
          });
          const indexData = await indexResponse.json();
          if (!indexResponse.ok) throw new Error(indexData.error || "تعذر تجهيز البحث الدلالي.");
          if (!Number.isFinite(Number(indexData.remaining))) {
            throw new Error("الخادم لم يرجع حالة فهرسة واضحة. أعد تحميل قائمة الملفات قبل إعادة المحاولة.");
          }
          remaining = Number(indexData.remaining);
          if (indexData.complete || remaining === 0) break;
          if (remaining >= previousRemaining) {
            throw new Error("توقفت الفهرسة دون تقدم. الملف محفوظ، ويمكن إعادة المحاولة بعد قليل.");
          }
        }
        if (remaining > 0) throw new Error("الملف كبير ويحتاج وقتًا إضافيًا للفهرسة. الملف محفوظ؛ أعد المحاولة لاحقًا.");
        showStatus("اكتملت فهرسة الملف. تقدر تسأله الآن.");
      }
    } catch (error) {
      showStatus(error.message || "حدث خطأ أثناء رفع الملف.", true);
    } finally {
      button.disabled = false;
      fileInput.disabled = false;
      button.textContent = "رفع وتحليل PDF";
      if (uploaded) await loadDocuments();
    }
  }

  accountButton.addEventListener("click", () => dialog.showModal());
  closeButton.addEventListener("click", () => dialog.close());
  loginButton.addEventListener("click", () => setMode("login"));
  forgotPasswordButton.addEventListener("click", resetPassword);
  togglePasswordButton.addEventListener("click", () => {
    const showing = passwordInput.type === "text";
    passwordInput.type = showing ? "password" : "text";
    togglePasswordButton.textContent = showing ? "إظهار" : "إخفاء";
    togglePasswordButton.setAttribute("aria-label", showing ? "إظهار كلمة المرور" : "إخفاء كلمة المرور");
  });
  signupButton.addEventListener("click", () => setMode("signup"));
  authForm.addEventListener("submit", authenticate);
  logoutButton.addEventListener("click", async () => {
    if (auth) await signOut(auth);
  });
  uploadForm.addEventListener("submit", uploadPdf);
  askForm.addEventListener("submit", askDocument);
  generateMapButton.addEventListener("click", () => createBookLearning("mindmap"));
  generateQuizButton.addEventListener("click", () => createBookLearning("quiz"));

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
      window.ESHRAHLI_IS_AUTHENTICATED = !!user;
      window.dispatchEvent(new CustomEvent("eshrahli:auth-state", { detail: { signedIn: !!user } }));
      logoutButton.hidden = !user;
      authForm.hidden = !!user;
      if (forgotPasswordButton) forgotPasswordButton.hidden = !!user || mode !== "login";
      uploadForm.hidden = !user;
      docsList.hidden = !user;
      askForm.hidden = !user;
      showStatus(user ? "أهلًا " + (user.displayName || user.email) + " — ملفاتك محفوظة في حسابك." : "سجّل الدخول للوصول إلى ملفاتك.");
      if (user) { await loadDocuments(); await loadSessions(); sessionsList.hidden = false; }
      else { renderDocuments([]); if (sessionsList) { sessionsList.hidden = true; sessionsList.replaceChildren(); } }
    });
  } catch (error) {
    showStatus("تعذر تشغيل Firebase: " + error.message, true);
  }
})();
