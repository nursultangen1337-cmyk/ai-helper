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
const loading = document.getElementById('loading');

let history = [];
let currentPhoto = null;


function addWelcome() {
  if (chat.querySelector('.welcome')) return;
  const div = document.createElement('div');
  div.className = 'welcome';
  div.innerHTML = `
    <strong>Сфотографуй задачу або напиши питання</strong>
    <p>Я підкажу, як дійти до відповіді. Коли порахуєш — напиши результат, і я скажу чи правильно!</p>
  `;
  chat.appendChild(div);
}

addWelcome();

function addMessage(text, isUser) {
  const welcome = chat.querySelector('.welcome');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = `msg ${isUser ? 'user' : 'bot'}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  div.appendChild(bubble);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function showError(msg) {
  const existing = chat.querySelector('.error');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.className = 'error';
  div.textContent = msg;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  setTimeout(() => div.remove(), 5000);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text && !currentPhoto) return;

  const userText = text || 'Допоможи з цією задачею (я сфотографував)';
  addMessage(userText, true);
  messageInput.value = '';
  loading.classList.remove('hidden');

  let imageBase64 = null;
  if (currentPhoto) {
    imageBase64 = await fileToBase64(currentPhoto);
    currentPhoto = null;
    photoPreview.classList.add('hidden');
  }

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

    history.push({ user: userText, assistant: data.hint });
    addMessage(data.hint, false);
  } catch (err) {
    showError(err.message);
  } finally {
    loading.classList.add('hidden');
  }
}

function handlePhoto(file) {
  if (!file || !file.type.startsWith('image/')) return;
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
  currentPhoto = null;
  photoPreview.classList.add('hidden');
});

sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

voiceBtn.addEventListener('click', () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showError('Голос не підтримується в цьому браузері');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'uk-UA';
  recognition.continuous = false;

  recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    messageInput.value = text;
  };

  recognition.onerror = () => {
    showError('Не вдалося розпізнати голос');
  };

  recognition.start();
});
