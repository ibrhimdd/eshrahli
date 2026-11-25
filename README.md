# اشرحلي ✏️

سبورة ذكاء اصطناعي تفاعلية بترسم خريطة ذهنية متحركة لأي موضوع تذاكره — مستوحاة من ميزة Knowie في تطبيق Knowunity.

للتفاصيل الكاملة عن الفكرة والبنية التقنية وخطة التطوير، شوف [`PROJECT.md`](./PROJECT.md).

## تشغيل المشروع محليًا

### 1. الباك إند
```bash
cd backend
npm install
cp .env.example .env   # اختياري: ضيف ANTHROPIC_API_KEY لو عايز توليد حقيقي بالذكاء الاصطناعي
npm start
```
السيرفر هيشتغل على `http://localhost:4000` (أو البورت اللي تحطه في `.env`).

### 2. الواجهة الأمامية
افتح `frontend/index.html` في أي متصفح مباشرة، أو قدّمه بأي static server بسيط:
```bash
cd frontend
npx serve .
```

المواضيع الأربعة الجاهزة (المرايا، الدورة الدموية، الثورة الفرنسية، التمثيل الضوئي) بترسم فورًا من غير سيرفر. أي موضوع تاني بيتبعت لـ `/api/mindmap` في الباك إند.

## البنية
```
eshrahli/
├── PROJECT.md          # فكرة المشروع والبنية التقنية وخطة التطوير
├── frontend/
│   └── index.html      # الواجهة الكاملة (HTML/CSS/JS خالص)
└── backend/
    ├── server.js        # سيرفر Express
    ├── routes/mindmap.js
    ├── package.json
    └── .env.example
```

## الحالة
نموذج أولي (Prototype) للتجربة والعرض.
