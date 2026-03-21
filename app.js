const chat = document.getElementById('chat');
const messageInput = document.getElementById('message');
const sendBtn = document.getElementById('send');
const cameraBtn = document.getElementById('camera');
const uploadBtn = document.getElementById('upload');
const voiceBtn = document.getElementById('voice');
const fileInput = document.getElementById('file-input');
const photoPreview = document.getElementById('photo-preview');
const photoImg = document.getElementById('photo-img');
const clearPhotoBtn = document.getElementById('clear-photo');
const clearChatBtn = document.getElementById('clear-chat');
const themeToggle = document.getElementById('theme-toggle');

let history = [];
let currentPhoto = null;
let isSending = false;

// --- Theme ---

function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) {
    document.documentElement.dataset.theme = saved;
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.dataset.theme = 'dark';
  }
  updateThemeIcon();
}

function updateThemeIcon() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  themeToggle.textContent = isDark ? '☀️' : '🌙';
}

themeToggle.addEventListener('click', () => {
  const isDark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'light' : 'dark';
  localStorage.setItem('theme', document.documentElement.dataset.theme);
  updateThemeIcon();
});

initTheme();

// --- localStorage persistence ---

function saveHistory() {
  const trimmed = history.slice(-50);
  localStorage.setItem('chat-history', JSON.stringify(trimmed));
}

function loadHistory() {
  try {
    const saved = localStorage.getItem('chat-history');
    if (!saved) return;
    history = JSON.parse(saved);
    for (const entry of history) {
      renderMessage(entry.user, true, entry.time);
      renderMessage(entry.assistant, false, entry.time);
    }
  } catch {
    history = [];
  }
}

// --- Welcome ---

function addWelcome() {
  if (chat.querySelector('.welcome')) return;
  const div = document.createElement('div');
  div.className = 'welcome';

  const title = document.createElement('strong');
  title.textContent = 'Привіт! Я — Репетик 🤖';
  div.appendChild(title);

  const desc = document.createElement('p');
  desc.textContent = 'Сфотографуй завдання або напиши питання з будь-якого предмету 3 класу!';
  div.appendChild(desc);

  const examples = document.createElement('div');
  examples.className = 'welcome-examples';

  const prompts = [
    'Скільки буде 7 × 8?',
    'Як пишеться слово "сонце"?',
    'Розкажи про кругообіг води',
  ];

  for (const text of prompts) {
    const btn = document.createElement('button');
    btn.className = 'example-prompt';
    btn.textContent = text;
    btn.addEventListener('click', () => {
      messageInput.value = text;
      sendMessage();
    });
    examples.appendChild(btn);
  }

  div.appendChild(examples);
  chat.appendChild(div);
}

// --- Messages ---

function formatTime(date) {
  const d = date ? new Date(date) : new Date();
  return d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

function renderMessage(text, isUser, time) {
  if (!text) return;
  const welcome = chat.querySelector('.welcome');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = `msg ${isUser ? 'user' : 'bot'}`;

  if (!isUser) {
    const avatar = document.createElement('span');
    avatar.className = 'bot-avatar';
    avatar.textContent = '🤖';
    div.appendChild(avatar);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  div.appendChild(bubble);

  const timestamp = document.createElement('span');
  timestamp.className = 'msg-time';
  timestamp.textContent = formatTime(time);
  div.appendChild(timestamp);

  chat.appendChild(div);
  chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
}

function addMessage(text, isUser) {
  renderMessage(text, isUser);
}

// --- Typing indicator ---

function showTyping() {
  const existing = chat.querySelector('.typing-indicator');
  if (existing) return;

  const div = document.createElement('div');
  div.className = 'msg bot typing-indicator';

  const avatar = document.createElement('span');
  avatar.className = 'bot-avatar';
  avatar.textContent = '🤖';
  div.appendChild(avatar);

  const bubble = document.createElement('div');
  bubble.className = 'bubble typing-bubble';
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('span');
    dot.className = 'typing-dot';
    bubble.appendChild(dot);
  }
  div.appendChild(bubble);
  chat.appendChild(div);
  chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
}

function hideTyping() {
  const el = chat.querySelector('.typing-indicator');
  if (el) el.remove();
}

// --- Errors ---

function showError(msg, retryFn) {
  const existing = chat.querySelector('.error');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.className = 'error';

  const text = document.createElement('span');
  text.textContent = msg;
  div.appendChild(text);

  if (retryFn) {
    const retryBtn = document.createElement('button');
    retryBtn.className = 'retry-btn';
    retryBtn.textContent = 'Спробувати ще';
    retryBtn.addEventListener('click', () => {
      div.remove();
      retryFn();
    });
    div.appendChild(retryBtn);
  }

  chat.appendChild(div);
  chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
  setTimeout(() => { if (div.parentNode) div.remove(); }, 10000);
}

// --- Image compression ---

function compressImage(file, maxWidth = 1024, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const base64 = dataUrl.split(',')[1];
      URL.revokeObjectURL(img.src);
      resolve(base64);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Не вдалося завантажити зображення'));
    };
    img.src = URL.createObjectURL(file);
  });
}

// --- UI Lock ---

function setUILocked(locked) {
  isSending = locked;
  sendBtn.disabled = locked;
  messageInput.disabled = locked;
  cameraBtn.disabled = locked;
  uploadBtn.disabled = locked;
  voiceBtn.disabled = locked;
  if (locked) {
    sendBtn.classList.add('sending');
  } else {
    sendBtn.classList.remove('sending');
  }
}

// --- Send ---

let lastSendData = null;

async function sendMessage() {
  if (isSending) return;

  const text = messageInput.value.trim();
  if (!text && !currentPhoto) return;

  if (text.length > 2000) {
    showError('Повідомлення занадто довге (макс. 2000 символів)');
    return;
  }

  const userText = text || 'Допоможи з цією задачею (я сфотографував)';
  const photoToSend = currentPhoto;

  addMessage(userText, true);
  messageInput.value = '';
  setUILocked(true);
  showTyping();

  // Clear photo preview
  if (currentPhoto) {
    revokePhotoPreview();
    currentPhoto = null;
    photoPreview.classList.add('hidden');
  }

  let imageBase64 = null;
  if (photoToSend) {
    try {
      imageBase64 = await compressImage(photoToSend);
    } catch {
      hideTyping();
      setUILocked(false);
      showError('Не вдалося обробити фото');
      return;
    }
  }

  lastSendData = { userText, imageBase64 };

  await doSend(userText, imageBase64);
}

async function doSend(userText, imageBase64) {
  setUILocked(true);
  showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        history,
        message: userText,
        imageBase64
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Помилка сервера');
    }

    const now = new Date().toISOString();
    history.push({ user: userText, assistant: data.hint, time: now });
    saveHistory();
    hideTyping();
    addMessage(data.hint, false);
  } catch (err) {
    hideTyping();
    showError(err.message, () => doSend(userText, imageBase64));
  } finally {
    setUILocked(false);
  }
}

// --- Photo handling ---

function revokePhotoPreview() {
  if (photoImg.src && photoImg.src.startsWith('blob:')) {
    URL.revokeObjectURL(photoImg.src);
  }
}

function handlePhoto(file) {
  if (!file || !file.type.startsWith('image/')) return;

  if (file.size > 10 * 1024 * 1024) {
    showError('Фото занадто велике (макс. 10 МБ)');
    return;
  }

  revokePhotoPreview();
  currentPhoto = file;
  photoImg.src = URL.createObjectURL(file);
  photoPreview.classList.remove('hidden');
}

cameraBtn.addEventListener('click', () => {
  fileInput.setAttribute('capture', 'environment');
  fileInput.click();
});

uploadBtn.addEventListener('click', () => {
  fileInput.removeAttribute('capture');
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  handlePhoto(file);
  e.target.value = '';
});

clearPhotoBtn.addEventListener('click', () => {
  revokePhotoPreview();
  currentPhoto = null;
  photoPreview.classList.add('hidden');
});

// --- Send button ---

sendBtn.addEventListener('click', (e) => {
  e.preventDefault();
  sendMessage();
});

sendBtn.addEventListener('touchend', (e) => {
  e.preventDefault();
  sendMessage();
});

messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// --- Voice ---

voiceBtn.addEventListener('click', () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showError('Голос не підтримується в цьому браузері');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'uk-UA';
  recognition.continuous = false;

  voiceBtn.classList.add('recording');

  recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    messageInput.value = text;
  };

  recognition.onend = () => {
    voiceBtn.classList.remove('recording');
  };

  recognition.onerror = () => {
    voiceBtn.classList.remove('recording');
    showError('Не вдалося розпізнати голос');
  };

  recognition.start();
});

// --- Clear chat ---

clearChatBtn.addEventListener('click', () => {
  if (!confirm('Очистити всю розмову?')) return;
  history = [];
  localStorage.removeItem('chat-history');
  chat.innerHTML = '';
  addWelcome();
});

// --- Mobile viewport fix (keyboard open/close) ---

function setViewportHeight() {
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--vh', vh + 'px');
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    setViewportHeight();
    setTimeout(() => chat.scrollTo({ top: chat.scrollHeight }), 100);
  });
}
window.addEventListener('resize', setViewportHeight);
setViewportHeight();

// --- Init ---

if (history.length === 0) {
  const saved = localStorage.getItem('chat-history');
  if (saved) {
    loadHistory();
  } else {
    addWelcome();
  }
} else {
  addWelcome();
}
