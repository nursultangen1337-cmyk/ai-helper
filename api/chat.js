const rateLimit = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 15;

  const entry = rateLimit.get(ip);
  if (!entry || now - entry.start > windowMs) {
    rateLimit.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= maxRequests;
}

const SYSTEM_PROMPT = `Ти — AI-репетитор з математики для учнів 3 класу. Тебе звати Репетик.
Правила:
- НІКОЛИ не давай готову відповідь. Давай підказки, щоб учень дійшов сам.
- Якщо учень написав відповідь — перевір і скажи правильно чи ні. Якщо ні — підкажи де помилка.
- Використовуй просту мову для дитини 8-9 років.
- Будь доброзичливим та підтримуючим. Хвали за спроби.
- Відповідай тільки на теми математики 3 класу (додавання, віднімання, множення, ділення, задачі).
- Якщо питання не про математику — ввічливо поверни до теми.
- Відповідай українською мовою.
- Якщо надіслано фото задачі — прочитай її і допоможи розібратися.
- Відповідай коротко — 2-4 речення максимум.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не дозволений' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API ключ не налаштований.' });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Забагато запитів. Зачекай хвилинку!' });
  }

  const { history, message, imageBase64 } = req.body || {};

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Повідомлення не може бути порожнім' });
  }

  if (message.length > 2000) {
    return res.status(400).json({ error: 'Повідомлення занадто довге (макс. 2000 символів)' });
  }

  // Build conversation contents for Gemini API
  const contents = [];

  const recentHistory = Array.isArray(history) ? history.slice(-10) : [];
  for (const entry of recentHistory) {
    if (entry.user) {
      contents.push({ role: 'user', parts: [{ text: entry.user }] });
    }
    if (entry.assistant) {
      contents.push({ role: 'model', parts: [{ text: entry.assistant }] });
    }
  }

  // Current message
  const parts = [{ text: message }];
  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: imageBase64,
      },
    });
  }
  contents.push({ role: 'user', parts });

  const body = {
    contents,
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 500,
    },
  };

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API error:', JSON.stringify(data));
      return res.status(500).json({ error: data.error?.message || 'Помилка Gemini API' });
    }

    const hint = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Щось пішло не так. Спробуй ще раз!';
    return res.status(200).json({ hint });
  } catch (err) {
    console.error('Fetch error:', err.message);
    return res.status(500).json({ error: 'Не вдалося отримати відповідь. Спробуй пізніше.' });
  }
}
