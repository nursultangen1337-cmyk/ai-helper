import OpenAI from 'openai';

const rateLimit = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 20;

  const entry = rateLimit.get(ip);
  if (!entry || now - entry.start > windowMs) {
    rateLimit.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= maxRequests;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не дозволений' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API ключ не налаштований. Зверніться до адміністратора.' });
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

  if (imageBase64 && imageBase64.length > 5_500_000) {
    return res.status(400).json({ error: 'Зображення занадто велике' });
  }

  const systemMessage = {
    role: 'system',
    content: `Ти — AI-репетитор з математики для учнів 3 класу. Тебе звати Репетик.
Правила:
- НІКОЛИ не давай готову відповідь. Давай підказки, щоб учень дійшов сам.
- Якщо учень написав відповідь — перевір і скажи правильно чи ні. Якщо ні — підкажи де помилка.
- Використовуй просту мову для дитини 8-9 років.
- Будь доброзичливим та підтримуючим. Хвали за спроби.
- Відповідай тільки на теми математики 3 класу (додавання, віднімання, множення, ділення, задачі).
- Якщо питання не про математику — ввічливо поверни до теми.
- Відповідай українською мовою.
- Якщо надіслано фото задачі — прочитай її і допоможи розібратися.
- Відповідай коротко — 2-4 речення максимум.`
  };

  const messages = [systemMessage];

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
          image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: 'low' }
        }
      ]
    });
  } else {
    messages.push({ role: 'user', content: message });
  }

  try {
    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const hint = completion.choices[0]?.message?.content || 'Щось пішло не так. Спробуй ще раз!';
    return res.status(200).json({ hint });
  } catch (err) {
    console.error('OpenAI error:', err.message);
    return res.status(500).json({ error: 'Не вдалося отримати відповідь. Спробуй пізніше.' });
  }
}
