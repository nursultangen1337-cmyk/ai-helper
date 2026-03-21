// Show JS errors visually (for debugging on phone)
window.onerror = function(msg, url, line) {
  var el = document.createElement('div');
  el.className = 'js-error';
  el.textContent = 'JS помилка: ' + msg + ' (рядок ' + line + ')';
  document.body.prepend(el);
  setTimeout(function() { el.remove(); }, 8000);
};

document.addEventListener('DOMContentLoaded', function() {
  var chat = document.getElementById('chat');
  var messageInput = document.getElementById('message');
  var sendBtn = document.getElementById('send');
  var cameraBtn = document.getElementById('camera');
  var uploadBtn = document.getElementById('upload');
  var voiceBtn = document.getElementById('voice');
  var fileInput = document.getElementById('file-input');
  var photoPreview = document.getElementById('photo-preview');
  var photoImg = document.getElementById('photo-img');
  var clearPhotoBtn = document.getElementById('clear-photo');
  var clearChatBtn = document.getElementById('clear-chat');
  var themeToggle = document.getElementById('theme-toggle');
  var chatForm = document.getElementById('chat-form');

  var history = [];
  var currentPhoto = null;
  var isSending = false;

  // --- Safe localStorage ---

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function storageSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  // --- Theme ---

  function initTheme() {
    var saved = storageGet('theme');
    if (saved) {
      document.documentElement.dataset.theme = saved;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.dataset.theme = 'dark';
    }
    updateThemeIcon();
  }

  function updateThemeIcon() {
    var isDark = document.documentElement.dataset.theme === 'dark';
    themeToggle.textContent = isDark ? '☀️' : '🌙';
  }

  themeToggle.onclick = function() {
    var isDark = document.documentElement.dataset.theme === 'dark';
    document.documentElement.dataset.theme = isDark ? 'light' : 'dark';
    storageSet('theme', document.documentElement.dataset.theme);
    updateThemeIcon();
  };

  initTheme();

  // --- localStorage persistence ---

  function saveHistory() {
    var trimmed = history.slice(-50);
    storageSet('chat-history', JSON.stringify(trimmed));
  }

  function loadHistory() {
    try {
      var saved = storageGet('chat-history');
      if (!saved) return;
      history = JSON.parse(saved);
      for (var i = 0; i < history.length; i++) {
        renderMessage(history[i].user, true, history[i].time);
        renderMessage(history[i].assistant, false, history[i].time);
      }
    } catch (e) {
      history = [];
    }
  }

  // --- Welcome ---

  function addWelcome() {
    if (chat.querySelector('.welcome')) return;
    var div = document.createElement('div');
    div.className = 'welcome';

    var title = document.createElement('strong');
    title.textContent = 'Привіт! Я — Репетик 🤖';
    div.appendChild(title);

    var desc = document.createElement('p');
    desc.textContent = 'Сфотографуй завдання або напиши питання з будь-якого предмету 3 класу!';
    div.appendChild(desc);

    var examples = document.createElement('div');
    examples.className = 'welcome-examples';

    var prompts = [
      'Скільки буде 7 × 8?',
      'Як пишеться слово "сонце"?',
      'Розкажи про кругообіг води',
    ];

    prompts.forEach(function(text) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'example-prompt';
      btn.textContent = text;
      btn.onclick = function() {
        messageInput.value = text;
        sendMessage();
      };
      examples.appendChild(btn);
    });

    div.appendChild(examples);
    chat.appendChild(div);
  }

  // --- Messages ---

  function formatTime(date) {
    var d = date ? new Date(date) : new Date();
    return d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  }

  function renderMessage(text, isUser, time) {
    if (!text) return;
    var welcome = chat.querySelector('.welcome');
    if (welcome) welcome.remove();

    var div = document.createElement('div');
    div.className = 'msg ' + (isUser ? 'user' : 'bot');

    if (!isUser) {
      var avatar = document.createElement('span');
      avatar.className = 'bot-avatar';
      avatar.textContent = '🤖';
      div.appendChild(avatar);
    }

    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;
    div.appendChild(bubble);

    var timestamp = document.createElement('span');
    timestamp.className = 'msg-time';
    timestamp.textContent = formatTime(time);
    div.appendChild(timestamp);

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  // --- Typing indicator ---

  function showTyping() {
    var existing = chat.querySelector('.typing-indicator');
    if (existing) return;

    var div = document.createElement('div');
    div.className = 'msg bot typing-indicator';

    var avatar = document.createElement('span');
    avatar.className = 'bot-avatar';
    avatar.textContent = '🤖';
    div.appendChild(avatar);

    var bubble = document.createElement('div');
    bubble.className = 'bubble typing-bubble';
    for (var i = 0; i < 3; i++) {
      var dot = document.createElement('span');
      dot.className = 'typing-dot';
      bubble.appendChild(dot);
    }
    div.appendChild(bubble);
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  function hideTyping() {
    var el = chat.querySelector('.typing-indicator');
    if (el) el.remove();
  }

  // --- Errors ---

  function showError(msg, retryFn) {
    var existing = chat.querySelector('.error');
    if (existing) existing.remove();

    var div = document.createElement('div');
    div.className = 'error';

    var text = document.createElement('span');
    text.textContent = msg;
    div.appendChild(text);

    if (retryFn) {
      var retryBtn = document.createElement('button');
      retryBtn.className = 'retry-btn';
      retryBtn.textContent = 'Спробувати ще';
      retryBtn.onclick = function() {
        div.remove();
        retryFn();
      };
      div.appendChild(retryBtn);
    }

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    setTimeout(function() { if (div.parentNode) div.remove(); }, 10000);
  }

  // --- Image compression ---

  function compressImage(file, maxWidth, quality) {
    maxWidth = maxWidth || 1024;
    quality = quality || 0.7;
    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.onload = function() {
        var w = img.width;
        var h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL('image/jpeg', quality);
        var base64 = dataUrl.split(',')[1];
        URL.revokeObjectURL(img.src);
        resolve(base64);
      };
      img.onerror = function() {
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

  function sendMessage() {
    if (isSending) return;

    var text = messageInput.value.trim();
    if (!text && !currentPhoto) return;

    if (text.length > 2000) {
      showError('Повідомлення занадто довге (макс. 2000 символів)');
      return;
    }

    var userText = text || 'Допоможи з цією задачею (я сфотографував)';
    var photoToSend = currentPhoto;

    renderMessage(userText, true);
    messageInput.value = '';
    setUILocked(true);
    showTyping();

    if (currentPhoto) {
      revokePhotoPreview();
      currentPhoto = null;
      photoPreview.classList.add('hidden');
    }

    if (photoToSend) {
      compressImage(photoToSend).then(function(base64) {
        doSend(userText, base64);
      }).catch(function() {
        hideTyping();
        setUILocked(false);
        showError('Не вдалося обробити фото');
      });
    } else {
      doSend(userText, null);
    }
  }

  function doSend(userText, imageBase64) {
    setUILocked(true);
    showTyping();

    var body = JSON.stringify({
      history: history,
      message: userText,
      imageBase64: imageBase64
    });

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body
    })
    .then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) throw new Error(data.error || 'Помилка сервера');
        return data;
      });
    })
    .then(function(data) {
      var now = new Date().toISOString();
      history.push({ user: userText, assistant: data.hint, time: now });
      saveHistory();
      hideTyping();
      renderMessage(data.hint, false);
    })
    .catch(function(err) {
      hideTyping();
      showError(err.message, function() { doSend(userText, imageBase64); });
    })
    .finally(function() {
      setUILocked(false);
    });
  }

  // --- Photo handling ---

  function revokePhotoPreview() {
    if (photoImg.src && photoImg.src.indexOf('blob:') === 0) {
      URL.revokeObjectURL(photoImg.src);
    }
  }

  function handlePhoto(file) {
    if (!file || file.type.indexOf('image/') !== 0) return;

    if (file.size > 10 * 1024 * 1024) {
      showError('Фото занадто велике (макс. 10 МБ)');
      return;
    }

    revokePhotoPreview();
    currentPhoto = file;
    photoImg.src = URL.createObjectURL(file);
    photoPreview.classList.remove('hidden');
  }

  cameraBtn.onclick = function() {
    fileInput.setAttribute('capture', 'environment');
    fileInput.click();
  };

  uploadBtn.onclick = function() {
    fileInput.removeAttribute('capture');
    fileInput.click();
  };

  fileInput.onchange = function(e) {
    var file = e.target.files[0];
    handlePhoto(file);
    e.target.value = '';
  };

  clearPhotoBtn.onclick = function() {
    revokePhotoPreview();
    currentPhoto = null;
    photoPreview.classList.add('hidden');
  };

  // --- Form submit (works on mobile natively) ---

  chatForm.onsubmit = function(e) {
    e.preventDefault();
    sendMessage();
    return false;
  };

  // --- Voice ---

  voiceBtn.onclick = function() {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showError('Голос не підтримується в цьому браузері');
      return;
    }

    var recognition = new SpeechRecognition();
    recognition.lang = 'uk-UA';
    recognition.continuous = false;

    voiceBtn.classList.add('recording');

    recognition.onresult = function(e) {
      var text = e.results[0][0].transcript;
      messageInput.value = text;
    };

    recognition.onend = function() {
      voiceBtn.classList.remove('recording');
    };

    recognition.onerror = function() {
      voiceBtn.classList.remove('recording');
      showError('Не вдалося розпізнати голос');
    };

    recognition.start();
  };

  // --- Clear chat ---

  clearChatBtn.onclick = function() {
    if (!confirm('Очистити всю розмову?')) return;
    history = [];
    storageRemove('chat-history');
    chat.innerHTML = '';
    addWelcome();
  };

  // --- Init ---

  var saved = storageGet('chat-history');
  if (saved) {
    loadHistory();
  } else {
    addWelcome();
  }
});
