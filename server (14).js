const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/log', (req, res) => {
  const { email, first_name, last_name, full_name, device, userAgent, platform } = req.body || {};

  console.log('====================================');
  console.log('تسجيل دخول جديد');
  console.log('الوقت:', new Date().toLocaleString('ar-SA'));
  console.log('الإيميل:', email);
  console.log('الاسم الأول:', first_name);
  console.log('اسم العائلة:', last_name);
  console.log('الاسم الكامل:', full_name);
  console.log('الجهاز:', device);
  console.log('المنصة:', platform);
  console.log('User Agent:', userAgent);
  console.log('====================================');

  res.status(200).json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`السيرفر شغال على المنفذ ${PORT}`);
});
