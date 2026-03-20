const rateLimit = new Map();

const FREE_MODELS = [
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'google/gemma-3-12b-it:free',
  'google/gemma-3-4b-it:free',
  'google/gemma-3n-e4b-it:free',
];

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

async function callModel(model, messages, apiKey) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://ai-helper-alpha.vercel.app',
      'X-Title': 'AI Repetitor',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || `${model} returned ${response.status}`);
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Empty response');
  }

  return text;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не дозволений' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
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

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

  const recentHistory = Array.isArray(history) ? history.slice(-10) : [];
  for (const entry of recentHistory) {
    if (entry.user) messages.push({ role: 'user', content: entry.user });
    if (entry.assistant) messages.push({ role: 'assistant', content: entry.assistant });
  }

  if (imageBase64) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: message },
        {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
        }
      ]
    });
  } else {
    messages.push({ role: 'user', content: message });
  }

  // Try each model, fallback to next on failure
  for (const model of FREE_MODELS) {
    try {
      const hint = await callModel(model, messages, apiKey);
      return res.status(200).json({ hint });
    } catch (err) {
      console.error(`Model ${model} failed:`, err.message);
      continue;
    }
  }

  return res.status(500).json({ error: 'Всі моделі зайняті. Спробуй через хвилину.' });
}
