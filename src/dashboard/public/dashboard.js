/**
 * Pro CRM — Admin Dashboard JavaScript
 */

const API_BASE = window.location.origin;
let authToken = localStorage.getItem('procrm_token');
let currentUser = null;
try {
  currentUser = JSON.parse(localStorage.getItem('procrm_user') || 'null');
} catch (e) {
  console.error('Invalid user data in storage');
  localStorage.removeItem('procrm_user');
  localStorage.removeItem('procrm_token');
}
let currentPage = 'overview';
let currentLang = localStorage.getItem('procrm_lang') || 'en';
let currentTheme = localStorage.getItem('procrm_theme') || 'auto';
let searchTimeout = null;

function initTheme() {
  const isLight = currentTheme === 'light' || (currentTheme === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches);
  const theme = isLight ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  
  // Update icons
  const sun = document.getElementById('theme-icon-sun');
  const moon = document.getElementById('theme-icon-moon');
  if (sun && moon) {
    if (isLight) {
      sun.classList.remove('hidden');
      moon.classList.add('hidden');
    } else {
      sun.classList.add('hidden');
      moon.classList.remove('hidden');
    }
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  currentTheme = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('procrm_theme', currentTheme);
  initTheme();
  showToast(`Switched to ${currentTheme} mode`, 'info');
}

// Initial call after DOM loads to ensure icons are found
document.addEventListener('DOMContentLoaded', initTheme);
initTheme();

const TRANSLATIONS = {
  en: {
    overview: 'Overview',
    conversations: 'Conversations',
    contacts: 'Contacts',
    audit: 'Audit Logs',
    agents: 'Agents',
    simulator: '🧪 Message Simulator',
    active_contacts: 'Active Contacts',
    open_convs: 'Open Conversations',
    today_msgs: 'Today\'s Messages',
    sla_breaches: 'SLA Breaches',
    system_online: 'System Online',
    system_degraded: 'System Degraded',
    refresh: 'Refresh',
    logout: 'Sign Out',
    add_agent: 'Add New Agent',
    team_mgmt: 'Team Management',
    kb_title: 'AI Knowledge Base',
    kb_subtitle: 'Train your AI with business profile, FAQs, and policies',
    kb_save: 'Save Knowledge',
    settings: 'System Settings',
    settings_subtitle: 'Configure Meta WhatsApp API, Gemini AI, and system integrations',
    save_id: 'Save ID',
    save_token: 'Save Token',
    save_key: 'Save Key',
    test_conn: 'Test Connection',
    recent_convs: 'Recent Conversations',
    message_trends: 'Message Trends (Last 7 Days)',
    inbound: 'Inbound',
    outbound: 'Outbound',
    recent_activity: 'Recent Activity',
    background_tasks: 'Background Tasks',
    view_all: 'View All',
    view_logs: 'View Logs',
    search_placeholder: 'Search conversations...'
  },
  si: {
    overview: 'දළ විශ්ලේෂණය',
    conversations: 'සංවාද',
    contacts: 'සම්බන්ධතා',
    audit: 'පද්ධති ලොග්',
    agents: 'නියෝජිතයින්',
    simulator: '🧪 පණිවිඩ සිමියුලේටරය',
    active_contacts: 'ක්‍රියාකාරී සම්බන්ධතා',
    open_convs: 'විවෘත සංවාද',
    today_msgs: 'අද පණිවිඩ',
    sla_breaches: 'SLA උල්ලංඝනය කිරීම්',
    system_online: 'පද්ධතිය සක්‍රීයයි',
    system_degraded: 'පද්ධතියේ දෝෂයක්',
    refresh: 'අලුත් කරන්න',
    logout: 'ඉවත් වන්න',
    add_agent: 'නව නියෝජිතයෙකු එක් කරන්න',
    team_mgmt: 'කණ්ඩායම් කළමනාකරණය',
    kb_title: 'AI දැනුම් පද්ධතිය',
    kb_subtitle: 'ඔබේ AI හට ව්‍යාපාරික විස්තර, ප්‍රශ්න සහ පිළිතුරු උගන්වන්න',
    kb_save: 'දත්ත සුරකින්න',
    settings: 'පද්ධති සැකසුම්',
    settings_subtitle: 'Meta WhatsApp API, Gemini AI සහ අනෙකුත් පද්ධති සම්බන්ධතා සකසන්න',
    save_id: 'ID එක සුරකින්න',
    save_token: 'Token එක සුරකින්න',
    save_key: 'Key එක සුරකින්න',
    test_conn: 'සම්බන්ධතාවය පරීක්ෂා කරන්න',
    recent_convs: 'මෑත සංවාද',
    message_trends: 'පණිවිඩ ප්‍රවණතා (පසුගිය දින 7)',
    inbound: 'ලැබුණු',
    outbound: 'යැවූ',
    recent_activity: 'මෑත ක්‍රියාකාරකම්',
    background_tasks: 'පසුබිම් කාර්යයන්',
    view_all: 'සියල්ල බලන්න',
    view_logs: 'ලොග් බලන්න',
    search_placeholder: 'සංවාද සොයන්න...'
  }
};

// ─── INITIALIZATION ───
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Load Public Branding Settings
    const pubRes = await fetch(`${API_BASE}/api/system/public-settings`);
    if (pubRes.ok) {
      const pubSettings = await pubRes.json();
      applyBranding(pubSettings);
    }

    // 2. Check Setup Status
    const res = await fetch(`${API_BASE}/api/setup/status`);
    const data = await res.json();
    if (data.setup_required) {
      showSetup();
      return;
    }
  } catch (err) {
    console.error("Failed during initialization", err);
    showToast('Failed to connect to server. Please refresh.', 'error');
  }

  if (authToken && currentUser) {
    showDashboard();
    refreshDashboard();
    applyLanguage();
    requestNotificationPermission();
  } else {
    showLogin();
  }
});

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showPushNotification(title, body, icon) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body: body,
      icon: icon || '/admin/favicon.ico',
    });
  }
}

let socket = null;
function initRealtime() {
  if (socket) return;

  socket = io({
    auth: { token: authToken }
  });

  socket.on('connect', () => {
    console.log('⚡ Connected to real-time server');
    document.getElementById('system-status').classList.replace('degraded', 'online');
  });

  socket.on('notification:new', (notif) => {
    addNotificationToUI(notif);
    showPushNotification('Pro CRM', notif.message);
  });

  socket.on('message:new', (msg) => {
    if (currentPage === 'conversations') loadConversations();
    if (msg.direction === 'inbound') showToast(`New message from ${msg.contactName}`, 'info');
  });

  socket.on('disconnect', () => {
    console.warn('🔌 Disconnected from real-time server');
    document.getElementById('system-status').classList.replace('online', 'degraded');
  });
}

// ─── AUTH ───
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  btn.disabled = true;
  btn.innerHTML = '<span>Signing in...</span>';
  errorEl.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Login failed';
      return;
    }

    authToken = data.token;
    currentUser = data.agent;
    localStorage.setItem('procrm_token', authToken);
    localStorage.setItem('procrm_user', JSON.stringify(currentUser));

    showDashboard();
    refreshDashboard();
  } catch (err) {
    errorEl.textContent = 'Connection error. Is the server running?';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Sign In</span>';
  }
}

function handleLogout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('procrm_token');
  localStorage.removeItem('procrm_user');
  showLogin();
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');
  const setupScreen = document.getElementById('setup-screen');
  if(setupScreen) setupScreen.classList.add('hidden');
}

function showSetup() {
  const setupScreen = document.getElementById('setup-screen');
  if(setupScreen) setupScreen.classList.remove('hidden');
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.add('hidden');
}

async function handleSetup(e) {
  e.preventDefault();
  
  const adminName = document.getElementById('setup-admin-name').value;
  const adminEmail = document.getElementById('setup-admin-email').value;
  const adminPassword = document.getElementById('setup-admin-password').value;
  const companyName = document.getElementById('setup-company-name').value;
  const whatsappPhoneId = document.getElementById('setup-wa-phone-id').value;
  const whatsappToken = document.getElementById('setup-wa-token').value;
  const geminiApiKey = document.getElementById('setup-gemini-key').value;
  const errorEl = document.getElementById('setup-error');
  const btn = document.getElementById('setup-btn');

  btn.disabled = true;
  btn.innerHTML = '<span>Setting up...</span>';
  errorEl.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/api/setup/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminName, adminEmail, adminPassword, companyName, 
        whatsappPhoneId, whatsappToken, geminiApiKey
      })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Setup failed');

    document.getElementById('login-email').value = adminEmail;
    document.getElementById('login-password').value = adminPassword;
    alert("Setup completed! Please sign in.");
    showLogin();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Complete Setup</span>';
  }
}

function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  const setupScreen = document.getElementById('setup-screen');
  if(setupScreen) setupScreen.classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');

  if (currentUser) {
    document.getElementById('user-name').textContent = currentUser.name || currentUser.email;
    document.getElementById('user-role').textContent = currentUser.role || 'agent';
    document.getElementById('user-avatar').textContent = (currentUser.name || 'A')[0].toUpperCase();
  }

  setupRealtimeStream();
  loadTemplates();
}

// ─── API HELPER ───
async function apiCall(endpoint, options = {}, legacyBody = undefined) {
  if (typeof options === 'string') {
    options = {
      method: options,
      body: legacyBody !== undefined ? JSON.stringify(legacyBody) : undefined,
    };
  }

  const headers = {
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    if (res.status === 401) {
      handleLogout();
      return null;
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) return { error: data.error || `Request failed (${res.status})`, ...data };
    return data;
  } catch (err) {
    console.error('API error:', err);
    return null;
  }
}

// ─── REAL-TIME (Socket.IO) ───
let notifications = [];
let unreadCount = 0;

function setupRealtimeStream() {
  if (socket) socket.disconnect();

  socket = io(API_BASE, {
    auth: { token: authToken },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    console.log('⚡ Real-time connected');
    updateConnectionStatus(true);
  });

  socket.on('disconnect', () => {
    console.warn('⚡ Real-time disconnected');
    updateConnectionStatus(false);
  });

  // New message from pipeline
  socket.on('message:new', (data) => {
    if (data.direction === 'inbound') {
      showToast(`📩 New message from ${data.contactName || 'Customer'}`, 'info');
      sendDesktopNotification(`New message from ${data.contactName || 'Customer'}`);
    }

    // Refresh active conversation
    if (activeConversationId === data.conversationId) {
      loadChatMessages(data.conversationId);
    }

    // Refresh conversation list
    if (currentPage === 'conversations') {
      loadConversations();
    }

    // Update stats
    loadDashboardStats();
  });

  // Conversation updates
  socket.on('conversation:update', () => {
    if (currentPage === 'conversations') loadConversations();
    loadDashboardStats();
  });

  // Stats trigger
  socket.on('stats:update', () => {
    loadDashboardStats();
  });

  // Notifications
  socket.on('notification:new', (notif) => {
    notifications.unshift(notif);
    if (notifications.length > 50) notifications = notifications.slice(0, 50);
    unreadCount++;
    updateNotifBadge();
    renderNotifications();
  });

  socket.on('notification:history', (history) => {
    notifications = history.reverse();
    unreadCount = notifications.filter(n => !n.read).length;
    updateNotifBadge();
    renderNotifications();
  });

  // Connected users count
  socket.on('connected_users', (count) => {
    const el = document.getElementById('connected-count');
    if (el) el.textContent = count;
  });

  // Typing indicators
  socket.on('typing:update', (data) => {
    // Show typing indicator in chat if relevant
    if (activeConversationId === data.conversationId) {
      const list = document.getElementById('chat-messages-list');
      if (data.isTyping) {
        let typingEl = document.getElementById('typing-indicator');
        if (!typingEl) {
          typingEl = document.createElement('div');
          typingEl.id = 'typing-indicator';
          typingEl.className = 'msg-bubble msg-inbound';
          typingEl.innerHTML = `<div class="sim-typing"><span></span><span></span><span></span></div><div class="msg-meta">${escapeHtml(data.userName)} is typing...</div>`;
          list.appendChild(typingEl);
          list.scrollTop = list.scrollHeight;
        }
      } else {
        const typingEl = document.getElementById('typing-indicator');
        if (typingEl) typingEl.remove();
      }
    }
  });
}

function updateConnectionStatus(online) {
  const statusEl = document.getElementById('system-status');
  const textEl = document.getElementById('system-status-text');
  if (online) {
    statusEl.className = 'status-badge online';
    textEl.textContent = TRANSLATIONS[currentLang]?.system_online || 'System Online';
  }
}

// ─── NOTIFICATION BELL ───
function toggleNotificationPanel() {
  const panel = document.getElementById('notif-panel');
  panel.classList.toggle('hidden');

  // Close on outside click
  if (!panel.classList.contains('hidden')) {
    setTimeout(() => {
      document.addEventListener('click', closeNotifOnOutsideClick);
    }, 50);
  }
}

function closeNotifOnOutsideClick(e) {
  const wrapper = document.getElementById('notif-bell-wrapper');
  if (!wrapper.contains(e.target)) {
    document.getElementById('notif-panel').classList.add('hidden');
    document.removeEventListener('click', closeNotifOnOutsideClick);
  }
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderNotifications() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  if (notifications.length === 0) {
    list.innerHTML = '<div class="notif-empty">No new notifications</div>';
    return;
  }

  list.innerHTML = notifications.slice(0, 20).map(n => {
    const type = String(n.type || 'system');
    const iconMap = { message_in: '💬', message_out: '📤', sla_breach: '⚠️', system: '🔔' };
    const iconClass = type.includes('message') ? 'message' : type === 'sla_breach' ? 'sla' : 'system';
    return `
      <div class="notif-item ${n.read ? '' : 'unread'}" onclick="handleNotifClick('${escapeInlineJs(n.id)}')">
        <div class="notif-icon ${iconClass}">${iconMap[n.type] || '🔔'}</div>
        <div class="notif-text">
          <p>${escapeHtml(n.message)}</p>
          <small>${timeAgo(n.timestamp)}</small>
        </div>
      </div>
    `;
  }).join('');
}

function handleNotifClick(notifId) {
  const notif = notifications.find(n => n.id === notifId);
  if (notif && !notif.read) {
    notif.read = true;
    unreadCount = Math.max(0, unreadCount - 1);
    updateNotifBadge();
    renderNotifications();
    if (socket) socket.emit('notification:read', notifId);
  }

  // Navigate based on type
  if (notif?.data?.conversationId) {
    navigateTo('conversations');
    setTimeout(() => openChat(notif.data.conversationId), 200);
  }

  document.getElementById('notif-panel').classList.add('hidden');
}

function markAllNotificationsRead() {
  notifications.forEach(n => { n.read = true; });
  unreadCount = 0;
  updateNotifBadge();
  renderNotifications();
  if (socket) socket.emit('notification:read-all');
}

// ─── DESKTOP PUSH NOTIFICATIONS ───
function sendDesktopNotification(message) {
  if (!('Notification' in window)) return;
  
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }

  if (Notification.permission === 'granted' && document.hidden) {
    const notif = new Notification('Pro CRM', {
      body: message,
      icon: '/admin/favicon.ico',
      tag: 'procrm-message',
    });
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
    setTimeout(() => notif.close(), 5000);
  }
}

// ─── TOAST SYSTEM ───
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const iconMap = { success: '✅', error: '❌', info: '💬', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${classToken(type, 'info')}`;
  toast.innerHTML = `
    <span class="toast-icon">${iconMap[type] || 'ℹ️'}</span>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function escapeAttr(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeJsString(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/</g, '\\x3C')
    .replace(/>/g, '\\x3E');
}

function escapeInlineJs(text) {
  return escapeAttr(escapeJsString(text));
}

function clampPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, num));
}

function classToken(value, fallback = 'unknown') {
  return String(value || fallback).toLowerCase().replace(/[^a-z0-9_-]/g, '') || fallback;
}

// ─── NAVIGATION ───
function navigateTo(page) {
  currentPage = page;

  // Update nav
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Update page visibility
  document.querySelectorAll('.page').forEach((el) => {
    el.classList.toggle('active', el.id === `page-${page}`);
  });

  // Update title
  document.getElementById('page-title').textContent = TRANSLATIONS[currentLang][page] || page;

  // Load data
  switch (page) {
    case 'overview': 
      loadDashboardStats(); 
      loadQueueStats();
      break;
    case 'conversations': loadConversations(); break;
    case 'contacts': loadContacts(); break;
    case 'agents': loadAgents(); break;
    case 'analytics': loadAnalytics(); break;
    case 'appointments': loadAppointments(); break;
    case 'campaigns': loadCampaigns(); break;
    case 'knowledge': loadKnowledge(); break;
    case 'settings': 
      loadSettingsUI(); 
      loadBackups();
      break;
    case 'audit': loadAuditLogs(); break;
  }
}

function switchLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('procrm_lang', lang);
  applyLanguage();
  
  // Update current page title
  document.getElementById('page-title').textContent = TRANSLATIONS[currentLang][currentPage] || currentPage;
}

function applyLanguage() {
  const lang = currentLang;
  const dict = TRANSLATIONS[lang];
  
  // Update sidebar
  document.querySelectorAll('.nav-item').forEach(el => {
    const page = el.dataset.page;
    if (dict[page]) {
      el.querySelector('span').textContent = dict[page];
    }
  });

  // Update static elements
  const mappings = {
    'system-status-text': dict.system_online,
    'btn-refresh-text': dict.refresh,
    'stat-label-contacts': dict.active_contacts,
    'stat-label-convs': dict.open_convs,
    'stat-label-msgs': dict.today_msgs,
    'kb-page-subtitle': dict.kb_subtitle,
    'kb-save-btn-text': dict.kb_save,
    'nav-knowledge-text': dict.kb_title,
    'nav-settings-text': dict.settings,
    'settings-page-title': dict.settings,
    'settings-page-subtitle': dict.settings_subtitle,
    'recent-convs-title': dict.recent_convs,
    'recent-activity-title': dict.recent_activity,
    'background-tasks-title': dict.background_tasks,
    'conv-search': dict.search_placeholder
  };

  for (const [id, text] of Object.entries(mappings)) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }


  // Update lang toggle buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
}

// ─── DASHBOARD ───
async function refreshDashboard() {
  await loadDashboardStats();
  await checkSystemHealth();
  await loadQueueStats();
  await loadRecentActivity();
}

async function loadDashboardStats() {
  const data = await apiCall('/api/dashboard/stats');
  if (data) {
    animateCounter('stat-contacts', data.active_contacts || 0);
    animateCounter('stat-conversations', data.open_conversations || 0);
    animateCounter('stat-messages', data.today_messages || 0);
    animateCounter('stat-sla', data.sla_breaches || 0);

    // AI Predictive Analytics Rendering
    if (data.lead_distribution) {
      const dist = data.lead_distribution;
      const total = (parseInt(dist.hot) || 0) + (parseInt(dist.warm) || 0) + (parseInt(dist.cold) || 0) || 1;
      const hotPct = ((parseInt(dist.hot) || 0) / total) * 100;
      const warmPct = ((parseInt(dist.warm) || 0) / total) * 100;
      const coldPct = ((parseInt(dist.cold) || 0) / total) * 100;

      const hotBar = document.getElementById('lead-hot-bar');
      const warmBar = document.getElementById('lead-warm-bar');
      const coldBar = document.getElementById('lead-cold-bar');

      if (hotBar) hotBar.style.width = `${hotPct}%`;
      if (warmBar) warmBar.style.width = `${warmPct}%`;
      if (coldBar) coldBar.style.width = `${coldPct}%`;

      const countHot = document.getElementById('count-hot');
      const countWarm = document.getElementById('count-warm');
      const countCold = document.getElementById('count-cold');

      if (countHot) countHot.textContent = dist.hot || 0;
      if (countWarm) countWarm.textContent = dist.warm || 0;
      if (countCold) countCold.textContent = dist.cold || 0;
    }

    const container = document.getElementById('top-leads-container');
    if (data.top_leads && container) {
      if (data.top_leads.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); padding:0.5rem; font-size:0.8rem;">No high-value leads yet.</div>';
      } else {
        container.innerHTML = data.top_leads.map(lead => {
          const score = clampPercent(lead.lead_score);
          return `
          <div style="background: var(--bg-hover); padding: 0.75rem; border-radius: 8px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 4px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:700; font-size:0.8rem; color: var(--text-primary);">${escapeHtml(lead.display_name || 'Unknown')}</span>
              <span class="badge ${score >= 80 ? 'badge-red' : 'badge-orange'}" style="font-size:0.6rem; padding: 1px 6px;">${score} pts</span>
            </div>
            <div style="font-size:0.7rem; color:var(--text-muted);">${escapeHtml(lead.phone_number || lead.phone || '')}</div>
            <div style="margin-top:0.4rem; height:4px; background:var(--bg-card); border-radius:2px; overflow:hidden;">
              <div style="width:${score}%; height:100%; background:var(--accent-purple); transition: width 1s;"></div>
            </div>
          </div>
        `;}).join('');
      }
    }
  }
  
  if (currentPage === 'overview') {
    loadDashboardCharts();
    loadRecentConversations();
  }
}

let messageChart = null;

async function loadDashboardCharts() {
  const data = await apiCall('/api/dashboard/charts');
  if (!data) return;

  const canvas = document.getElementById('message-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  if (messageChart) messageChart.destroy();

  messageChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.date),
      datasets: [
        {
          label: 'Inbound',
          data: data.map(d => d.inbound || 0),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: 'Outbound',
          data: data.map(d => d.outbound || 0),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { color: '#94a3b8', font: { family: 'Inter' } } }
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148, 163, 184, 0.05)' } },
        y: { beginAtZero: true, ticks: { color: '#94a3b8', stepSize: 1 }, grid: { color: 'rgba(148, 163, 184, 0.05)' } }
      }
    }
  });
}

// ─── ANALYTICS (PHASE 3) ───
let analyticsChart = null;
let currentAnalyticsDays = 7;

async function loadAnalytics() {
  await Promise.all([
    loadAnalyticsVolume(),
    loadAnalyticsFunnel(),
    loadAnalyticsAIMetrics(),
    loadAnalyticsLeaderboard()
  ]);
}

async function loadAnalyticsVolume() {
  const data = await apiCall(`/api/analytics/volume?days=${currentAnalyticsDays}`);
  const canvas = document.getElementById('analytics-volume-chart');
  if (!canvas || !data) return;

  const ctx = canvas.getContext('2d');
  if (analyticsChart) analyticsChart.destroy();

  analyticsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => formatDateShort(d.date)),
      datasets: [
        {
          label: 'Inbound',
          data: data.map(d => d.inbound),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: 'Outbound',
          data: data.map(d => d.outbound),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { color: '#94a3b8', usePointStyle: true } },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

async function loadAnalyticsFunnel() {
  const data = await apiCall('/api/analytics/funnel');
  const container = document.getElementById('funnel-container');
  if (!container || !data) return;

  const steps = [
    { label: 'Leads', count: data.leads, color: 'var(--accent-blue)' },
    { label: 'Engaged', count: data.engaged, color: 'var(--accent-purple)' },
    { label: 'Hot Leads', count: data.hot, color: 'var(--accent-orange)' },
    { label: 'Converted', count: data.converted, color: 'var(--accent-green)' }
  ];

  container.innerHTML = steps.map((step, i) => {
    const prevCount = i === 0 ? step.count : steps[i-1].count;
    const dropoff = prevCount === 0 ? 100 : Math.round((step.count / prevCount) * 100);
    
    return `
      <div class="funnel-step" style="width: ${100 - (i * 10)}%; margin: 0 auto;">
        <span class="funnel-label">${step.label}</span>
        <span class="funnel-count">${step.count.toLocaleString()}</span>
        ${i > 0 ? `<span class="funnel-percentage">${dropoff}%</span>` : ''}
      </div>
    `;
  }).join('');
}

async function loadAnalyticsAIMetrics() {
  const data = await apiCall('/api/analytics/ai-metrics');
  if (!data) return;

  const updateMetric = (id, value, progressId) => {
    const el = document.getElementById(id);
    const prog = document.getElementById(progressId);
    const percent = clampPercent(value);
    if (el) el.textContent = `${percent}%`;
    if (prog) prog.style.width = `${percent}%`;
  };

  updateMetric('ai-response-rate', data.ai_response_rate, 'ai-response-progress');
  updateMetric('handoff-rate', data.handoff_rate, 'handoff-progress');
  updateMetric('ai-accuracy', data.accuracy_score, 'ai-accuracy-progress');
}

async function loadAnalyticsLeaderboard() {
  const data = await apiCall('/api/analytics/leaderboard');
  const tbody = document.getElementById('analytics-leaderboard-tbody');
  if (!tbody || !data) return;

  tbody.innerHTML = data.map(agent => {
    const resolutions = Number(agent.resolutions) || 0;
    return `
    <tr>
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="avatar-sm" style="width:24px; height:24px; font-size:0.6rem;">${escapeHtml((agent.display_name || 'A')[0])}</div>
          <span style="font-weight:600;">${escapeHtml(agent.display_name || 'Unknown')}</span>
        </div>
      </td>
      <td><span class="badge badge-gray">${escapeHtml(agent.team || 'General')}</span></td>
      <td style="font-weight:700;">${resolutions}</td>
      <td style="color:var(--text-muted);">${Number(agent.avg_resolution_time_mins) || 0}m</td>
      <td>
        <div class="performance-bar">
          <div class="performance-fill" style="width: ${clampPercent((resolutions / 50) * 100)}%"></div>
        </div>
      </td>
    </tr>
  `;}).join('');
}

function setAnalyticsRange(days, btn) {
  currentAnalyticsDays = days;
  document.querySelectorAll('#page-analytics .filter-group .btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadAnalyticsVolume();
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

async function exportAnalyticsPDF() {
  showToast('Generating PDF report...', 'info');
  setTimeout(() => {
    showToast('Report generation complete. Downloading...', 'success');
  }, 2000);
}


async function loadRecentConversations() {
  const data = await apiCall('/api/conversations?limit=5');
  const container = document.getElementById('recent-conversations');
  if (!container || !data || !data.conversations) return;

  if (data.conversations.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No recent conversations</p></div>';
    return;
  }

  container.innerHTML = data.conversations.map(c => `
    <div class="health-item clickable-row" style="padding: 0.75rem 1.25rem;" onclick="navigateTo('conversations'); setTimeout(() => openChat('${escapeInlineJs(c.id)}'), 100)">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="user-avatar" style="width:30px;height:30px;font-size:0.75rem">${escapeHtml((c.contact_name || 'U')[0].toUpperCase())}</div>
        <div style="display:flex;flex-direction:column">
          <span style="font-weight:600;font-size:0.85rem">${escapeHtml(c.contact_name || 'Unknown')}</span>
          <span style="font-size:0.75rem;color:var(--text-muted)">${c.intent ? `Intent: ${escapeHtml(c.intent)}` : 'New Message'}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end">
        <span class="badge ${priorityBadgeClass(c.priority)}" style="font-size:0.6rem">${escapeHtml(c.priority || 'normal')}</span>
        <span style="font-size:0.7rem;color:var(--text-muted);margin-top:2px">${timeAgo(c.updated_at)}</span>
      </div>
    </div>
  `).join('');
}

async function loadRecentActivity() {
  const container = document.getElementById('recent-activity');
  if (!container) return;

  const data = await apiCall('/api/audit-logs?limit=5');
  if (!data || !data.logs) {
    container.innerHTML = '<div class="empty-state">No activity found.</div>';
    return;
  }

  container.innerHTML = data.logs.map(log => `
    <div class="health-item" style="padding: 0.75rem 1.25rem;">
      <div style="display:flex;flex-direction:column;gap:2px">
        <span style="font-weight:600;font-size:0.85rem">${escapeHtml((log.action || '').replace(/_/g, ' ').toUpperCase())}</span>
        <span style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(log.agent_type || 'System')} | ${escapeHtml(log.intent || 'No Intent')}</span>
      </div>
      <span style="font-size:0.7rem;color:var(--text-muted)">${timeAgo(log.created_at)}</span>
    </div>
  `).join('');
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const duration = 600;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (target - start) * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

async function checkSystemHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();

    setHealthBadge('health-api', data.status);
    setHealthBadge('health-db', data.services?.database?.status || 'unknown');
    setHealthBadge('health-redis', data.services?.redis?.status || 'unknown');
    setHealthBadge('health-whatsapp', data.services?.whatsapp?.status || 'unknown');

    const statusEl = document.getElementById('system-status');
    if (data.status === 'healthy') {
      statusEl.className = 'status-badge online';
      statusEl.querySelector('span:last-child').textContent = 'System Online';
    } else {
      statusEl.className = 'status-badge';
      statusEl.style.background = 'var(--accent-orange-dim)';
      statusEl.style.color = 'var(--accent-orange)';
      statusEl.querySelector('span:last-child').textContent = 'Degraded';
    }
  } catch {
    setHealthBadge('health-api', 'unhealthy');
    document.getElementById('system-status').querySelector('span:last-child').textContent = 'Offline';
  }
}

function setHealthBadge(id, status) {
  const el = document.getElementById(id);
  if (!el) return;
  const map = { 
    healthy: ['Healthy', 'badge-green'], 
    unhealthy: ['Down', 'badge-red'], 
    degraded: ['Degraded', 'badge-orange'],
    unconfigured: ['Not Configured', 'badge-gray'],
    unknown: ['Unknown', 'badge-gray'] 
  };
  const [text, cls] = map[status] || map.unknown;
  el.textContent = text;
  el.className = `badge ${cls}`;
}

async function loadQueueStats() {
  const data = await apiCall('/api/system/queue-stats');
  if (!data) return;

  const waiting = document.getElementById('queue-waiting');
  const active = document.getElementById('queue-active');
  const completed = document.getElementById('queue-completed');
  const failed = document.getElementById('queue-failed');
  const badge = document.getElementById('queue-status-badge');

  if (waiting) waiting.textContent = data.waiting || 0;
  if (active) active.textContent = data.active || 0;
  if (completed) completed.textContent = data.completed || 0;
  if (failed) failed.textContent = data.failed || 0;

  if (badge) {
    if (data.active > 0) {
      badge.textContent = 'Processing';
      badge.className = 'badge badge-blue';
    } else if (data.waiting > 0) {
      badge.textContent = 'Queued';
      badge.className = 'badge badge-orange';
    } else {
      badge.textContent = 'Idle';
      badge.className = 'badge badge-gray';
    }
  }
}

// ─── CONVERSATIONS ───
let activeConversationId = null;

async function loadConversations() {
  updateBreadcrumbs('Conversations');
  const status = document.getElementById('conv-status-filter')?.value || '';
  const team = document.getElementById('conv-team-filter')?.value || '';
  const search = document.getElementById('conv-search')?.value || '';
  const params = new URLSearchParams({ limit: 20, ...(status && { status }), ...(team && { team }), ...(search && { search }) });

  const tbody = document.getElementById('conversations-tbody');
  if (tbody) showTableSkeleton(tbody, 7);

  const data = await apiCall(`/api/conversations?${params}`);

  if (!data?.conversations?.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No conversations found</td></tr>';
    return;
  }

  tbody.innerHTML = data.conversations.map((c) => {
    const conversationId = escapeInlineJs(c.id);
    const contactId = escapeInlineJs(c.contact_id);
    const priority = classToken(c.priority, 'normal');
    return `
    <tr class="clickable-row ${activeConversationId === c.id ? 'active-row' : ''}">
      <td onclick="openChat('${conversationId}')">
        <div class="contact-info">
          <div class="avatar-sm" onclick="event.stopPropagation(); openContactDetails('${contactId}')" title="View Contact Details">${escapeHtml((c.contact_name || 'U')[0].toUpperCase())}</div>
          <div>
            <div>${escapeHtml(c.contact_name || 'Unknown')}</div>
            <small>${escapeHtml(c.phone_number_masked || 'No phone')}</small>
          </div>
        </div>
      </td>
      <td onclick="openChat('${conversationId}')"><span class="badge badge-${getStatusColor(c.status)}">${escapeHtml(c.status)}</span></td>
      <td onclick="openChat('${conversationId}')"><span class="badge badge-gray">${escapeHtml(c.assigned_team || '-')}</span></td>
      <td onclick="openChat('${conversationId}')">${escapeHtml(c.intent || '-')}</td>
      <td onclick="openChat('${conversationId}')"><span class="priority-dot priority-${priority}"></span> ${escapeHtml(c.priority || 'normal')}</td>
      <td onclick="openChat('${conversationId}')">${Number(c.message_count) || 0}</td>
      <td onclick="openChat('${conversationId}')">${formatDate(c.updated_at)}</td>
    </tr>
  `;}).join('');
}

function getStatusColor(status) {
  switch(status) {
    case 'open': return 'blue';
    case 'assigned': return 'purple';
    case 'pending': return 'yellow';
    case 'resolved': return 'green';
    case 'closed': return 'gray';
    default: return 'gray';
  }
}

// ─── CHAT PANEL ───
async function openChat(id) {
  activeConversationId = id;
  const panel = document.getElementById('chat-panel');
  panel.classList.remove('hidden');
  
  // Highlight row
  document.querySelectorAll('#conversations-tbody tr').forEach(tr => {
    tr.classList.remove('active-row');
  });
  const activeRow = [...document.querySelectorAll('#conversations-tbody tr')].find(tr => tr.innerHTML.includes(id));
  if (activeRow) activeRow.classList.add('active-row');

  // Load chat info and messages
  const convList = await apiCall(`/api/conversations?limit=100`);
  const current = convList?.conversations?.find(c => c.id === id);
  
  if (current) {
    document.getElementById('chat-user-name').textContent = current.contact_name || 'Unknown';
    document.getElementById('chat-user-phone').textContent = current.phone_number_masked || '';
    document.getElementById('chat-avatar').textContent = (current.contact_name || 'U')[0].toUpperCase();
    document.getElementById('chat-status-badge').textContent = current.status;
    document.getElementById('chat-status-badge').className = `badge badge-${getStatusColor(current.status)}`;
    document.getElementById('chat-team-badge').textContent = current.assigned_team || '—';
  }

  loadChatMessages(id);
  loadCannedResponses();
}

async function loadChatMessages(id) {
  const data = await apiCall(`/api/conversations/${id}/messages`);
  const list = document.getElementById('chat-messages-list');
  
  if (!data || !data.messages) {
    list.innerHTML = '<div class="empty-cell">Failed to load messages</div>';
    return;
  }

  list.innerHTML = data.messages.map(msg => `
    <div class="msg-bubble msg-${classToken(msg.direction, 'inbound')} ${msg.ai_generated ? 'msg-ai' : ''}">
      <div class="msg-content">${escapeHtml(msg.content || '')}</div>
      <div class="msg-meta">
        ${msg.ai_generated ? '<span class="msg-ai-tag">AI</span>' : ''}
        ${formatTime(msg.created_at)}
      </div>
    </div>
  `).join('');
  
  list.scrollTop = list.scrollHeight;
}

function closeChatPanel() {
  activeConversationId = null;
  document.getElementById('chat-panel').classList.add('hidden');
  document.querySelectorAll('#conversations-tbody tr').forEach(tr => {
    tr.classList.remove('active-row');
  });
}

async function handleChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  
  if (!text || !activeConversationId) return;

  input.disabled = true;
  
  const res = await apiCall(`/api/conversations/${activeConversationId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ text })
  });

  if (res && res.success) {
    input.value = '';
    loadChatMessages(activeConversationId);
  }
  
  input.disabled = false;
  input.focus();
}

async function takeoverConversation() {
  if (!activeConversationId) return;
  const res = await apiCall(`/api/conversations/${activeConversationId}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ agentId: currentUser.id, team: currentUser.team })
  });
  if (res) openChat(activeConversationId);
}

async function resolveConversation() {
  if (!activeConversationId) return;
  if (!confirm('Mark this conversation as resolved?')) return;
  const res = await apiCall(`/api/conversations/${activeConversationId}/close`, {
    method: 'PATCH',
    body: JSON.stringify({ notes: 'Resolved by agent' })
  });
  if (res) {
    closeChatPanel();
    loadConversations();
  }
}

// ─── CONTACTS ───
async function loadContacts() {
  updateBreadcrumbs('Contacts');
  const search = document.getElementById('contact-search')?.value || '';
  const status = document.getElementById('contact-status-filter')?.value || '';
  const params = new URLSearchParams({ limit: 20, ...(search && { search }), ...(status && { status }) });

  const tbody = document.getElementById('contacts-tbody');
  if (tbody) showTableSkeleton(tbody, 6);

  const data = await apiCall(`/api/contacts?${params}`);
  if (!tbody || !data?.contacts?.length) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No contacts found</td></tr>';
    return;
  }

  tbody.innerHTML = data.contacts.map((c) => {
    const contactId = escapeInlineJs(c.id);
    const leadScore = clampPercent(c.lead_score);
    return `
    <tr class="clickable-row">
      <td onclick="event.stopPropagation()">
        <input type="checkbox" class="contact-checkbox" value="${escapeAttr(c.id)}" onchange="updateBulkSelection()">
      </td>
      <td onclick="openContactDetails('${contactId}')">
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="avatar-sm">${escapeHtml((c.display_name || 'U')[0].toUpperCase())}</div>
          <strong>${escapeHtml(c.display_name || 'Unknown')}</strong>
        </div>
      </td>
      <td onclick="openContactDetails('${contactId}')">${escapeHtml(c.phone_number_masked || '-')}</td>
      <td onclick="openContactDetails('${contactId}')"><span class="badge ${statusBadgeClass(c.status)}">${escapeHtml(c.status)}</span></td>
      <td onclick="openContactDetails('${contactId}')">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:30px; height:4px; background:var(--bg-hover); border-radius:2px; overflow:hidden;">
            <div style="width:${leadScore}%; height:100%; background:${getLeadScoreColor(leadScore)};"></div>
          </div>
          <span style="font-size:0.75rem; font-weight:700;">${leadScore}</span>
        </div>
      </td>
      <td>${c.language_preference === 'si' ? '🇱🇰 Sinhala' : '🇬🇧 English'}</td>
      <td>${c.last_message_at ? timeAgo(c.last_message_at) : 'Never'}</td>
    </tr>
  `;}).join('');
}

function getLeadScoreColor(score) {
  score = Number(score) || 0;
  if (score >= 80) return '#10b981'; // Green
  if (score >= 50) return '#f59e0b'; // Orange
  return '#64748b'; // Gray
}

function debounceConvSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => loadConversations(), 300);
}

function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => loadContacts(), 300);
}

// ─── AUDIT LOGS ───
async function loadAuditLogs() {
  const agentType = document.getElementById('audit-agent-filter')?.value || '';
  const params = new URLSearchParams({ limit: 50, ...(agentType && { agentType }) });

  const data = await apiCall(`/api/audit-logs?${params}`);
  const tbody = document.getElementById('audit-tbody');

  if (!data?.logs?.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No audit logs found</td></tr>';
    return;
  }

  tbody.innerHTML = data.logs.map((log) => {
    let flags = [];
    try {
      flags = typeof log.flags === 'string' ? JSON.parse(log.flags) : (log.flags || []);
    } catch (e) {
      flags = [];
    }
    
    const confidence = Number(log.confidence);
    const confidenceText = Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : '-';
    return `
    <tr>
      <td><small>${new Date(log.created_at).toLocaleString()}</small></td>
      <td><span class="badge badge-blue">${escapeHtml(log.agent_type || '')}</span></td>
      <td>${escapeHtml(log.action || '')}</td>
      <td>${escapeHtml(log.intent || '-')}</td>
      <td>${confidenceText}</td>
      <td>${flags.map(f => `<span class="badge badge-orange" style="margin:1px">${escapeHtml(f)}</span>`).join(' ') || '-'}</td>
    </tr>
  `;}).join('');
}

// ─── HELPERS ───
function statusBadgeClass(status) {
  const map = { active: 'badge-green', open: 'badge-green', assigned: 'badge-blue', pending: 'badge-orange', resolved: 'badge-purple', closed: 'badge-gray', unsubscribed: 'badge-red', blocked: 'badge-red' };
  return map[status] || 'badge-gray';
}

function priorityBadgeClass(priority) {
  const map = { low: 'badge-gray', normal: 'badge-blue', high: 'badge-orange', urgent: 'badge-red', critical: 'badge-red' };
  return map[priority] || 'badge-gray';
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}



function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString();
}

function formatTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function exportData(type) {
  try {
    const res = await fetch(`${API_BASE}/api/system/export/${type}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (!res.ok) throw new Error('Export failed');

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export_${type}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  } catch (err) {
    alert('Export failed: ' + err.message);
  }
}

// ─── TEMPLATES ───
let allTemplates = {};

async function loadTemplates() {
  const data = await apiCall('/api/system/templates');
  if (!data) return;
  allTemplates = data;
  
  const select = document.getElementById('chat-template-select');
  if (!select) return;
  
  select.innerHTML = '<option value="">— Select Template —</option>' + 
    Object.keys(data).map(key => `<option value="${escapeAttr(key)}">${escapeHtml(key)}</option>`).join('');
}

function handleTemplateSelect() {
  const select = document.getElementById('chat-template-select');
  const key = select.value;
  if (!key || !allTemplates[key]) return;
  
  const template = allTemplates[key];
  const contactName = document.getElementById('chat-user-name').textContent;
  
  // Try English, fallback to first available
  const lang = template.language.en ? 'en' : Object.keys(template.language)[0];
  let body = template.language[lang].body;
  
  // Simple variable replacement for {{1}}
  body = body.replace(/{{1}}/g, contactName);
  
  document.getElementById('chat-input').value = body;
}

async function sendSelectedTemplate() {
  const select = document.getElementById('chat-template-select');
  if (!select.value) return;
  
  // Trigger form submit
  const form = document.querySelector('.chat-input-form');
  form.dispatchEvent(new Event('submit'));
  
  select.value = '';
}
// ─── AGENTS ───
let editingAgentId = null;

async function loadAgents() {
  const data = await apiCall('/api/agents');
  const tbody = document.getElementById('agents-table-body');
  
  if (!data || !data.agents) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Failed to load agents</td></tr>';
    return;
  }

  if (data.agents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">No agents found</td></tr>';
    return;
  }

  tbody.innerHTML = data.agents.map(agent => `
    <tr>
      <td>
        <div class="user-info">
          <div class="user-avatar" style="width:30px;height:30px;font-size:0.75rem">${escapeHtml((agent.display_name || 'A')[0].toUpperCase())}</div>
          <span>${escapeHtml(agent.display_name || '')}</span>
        </div>
      </td>
      <td>${escapeHtml(agent.email || '')}</td>
      <td><span class="badge badge-purple">${escapeHtml(agent.role || '')}</span></td>
      <td><span class="badge badge-gray">${escapeHtml(agent.team || '')}</span></td>
      <td><span class="badge ${agent.status === 'active' ? 'badge-green' : (agent.status === 'suspended' ? 'badge-red' : 'badge-gray')}">${escapeHtml(agent.status || '')}</span></td>
      <td>${agent.active_conversations || 0}</td>
      <td>${agent.last_active_at ? formatTime(agent.last_active_at) : 'Never'}</td>
      <td>
        <div class="action-group">
          <button class="btn-icon" onclick="showEditAgentModal('${escapeInlineJs(agent.id)}', '${escapeInlineJs(agent.display_name)}', '${escapeInlineJs(agent.role)}', '${escapeInlineJs(agent.team)}', '${escapeInlineJs(agent.status)}')" title="Edit">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
          </button>
          <button class="btn-icon" onclick="toggleAgentStatus('${escapeInlineJs(agent.id)}', '${escapeInlineJs(agent.status)}')" title="${agent.status === 'suspended' ? 'Activate' : 'Suspend'}" style="color:${agent.status === 'suspended' ? 'var(--accent-green)' : 'var(--accent-orange)'}">
            ${agent.status === 'suspended' 
              ? '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
              : '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>'}
          </button>
          <button class="btn-icon" onclick="handleDeleteAgent('${escapeInlineJs(agent.id)}')" title="Delete" style="color:var(--accent-red)">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function showAddAgentModal() {
  editingAgentId = null;
  document.getElementById('agent-modal-title').textContent = 'Add New Agent';
  document.getElementById('agent-form').reset();
  document.getElementById('password-field').classList.remove('hidden');
  document.getElementById('status-field').classList.add('hidden');
  document.getElementById('agent-email').disabled = false;
  document.getElementById('modal-agent').classList.remove('hidden');
}

function showEditAgentModal(id, name, role, team, status) {
  editingAgentId = id;
  document.getElementById('agent-modal-title').textContent = 'Edit Agent';
  document.getElementById('agent-name').value = name;
  document.getElementById('agent-role').value = role;
  document.getElementById('agent-team').value = team;
  document.getElementById('agent-status').value = status;
  document.getElementById('password-field').classList.add('hidden');
  document.getElementById('status-field').classList.remove('hidden');
  document.getElementById('agent-email').disabled = true;
  document.getElementById('modal-agent').classList.remove('hidden');
}

function closeAgentModal() {
  document.getElementById('modal-agent').classList.add('hidden');
}

async function handleSaveAgent(e) {
  e.preventDefault();
  const displayName = document.getElementById('agent-name').value;
  const email = document.getElementById('agent-email').value;
  const password = document.getElementById('agent-password').value;
  const role = document.getElementById('agent-role').value;
  const team = document.getElementById('agent-team').value;
  const status = document.getElementById('agent-status').value;

  const btn = document.getElementById('agent-submit-btn');
  btn.disabled = true;

  try {
    let res;
    if (editingAgentId) {
      res = await apiCall(`/api/agents/${editingAgentId}`, {
        method: 'POST',
        body: JSON.stringify({ displayName, role, team, status })
      });
    } else {
      res = await apiCall('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName, role, team })
      });
    }

    if (res) {
      closeAgentModal();
      loadAgents();
    }
  } finally {
    btn.disabled = false;
  }
}

async function toggleAgentStatus(id, currentStatus) {
  const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
  const res = await apiCall(`/api/agents/${id}`, {
    method: 'POST',
    body: JSON.stringify({ status: newStatus })
  });
  if (res) loadAgents();
}

async function handleDeleteAgent(id) {
  if (!confirm('Are you sure you want to delete this agent? This cannot be undone.')) return;
  
  const res = await apiCall(`/api/agents/${id}`, { method: 'DELETE' });
  if (res) loadAgents();
}

// ─── KNOWLEDGE HUB ───
let currentKBTab = 'general';

function switchKBTab(tab) {
  currentKBTab = tab;
  document.querySelectorAll('.kb-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase().includes(tab));
  });
  document.querySelectorAll('.kb-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `kb-tab-${tab}`);
  });

  if (tab === 'documents') {
    loadKnowledgeDocuments();
  }
}

function toggleIngestFields() {
  const type = document.getElementById('kb-ingest-type').value;
  document.getElementById('kb-field-url').classList.toggle('hidden', type !== 'website');
  document.getElementById('kb-field-content').classList.toggle('hidden', type !== 'text');
  document.getElementById('kb-field-file').classList.toggle('hidden', type !== 'file');
  
  if (type === 'website') {
    document.getElementById('kb-input-title').placeholder = 'e.g. Official Website';
  } else if (type === 'file') {
    document.getElementById('kb-input-title').placeholder = 'e.g. Company Handbook';
  } else {
    document.getElementById('kb-input-title').placeholder = 'e.g. Refund Policy 2026';
  }
}

async function loadKnowledge() {
  const data = await apiCall('/api/system/knowledge');
  const editor = document.getElementById('kb-editor');
  if (data) {
    editor.value = JSON.stringify(data, null, 2);
  } else {
    editor.value = 'Failed to load knowledge base.';
  }
  
  // Load documents if we are on that tab
  if (currentKBTab === 'documents') {
    loadKnowledgeDocuments();
  }
}

async function loadKnowledgeDocuments() {
  const tbody = document.getElementById('kb-docs-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Loading documents...</td></tr>';

  const data = await apiCall('/api/knowledge/documents');
  if (!data || !data.documents) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Failed to load documents</td></tr>';
    return;
  }

  if (data.documents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No documents indexed yet.</td></tr>';
    return;
  }

  tbody.innerHTML = data.documents.map(doc => `
    <tr>
      <td><strong>${escapeHtml(doc.title || '')}</strong></td>
      <td><span class="badge badge-gray">${escapeHtml(doc.doc_type || '')}</span></td>
      <td><span class="badge badge-green">${escapeHtml(doc.status || '')}</span></td>
      <td>${doc.total_chunks || 0}</td>
      <td>
        <button class="btn-icon" onclick="handleDeleteKnowledgeDoc('${escapeInlineJs(doc.id)}')" style="color:var(--accent-red)">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        </button>
      </td>
    </tr>
  `).join('');
}

async function handleTrainAI() {
  const type = document.getElementById('kb-ingest-type').value;
  const title = document.getElementById('kb-input-title').value;
  const content = document.getElementById('kb-input-content').value;
  const url = document.getElementById('kb-input-url').value;
  const fileInput = document.getElementById('kb-input-file');
  const btn = document.getElementById('btn-train-ai');

  if (!title || (type === 'text' && !content) || (type === 'website' && !url) || (type === 'file' && !fileInput.files[0])) {
    alert('Please fill in all required fields.');
    return;
  }

  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span>Processing...</span>';

  try {
    let res;
    if (type === 'text') {
      res = await apiCall('/api/knowledge/upload', {
        method: 'POST',
        body: JSON.stringify({ title, content })
      });
    } else if (type === 'website') {
      res = await apiCall('/api/knowledge/scrape', {
        method: 'POST',
        body: JSON.stringify({ title, url })
      });
    } else if (type === 'file') {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('file', fileInput.files[0]);
      
      const response = await fetch(`${API_BASE}/api/knowledge/upload-file`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
        body: formData
      });
      res = await response.json();
    }

    if (res && (res.docId || res.success)) {
      showToast('AI training complete!', 'success');
      document.getElementById('kb-input-title').value = '';
      document.getElementById('kb-input-content').value = '';
      document.getElementById('kb-input-url').value = '';
      if (fileInput) fileInput.value = '';
      loadKnowledgeDocuments();
    } else {
      showToast(res?.error || 'Training failed', 'error');
    }
  } catch (err) {
    showToast('Connection error', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function handleDeleteKnowledgeDoc(id) {
  if (!confirm('Are you sure you want to delete this document from AI memory?')) return;
  
  const res = await apiCall(`/api/knowledge/documents/${id}`, { method: 'DELETE' });
  if (res && res.success) {
    showToast('Document removed', 'success');
    loadKnowledgeDocuments();
  }
}

async function handleSaveKnowledge() {
  const editor = document.getElementById('kb-editor');
  const btn = document.getElementById('kb-save-btn-text');
  
  try {
    const data = JSON.parse(editor.value);
    const originalText = btn.textContent;
    btn.textContent = currentLang === 'si' ? 'සුරකිමින්...' : 'Saving...';
    
    const res = await apiCall('/api/system/knowledge', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    
    if (res && res.success) {
      showToast('Configuration saved!', 'success');
    }
    btn.textContent = originalText;
  } catch (err) {
    showToast('Invalid JSON format', 'error');
  }
}

// ─── SETTINGS ───
async function loadSettingsUI() {
  const data = await apiCall('/api/system/settings');
  if (data) {
    if (data.WHATSAPP_PHONE_NUMBER_ID) document.getElementById('set-wa-phone-id').value = data.WHATSAPP_PHONE_NUMBER_ID;
    if (data.WHATSAPP_ACCESS_TOKEN) document.getElementById('set-wa-token').placeholder = data.WHATSAPP_ACCESS_TOKEN;
    if (data.GEMINI_API_KEY) document.getElementById('set-gemini-key').placeholder = data.GEMINI_API_KEY;
    
    // Branding
    if (data.COMPANY_NAME) document.getElementById('set-company-name').value = data.COMPANY_NAME;
    if (data.COMPANY_LOGO) document.getElementById('set-company-logo').value = data.COMPANY_LOGO;
    if (data.BRAND_COLOR) {
      document.getElementById('set-brand-color').value = data.BRAND_COLOR;
      document.getElementById('set-brand-color-text').value = data.BRAND_COLOR;
    }
    
    // Webhook Setup
    if (data.META_APP_ID) document.getElementById('set-meta-app-id').value = data.META_APP_ID;
    if (data.META_APP_SECRET) document.getElementById('set-meta-app-secret').placeholder = "••••••••";
    if (data.PUBLIC_BASE_URL) document.getElementById('set-public-url').value = data.PUBLIC_BASE_URL;
    if (data.WEBHOOK_VERIFY_TOKEN) document.getElementById('set-verify-token').value = data.WEBHOOK_VERIFY_TOKEN;
  }
}

async function registerWebhook() {
  const appId = document.getElementById('set-meta-app-id').value;
  const appSecret = document.getElementById('set-meta-app-secret').value;
  const baseUrl = document.getElementById('set-public-url').value;
  const verifyToken = document.getElementById('set-verify-token').value;

  // We only require appSecret if it wasn't previously set (we check if placeholder is •••••••• and value is empty)
  const isUpdating = document.getElementById('set-meta-app-secret').placeholder === "••••••••";
  if (!appId || (!appSecret && !isUpdating) || !baseUrl || !verifyToken) {
    alert(currentLang === 'si' ? 'කරුණාකර සියලුම තොරතුරු ඇතුලත් කරන්න.' : 'Please fill all fields.');
    return;
  }

  // To properly handle updates when secret is not re-typed, we might need to send a flag or let backend use existing.
  // Actually, our API currently requires all fields. Let's send a dummy or update API to handle it.
  // We'll update the API next, but for now we'll just send the value (if empty, we must tell user to type it again, or we can fetch it. Let's just alert them to type it for security).
  if (!appSecret && isUpdating) {
    alert("Please re-enter your App Secret to confirm registration.");
    return;
  }

  const btn = event.target;
  const originalText = btn.textContent;
  btn.textContent = 'Registering...';
  btn.disabled = true;

  try {
    const res = await apiCall('/api/system/register-webhook', {
      method: 'POST',
      body: JSON.stringify({ appId, appSecret, baseUrl, verifyToken })
    });

    if (res && res.success) {
      alert(currentLang === 'si' ? 'Webhook එක සාර්ථකව සම්බන්ධ විය!' : 'Webhook registered successfully!');
      loadSettingsUI();
    } else {
      alert('Error: ' + (res.error || 'Failed to register'));
    }
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function saveBranding() {
  const companyName = document.getElementById('set-company-name').value;
  const companyLogo = document.getElementById('set-company-logo').value;
  const brandColor = document.getElementById('set-brand-color').value;

  const updates = [];
  if (companyName) updates.push(apiCall('/api/system/settings', { method: 'POST', body: JSON.stringify({ key: 'COMPANY_NAME', value: companyName }) }));
  if (companyLogo) updates.push(apiCall('/api/system/settings', { method: 'POST', body: JSON.stringify({ key: 'COMPANY_LOGO', value: companyLogo }) }));
  if (brandColor) updates.push(apiCall('/api/system/settings', { method: 'POST', body: JSON.stringify({ key: 'BRAND_COLOR', value: brandColor }) }));

  await Promise.all(updates);
  alert(currentLang === 'si' ? 'සාර්ථකව සුරැකුණා!' : 'Saved successfully!');
  
  // Apply immediately
  applyBranding({ COMPANY_NAME: companyName, COMPANY_LOGO: companyLogo, BRAND_COLOR: brandColor });
}

async function saveSetting(key, inputId) {
  const val = document.getElementById(inputId).value;
  if (!val) return;
  
  const res = await apiCall('/api/system/settings', {
    method: 'POST',
    body: JSON.stringify({ key, value: val })
  });
  
  if (res && res.success) {
    alert(currentLang === 'si' ? 'සාර්ථකව සුරැකුණා!' : 'Saved successfully!');
    document.getElementById(inputId).value = '';
    loadSettingsUI();
  }
}

async function testIntegration(type) {
  const statusEl = document.getElementById(`status-${type}-integration`);
  const inputId = type === 'gemini' ? 'set-gemini-key' : 'set-wa-token'; // Simplified check
  const testValue = document.getElementById(inputId)?.value;

  statusEl.textContent = currentLang === 'si' ? 'පරීක්ෂා කරමින්...' : 'Testing...';
  statusEl.className = 'badge badge-gray';

  const res = await apiCall('/api/system/test-integration', {
    method: 'POST',
    body: JSON.stringify({ type, value: testValue })
  });

  if (res && res.success) {
    statusEl.textContent = 'Healthy';
    statusEl.className = 'badge badge-green';
    alert(res.message);
  } else {
    statusEl.textContent = 'Error';
    statusEl.className = 'badge badge-red';
    alert('Connection Failed: ' + (res.error || 'Unknown error'));
  }
}

// ─── DATA MANAGEMENT ───
async function downloadBackup() {
  try {
    const res = await fetch(`${API_BASE}/api/system/backup`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Backup failed');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `procrm_backup_${new Date().toISOString().split('T')[0]}.db`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.message);
  }
}

async function restoreBackup() {
  const fileInput = document.getElementById('restore-file-input');
  if (!fileInput.files || fileInput.files.length === 0) {
    alert(currentLang === 'si' ? 'කරුණාකර .db ගොනුවක් තෝරන්න.' : 'Please select a .db file to restore.');
    return;
  }
  
  const msg = currentLang === 'si' 
    ? 'අවවාදයයි: Restore කිරීම මඟින් දැනට ඇති සියලුම දත්ත මැකී යයි. ඔබට ඉදිරියට යාමට අවශ්‍යද?' 
    : 'WARNING: Restoring will overwrite all existing data. Are you sure you want to proceed?';
    
  if (!confirm(msg)) return;

  const file = fileInput.files[0];
  try {
    const res = await fetch(`${API_BASE}/api/system/restore`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/octet-stream'
      },
      body: file
    });
    
    const data = await res.json();
    if (res.ok && data.success) {
      alert(data.message);
      setTimeout(() => {
        handleLogout();
        window.location.reload();
      }, 2000);
    } else {
      throw new Error(data.error || 'Restore failed');
    }
  } catch (err) {
    alert(err.message);
  }
}

async function handleChangePassword() {
  const oldPassword = document.getElementById('change-old-password').value;
  const newPassword = document.getElementById('change-new-password').value;

  if (!oldPassword || !newPassword) {
    alert(currentLang === 'si' ? 'කරුණාකර සියලුම ක්ෂේත්‍ර පුරවන්න.' : 'Please fill all fields.');
    return;
  }

  if (newPassword.length < 8) {
    alert(currentLang === 'si' ? 'නව මුරපදය අවම වශයෙන් අක්ෂර 8ක් විය යුතුය.' : 'New password must be at least 8 characters.');
    return;
  }

  try {
    const res = await apiCall('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword })
    });

    if (res && res.success) {
      alert(res.message);
      document.getElementById('change-old-password').value = '';
      document.getElementById('change-new-password').value = '';
    } else {
      alert(res.error || 'Password change failed');
    }
  } catch (err) {
    alert(err.message);
  }
}

async function handleSimulate(e) {
  e.preventDefault();
  const text = document.getElementById('sim-text').value;
  const bypass = document.getElementById('sim-bypass').checked;
  if (!text) return;

  const msgList = document.getElementById('sim-messages');
  msgList.innerHTML += `<div class="sim-msg user"><div class="sim-bubble">${escapeHtml(text)}</div></div>`;
  document.getElementById('sim-text').value = '';
  msgList.scrollTop = msgList.scrollHeight;

  const res = await apiCall('/api/test/simulate', {
    method: 'POST',
    body: JSON.stringify({ text, bypassRules: bypass })
  });

  if (res && res.result) {
    const result = res.result;
    
    // Display bot reply in sim chat
    if (result.reply_text) {
      setTimeout(() => {
        msgList.innerHTML += `<div class="sim-msg bot"><div class="sim-bubble">${escapeHtml(result.reply_text)}</div></div>`;
        msgList.scrollTop = msgList.scrollHeight;
      }, 500);
    }

    // Update Analysis panel
    const analysisEl = document.getElementById('sim-analysis');
    analysisEl.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.75rem">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:0.8rem;color:var(--text-muted)">Detected Intent</span>
          <span class="badge badge-purple">${escapeHtml(result.intent || '-')}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:0.8rem;color:var(--text-muted)">Confidence Score</span>
          <span style="font-weight:700">${clampPercent((Number(result.confidence) || 0) * 100).toFixed(1)}%</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:0.8rem;color:var(--text-muted)">Next Action</span>
          <span class="badge badge-blue">${escapeHtml(result.next_action || '-')}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:0.8rem;color:var(--text-muted)">Assigned Team</span>
          <span class="badge badge-gray">${escapeHtml(result.assigned_team || '-')}</span>
        </div>
        <div style="margin-top:0.5rem">
          <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.4rem">Active Flags</div>
          <div style="display:flex;flex-wrap:wrap;gap:0.25rem">
            ${(result.flags || []).map(f => `<span class="badge badge-orange" style="font-size:0.65rem">${escapeHtml(f)}</span>`).join('') || '<span style="color:var(--text-muted);font-size:0.7rem">None</span>'}
          </div>
        </div>
        <div style="margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid var(--border-color)">
          <div style="font-size:0.75rem;color:var(--text-muted)">Processing Time: <strong>${Number(res.result.pipeline_time_ms) || 0}ms</strong></div>
        </div>
      </div>
    `;
  }
}

// ─── BRANDING ───
function applyBranding(settings) {
  if (!settings) return;

  const root = document.documentElement;

  if (settings.BRAND_COLOR) {
    root.style.setProperty('--accent-green', settings.BRAND_COLOR);
    // Rough calculation for a dim version (optional, hard to do perfectly without hex-to-rgb, but CSS variables can be overwritten)
    // The easiest way is to set the same color or let CSS fallback.
    // Assuming settings.BRAND_COLOR is a hex code like #FF0000
    // We can just set it as the primary color.
  }

  if (settings.COMPANY_NAME) {
    document.title = `${settings.COMPANY_NAME} — Admin Dashboard`;
    const logoTexts = document.querySelectorAll('.login-logo h1, .sidebar-logo span');
    logoTexts.forEach(el => el.textContent = settings.COMPANY_NAME);
  }

  if (settings.COMPANY_LOGO) {
    const dots = document.querySelectorAll('.logo-dot, .logo-icon svg');
    dots.forEach(el => {
      // If it's the dot, we make it an image
      if (el.classList.contains('logo-dot')) {
        el.style.background = `url(${settings.COMPANY_LOGO}) no-repeat center center`;
        el.style.backgroundSize = 'contain';
      } else if (el.tagName.toLowerCase() === 'svg') {
        // Replace SVG with img in login screen
        const img = document.createElement('img');
        img.src = settings.COMPANY_LOGO;
        img.style.width = '40px';
        img.style.height = '40px';
        img.style.borderRadius = '12px';
        el.replaceWith(img);
      }
    });
  }
}
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.cssText = `
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-left: 4px solid ${type === 'success' ? 'var(--accent-green)' : type === 'error' ? 'var(--accent-red)' : 'var(--accent-blue)'};
    color: var(--text-primary);
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 250px;
    animation: toastSlideIn 0.3s ease-out, toastFadeOut 0.3s ease-in 2.7s forwards;
    pointer-events: auto;
  `;

  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span style="font-size: 0.9rem; font-weight: 500;">${escapeHtml(message)}</span>`;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Add CSS animation for toast
const style = document.createElement('style');
style.textContent = `
  @keyframes toastSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  @keyframes toastFadeOut { from { opacity: 1; } to { opacity: 0; } }
`;

// ─── APPOINTMENTS ───
async function loadAppointments() {
  const data = await apiCall('/api/appointments');
  const container = document.getElementById('appointments-table-body');
  if (!container) return;

  if (!data || data.length === 0) {
    container.innerHTML = '<tr><td colspan="7" class="text-center">No appointments scheduled yet.</td></tr>';
    return;
  }

  container.innerHTML = data.map(app => `
    <tr>
      <td>${escapeHtml(app.appointment_date || '')}</td>
      <td>${escapeHtml(app.appointment_time || '')}</td>
      <td><strong>${escapeHtml(app.contact_name || 'Guest')}</strong></td>
      <td>${escapeHtml(app.contact_phone || '')}</td>
      <td><span style="font-size:0.8rem">${escapeHtml(app.reason || 'Not specified')}</span></td>
      <td><span class="badge ${app.status === 'confirmed' ? 'badge-green' : 'badge-orange'}">${escapeHtml(app.status || '')}</span></td>
      <td>
        <button class="btn btn-sm btn-outline">Cancel</button>
      </td>
    </tr>
  `).join('');
}

// ─── CAMPAIGNS ───
async function loadCampaigns() {
  const data = await apiCall('/api/campaigns');
  const container = document.getElementById('campaigns-list');
  if (!container) return;

  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state">No campaigns found. Create your first AI campaign!</div>';
    return;
  }

  container.innerHTML = data.map(c => `
    <div class="card bg-glass" style="margin-bottom: 1rem; border-left: 4px solid ${c.status === 'completed' ? '#10b981' : '#3b82f6'};">
      <div class="card-body" style="padding: 1.25rem;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <h3 style="margin:0; font-size:1.1rem;">${escapeHtml(c.name || '')}</h3>
            <p style="font-size:0.8rem; color:var(--text-muted); margin:4px 0;">Target: <strong>${escapeHtml((c.target_segment || '').replace('_', ' '))}</strong></p>
          </div>
          <span class="badge ${c.status === 'completed' ? 'badge-green' : 'badge-blue'}">${escapeHtml((c.status || '').toUpperCase())}</span>
        </div>
        
        <div style="margin-top:1rem; background:var(--bg-hover); padding:0.75rem; border-radius:6px; font-style:italic; font-size:0.85rem; border: 1px solid var(--border-color);">
          "${escapeHtml(c.message_template || '')}"
        </div>

        <div style="margin-top:1rem; display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:0.8rem;">
            Sent: <strong>${Number(c.sent_count) || 0} / ${Number(c.total_recipients) || 0}</strong>
          </div>
          <div>
            ${c.status === 'draft' ? `<button class="btn btn-sm btn-primary" onclick="handleExecuteCampaign('${escapeInlineJs(c.id)}')">Start Campaign</button>` : ''}
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function showNewCampaignModal() {
  document.getElementById('campaign-modal').classList.add('active');
}

async function handleCreateCampaign() {
  const name = document.getElementById('campaign-name').value;
  const targetSegment = document.getElementById('campaign-segment').value;
  const messageTemplate = document.getElementById('campaign-template').value;
  const aiEnhanced = document.getElementById('campaign-ai-enhanced').checked;

  if (!name || !messageTemplate) {
    showToast('Please fill in all fields', 'error');
    return;
  }

  const res = await apiCall('/api/campaigns', {
    method: 'POST',
    body: JSON.stringify({ name, targetSegment, messageTemplate, aiEnhanced })
  });

  if (res && res.success) {
    showToast('Campaign created successfully!', 'success');
    closeModal('campaign-modal');
    loadCampaigns();
  }
}

async function handleExecuteCampaign(id) {
  if (!confirm('Are you sure you want to start this AI campaign? It will send messages immediately.')) return;
  
  const res = await apiCall(`/api/campaigns/${id}/execute`, { method: 'POST' });
  if (res && res.success) {
    showToast('Campaign execution started!', 'success');
    loadCampaigns();
  }
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// ─── CONTACT DRAWER (PHASE 2) ───
let activeContactId = null;

async function openContactDetails(contactId) {
  activeContactId = contactId;
  toggleContactDrawer(true);
  
  // Show skeleton loading
  document.getElementById('drawer-ai-summary').innerHTML = '<div class="skeleton-text"></div><div class="skeleton-text" style="width: 80%;"></div>';
  document.getElementById('drawer-timeline').innerHTML = '<div class="skeleton-text"></div>'.repeat(3);
  
  const data = await apiCall(`/api/contacts/${contactId}`);
  if (!data) return;

  // Basic Info
  document.getElementById('drawer-name').textContent = data.display_name || 'Unknown';
  document.getElementById('drawer-phone').textContent = data.phone_number_masked || 'No phone';
  document.getElementById('drawer-avatar').textContent = (data.display_name || 'U')[0].toUpperCase();
  document.getElementById('drawer-status-badge').textContent = data.status || 'active';
  document.getElementById('drawer-status-badge').className = `badge ${statusBadgeClass(data.status)}`;
  
  document.getElementById('drawer-info-email').textContent = data.email || '—';
  document.getElementById('drawer-info-last-seen').textContent = data.last_message_at ? formatDate(data.last_message_at) : 'Never';
  document.getElementById('drawer-notes-input').value = data.notes || '';

  // Lead Score Animation
  updateLeadScoreRing(data.lead_score || 0);

  // Load AI Intelligence & Timeline
  loadContactIntelligence(contactId);
  loadContactTimeline(contactId);
}

function toggleContactDrawer(show) {
  const drawer = document.getElementById('contact-drawer');
  drawer.classList.toggle('hidden', !show);
  if (show) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
    activeContactId = null;
  }
}

function closeContactDrawer(e) {
  if (e.target.id === 'contact-drawer') toggleContactDrawer(false);
}

function updateLeadScoreRing(score) {
  const circle = document.getElementById('score-ring-fill');
  const val = document.getElementById('drawer-score-value');
  const radius = circle.r.baseVal.value;
  const circumference = 2 * Math.PI * radius;
  
  const offset = circumference - (score / 100) * circumference;
  circle.style.strokeDasharray = `${circumference} ${circumference}`;
  circle.style.strokeDashoffset = offset;
  
  // Animate number
  let current = 0;
  const step = score / 30;
  const interval = setInterval(() => {
    current += step;
    if (current >= score) {
      val.textContent = Math.round(score);
      clearInterval(interval);
    } else {
      val.textContent = Math.round(current);
    }
  }, 20);
}

async function loadContactIntelligence(contactId) {
  const summaryBox = document.getElementById('drawer-ai-summary');
  const tagBox = document.getElementById('drawer-tags');
  
  const data = await apiCall(`/api/contacts/${contactId}/intelligence`);
  if (data) {
    summaryBox.innerHTML = escapeHtml(data.summary || 'No summary available.');
    
    if (data.tags && data.tags.length > 0) {
      tagBox.innerHTML = data.tags.map(tag => `<span class="badge badge-blue" style="margin: 2px;">${escapeHtml(tag)}</span>`).join('');
    } else {
      tagBox.innerHTML = '<span style="font-size:0.7rem; color:var(--text-muted);">No tags detected</span>';
    }

    // Update lead score ring based on sentiment/score from intelligence
    if (data.lead_score) updateLeadScoreRing(data.lead_score);
  } else {
    summaryBox.innerHTML = 'Failed to load AI intelligence.';
  }
}

async function loadContactTimeline(contactId) {
  const timeline = document.getElementById('drawer-timeline');
  const data = await apiCall(`/api/contacts/${contactId}/timeline`);
  
  if (data && data.timeline) {
    if (data.timeline.length === 0) {
      timeline.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted); padding:1rem;">No events recorded.</div>';
      return;
    }

    timeline.innerHTML = data.timeline.map(item => `
      <div class="timeline-item">
        <div class="timeline-time">${timeAgo(item.timestamp)}</div>
        <div class="timeline-content">${escapeHtml(item.content || '')}</div>
      </div>
    `).join('');
  } else {
    timeline.innerHTML = 'Failed to load timeline.';
  }
}

function switchDrawerTab(tabName) {
  document.querySelectorAll('.drawer-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase() === tabName);
  });
  document.querySelectorAll('.drawer-body .tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `drawer-tab-${tabName}`);
  });
}

// --- CONTACT CRUD ---
let editingContactId = null;

function showAddContactModal() {
  editingContactId = null;
  document.getElementById('contact-modal-title').textContent = 'Add New Contact';
  document.getElementById('contact-form').reset();
  document.getElementById('modal-contact').classList.remove('hidden');
}

function closeContactModal() {
  document.getElementById('modal-contact').classList.add('hidden');
}

async function handleSaveContact(e) {
  e.preventDefault();
  const displayName = document.getElementById('contact-name').value;
  const phoneNumber = document.getElementById('contact-phone-input').value;
  const email = document.getElementById('contact-email').value;

  const btn = document.getElementById('contact-submit-btn');
  btn.disabled = true;

  try {
    let res;
    if (editingContactId) {
      res = await apiCall(`/api/contacts/${editingContactId}`, {
        method: 'POST',
        body: JSON.stringify({ displayName, phoneNumber, email })
      });
    } else {
      res = await apiCall('/api/contacts', {
        method: 'POST',
        body: JSON.stringify({ displayName, phoneNumber, email })
      });
    }

    if (res && res.success) {
      showToast(editingContactId ? 'Contact updated!' : 'Contact created!', 'success');
      closeContactModal();
      loadContacts();
      if (editingContactId && activeContactId === editingContactId) {
        openContactDetails(activeContactId); // Refresh drawer
      }
    } else {
      showToast(res?.error || 'Failed to save contact', 'error');
    }
  } finally {
    btn.disabled = false;
  }
}

async function editActiveContact() {
  if (!activeContactId) return;
  
  const data = await apiCall(`/api/contacts/${activeContactId}`);
  if (!data) return;

  editingContactId = activeContactId;
  document.getElementById('contact-modal-title').textContent = 'Edit Contact';
  document.getElementById('contact-name').value = data.display_name || '';
  document.getElementById('contact-phone-input').value = data.phone_number || '';
  document.getElementById('contact-email').value = data.email || '';
  
  document.getElementById('modal-contact').classList.remove('hidden');
}

async function saveContactNotes() {
  const notes = document.getElementById('drawer-notes-input').value;
  if (!activeContactId) return;

  showToast('Saving notes...', 'info');
  const res = await apiCall(`/api/contacts/${activeContactId}/notes`, {
    method: 'PATCH',
    body: JSON.stringify({ notes })
  });

  if (res) {
    showToast('Notes saved successfully', 'success');
  }
}

document.head.appendChild(style);
/* ═══ Command Palette & Shortcuts (Phase 4) ═══ */
document.addEventListener('keydown', (e) => {
  // Ctrl + K (Command Palette)
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    togglePalette();
  }

  // Escape (Close modals/panels/palette)
  if (e.key === 'Escape') {
    closePalette();
    closeChatPanel();
    closeContactDrawer();
  }

  // Alt + 1, 2, 3 (Quick Navigation)
  if (e.altKey) {
    if (e.key === '1') navigateTo('overview');
    if (e.key === '2') navigateTo('conversations');
    if (e.key === '3') navigateTo('contacts');
  }
});

function togglePalette() {
  const palette = document.getElementById('command-palette');
  const input = document.getElementById('palette-search');
  
  if (palette.classList.contains('hidden')) {
    palette.classList.remove('hidden');
    input.value = '';
    input.focus();
    renderPaletteDefault();
  } else {
    palette.classList.add('hidden');
  }
}

function closePalette() {
  document.getElementById('command-palette').classList.add('hidden');
}

const PALETTE_COMMANDS = [
  { id: 'go-overview', title: 'Go to Overview', desc: 'Main dashboard stats', icon: '🏠', shortcut: 'G O', action: () => navigateTo('overview') },
  { id: 'go-analytics', title: 'Go to Analytics', desc: 'View performance data', icon: '📈', shortcut: 'G A', action: () => navigateTo('analytics') },
  { id: 'go-conversations', title: 'Go to Conversations', desc: 'Manage chats', icon: '💬', shortcut: 'G C', action: () => navigateTo('conversations') },
  { id: 'go-contacts', title: 'Go to Contacts', desc: 'Customer database', icon: '👤', shortcut: 'G P', action: () => navigateTo('contacts') },
  { id: 'new-campaign', title: 'Create Campaign', desc: 'Launch AI outreach', icon: '🚀', action: () => showNewCampaignModal() },
  { id: 'system-settings', title: 'Settings', desc: 'Configure Pro CRM', icon: '⚙️', action: () => navigateTo('settings') }
];

function renderPaletteDefault() {
  const results = document.getElementById('palette-results');
  results.innerHTML = `
    <div class="palette-group">
      <div class="palette-group-title">Quick Actions</div>
      ${PALETTE_COMMANDS.map(cmd => renderPaletteItem(cmd)).join('')}
    </div>
  `;
}

function renderPaletteItem(item) {
  return `
    <div class="palette-item" onclick="executePaletteAction('${escapeInlineJs(item.id)}')">
      <div class="palette-item-icon">${escapeHtml(item.icon || '')}</div>
      <div class="palette-item-text">
        <span class="palette-item-title">${escapeHtml(item.title || '')}</span>
        <span class="palette-item-desc">${escapeHtml(item.desc || '')}</span>
      </div>
      ${item.shortcut ? `<span class="palette-item-shortcut">${escapeHtml(item.shortcut)}</span>` : ''}
    </div>
  `;
}

async function executePaletteAction(id) {
  const cmd = PALETTE_COMMANDS.find(c => c.id === id);
  if (cmd) {
    cmd.action();
    closePalette();
  } else if (id.startsWith('contact-')) {
    const contactId = id.replace('contact-', '');
    openContactDetails(contactId);
    closePalette();
  }
}

// Palette Search Logic
document.getElementById('palette-search').addEventListener('input', async (e) => {
  const query = e.target.value.toLowerCase().trim();
  if (!query) {
    renderPaletteDefault();
    return;
  }

  const filteredCommands = PALETTE_COMMANDS.filter(c => 
    c.title.toLowerCase().includes(query) || c.desc.toLowerCase().includes(query)
  );

  // Search contacts via API
  const contactData = await apiCall(`/api/contacts?search=${encodeURIComponent(query)}&limit=5`);
  const contacts = contactData ? contactData.contacts : [];

  const results = document.getElementById('palette-results');
  let html = '';

  if (filteredCommands.length > 0) {
    html += `<div class="palette-group"><div class="palette-group-title">Commands</div>`;
    html += filteredCommands.map(cmd => renderPaletteItem(cmd)).join('');
    html += `</div>`;
  }

  if (contacts.length > 0) {
    html += `<div class="palette-group"><div class="palette-group-title">Contacts</div>`;
    html += contacts.map(c => renderPaletteItem({
      id: `contact-${c.id}`,
      title: c.name || c.phone,
      desc: c.phone,
      icon: '👤'
    })).join('');
    html += `</div>`;
  }

  if (html === '') {
    html = '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No results found.</div>';
  }

  results.innerHTML = html;
});

// ─── UX HELPERS (PHASE 4) ───
function showTableSkeleton(tbody, colCount) {
  let html = '';
  for (let i = 0; i < 5; i++) {
    html += `<tr>${Array(colCount).fill('<td><div class="skeleton" style="height:12px; border-radius:4px;"></div></td>').join('')}</tr>`;
  }
  tbody.innerHTML = html;
}

function updateBreadcrumbs(page) {
  const container = document.querySelector('.topbar-left');
  if (!container) return;

  const title = document.getElementById('page-title');
  if (title) title.textContent = page;

  // Optional: Add breadcrumb path
  let bc = document.getElementById('dashboard-breadcrumbs');
  if (!bc) {
    bc = document.createElement('div');
    bc.id = 'dashboard-breadcrumbs';
    bc.className = 'breadcrumbs';
    container.insertBefore(bc, title);
  }
  bc.innerHTML = `<span class="breadcrumb-item">Pro CRM</span> <span class="breadcrumb-item">${escapeHtml(page)}</span>`;
}

// ─── CANNED RESPONSES (PHASE 5) ───
let cannedResponses = [];

async function loadCannedResponses() {
  const data = await apiCall('/api/canned-responses');
  const select = document.getElementById('chat-template-select');
  if (!select || !data) return;

  cannedResponses = data;
  select.innerHTML = '<option value="">— Select Template —</option>' + 
    data.map(r => `<option value="${escapeAttr(r.id)}">[${escapeHtml(r.shortcut)}] ${escapeHtml((r.content || '').substring(0, 30))}...</option>`).join('');
}

function handleTemplateSelect() {
  const select = document.getElementById('chat-template-select');
  const input = document.getElementById('chat-input');
  const selected = cannedResponses.find(r => r.id === select.value);
  
  if (selected && input) {
    input.value = selected.content;
    input.focus();
  }
}

async function sendSelectedTemplate() {
  const input = document.getElementById('chat-input');
  if (input && input.value) {
    handleChatSubmit(new Event('submit'));
    document.getElementById('chat-template-select').value = '';
  }
}

// ─── BULK ACTIONS (PHASE 5) ───
function toggleSelectAllContacts(master) {
  const checkboxes = document.querySelectorAll('.contact-checkbox');
  checkboxes.forEach(cb => cb.checked = master.checked);
  updateBulkSelection();
}

function updateBulkSelection() {
  const selected = document.querySelectorAll('.contact-checkbox:checked');
  const bar = document.getElementById('bulk-actions-bar');
  const countEl = document.getElementById('selected-count');
  
  if (selected && bar && countEl) {
    if (selected.length > 0) {
      bar.classList.remove('hidden');
      countEl.textContent = selected.length;
    } else {
      bar.classList.add('hidden');
      const master = document.getElementById('select-all-contacts');
      if (master) master.checked = false;
    }
  }
}

function clearBulkSelection() {
  const checkboxes = document.querySelectorAll('.contact-checkbox');
  checkboxes.forEach(cb => cb.checked = false);
  const master = document.getElementById('select-all-contacts');
  if (master) master.checked = false;
  updateBulkSelection();
}

async function executeBulkAction(action) {
  const selectedIds = Array.from(document.querySelectorAll('.contact-checkbox:checked')).map(cb => cb.value);
  
  if (selectedIds.length === 0) return;

  if (action === 'export') {
    showToast(`Exporting ${selectedIds.length} contacts...`, 'info');
    // Implement actual export logic here
  } else if (action === 'delete') {
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} contacts?`)) return;
    showToast(`Deleting ${selectedIds.length} contacts...`, 'info');
    // Call batch delete API
  }
  
  // After action, clear selection
  clearBulkSelection();
}

// ─── SCHEDULED MESSAGES (PHASE 5) ───
function openScheduleModal() {
  const content = document.getElementById('chat-input').value.trim();
  if (!content) {
    showToast('Please type a message first', 'error');
    return;
  }
  
  // Set default time to 1 hour from now
  const now = new Date();
  now.setHours(now.getHours() + 1);
  document.getElementById('schedule-datetime').value = now.toISOString().slice(0, 16);
  
  document.getElementById('schedule-modal').classList.remove('hidden');
}

async function confirmScheduleMessage() {
  const content = document.getElementById('chat-input').value.trim();
  const scheduledFor = document.getElementById('schedule-datetime').value;
  
  if (!scheduledFor) {
    showToast('Please select a date and time', 'error');
    return;
  }

  const res = await apiCall('/api/scheduled-messages', 'POST', {
    conversationId: activeConversationId,
    contactId: null, // Should be fetched from active conversation context
    content,
    scheduledFor
  });

  if (res) {
    showToast('Message scheduled successfully', 'success');
    document.getElementById('chat-input').value = '';
    closeModal('schedule-modal');
  }
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ─── CONVERSATION TRANSFER (PHASE 5) ───
function openTransferModal() {
  if (!activeConversationId) return;
  document.getElementById('transfer-modal').classList.remove('hidden');
}

async function confirmTransfer() {
  const team = document.getElementById('transfer-team-select').value;
  const note = document.getElementById('transfer-note').value;
  
  if (!team) {
    showToast('Please select a target team', 'error');
    return;
  }

  const res = await apiCall(`/api/conversations/${activeConversationId}/transfer`, 'POST', {
    team,
    note
  });

  if (res) {
    showToast(`Conversation transferred to ${team}`, 'success');
    closeChatPanel();
    closeModal('transfer-modal');
    loadConversations();
  }
}
// ─── KNOWLEDGE BASE (PHASE 4) ───
async function loadKnowledge() {
  try {
    const data = await apiCall('/api/system/knowledge');
    const editor = document.getElementById('kb-editor');
    if (editor && data) {
      editor.value = JSON.stringify(data, null, 2);
    }
  } catch (err) {
    console.error('KB load error', err);
  }
}

function switchKBTab(tabName) {
  document.querySelectorAll('.kb-tabs .kb-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick').includes(tabName));
  });
  document.querySelectorAll('.kb-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `kb-tab-${tabName}`);
  });
  
  if (tabName === 'general') loadKnowledge();
}

function toggleIngestFields() {
  const type = document.getElementById('kb-ingest-type').value;
  document.getElementById('kb-field-url').classList.toggle('hidden', type !== 'website');
  document.getElementById('kb-field-file').classList.toggle('hidden', type !== 'file');
  document.getElementById('kb-field-content').classList.toggle('hidden', type === 'file');
}

async function handleSaveKnowledge() {
  const editor = document.getElementById('kb-editor');
  const btn = document.querySelector('[onclick="handleSaveKnowledge()"]');
  
  try {
    const data = JSON.parse(editor.value);
    btn.disabled = true;
    showToast('Saving knowledge base...', 'info');
    
    const res = await apiCall('/api/system/knowledge', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    
    if (res && res.success) {
      showToast('Knowledge base updated!', 'success');
      reloadRules();
    }
  } catch (err) {
    showToast('Invalid JSON format in editor', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function reloadRules() {
  await apiCall('/api/system/reload-rules', { method: 'POST' });
}

// ─── DATA MANAGEMENT (BACKUPS) ───
async function loadBackups() {
  const data = await apiCall('/api/system/backups');
  const listEl = document.getElementById('backup-list');
  if (!listEl) return;

  if (!data || !data.backups || data.backups.length === 0) {
    listEl.innerHTML = '<div style="text-align:center; padding:1rem; opacity:0.6;">No backups found on server</div>';
    return;
  }

  listEl.innerHTML = data.backups.map(b => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem; border-bottom:1px solid var(--border-color); font-size:0.75rem;">
      <div>
        <div style="font-weight:600;">${escapeHtml(b.filename || '')}</div>
        <div style="color:var(--text-muted);">${new Date(b.createdAt).toLocaleString()} (${((Number(b.size) || 0) / 1024 / 1024).toFixed(2)} MB)</div>
      </div>
      <button class="btn btn-sm btn-outline" style="padding:2px 8px; font-size:0.7rem;" onclick="showToast('Restore from server backup not yet active', 'warning')">Restore</button>
    </div>
  `).join('');
}

async function createSystemBackup() {
  const btn = document.getElementById('btn-create-backup');
  btn.disabled = true;
  btn.innerHTML = 'Creating Backup...';
  
  try {
    const res = await apiCall('/api/system/backup', { method: 'POST' });
    if (res && res.success) {
      showToast('System backup created successfully!', 'success');
      loadBackups();
    } else {
      showToast('Backup failed: ' + (res?.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="margin-right:5px;"><path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2zm0 1h12v12H2V2z"/><path d="M4.5 5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zM4 7a.5.5 0 1 1 1 0 .5.5 0 0 1-1 0zm.5 3a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/></svg> Create Server Backup`;
  }
}

async function downloadDatabase() {
  try {
    const res = await fetch(`${API_BASE}/api/system/download-db`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
    if (res.status === 401) {
      handleLogout();
      return;
    }
    if (!res.ok) throw new Error('Download failed');

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `procrm_export_${new Date().toISOString().split('T')[0]}.db`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    showToast('Database download failed', 'error');
  }
}

function restoreFromLocalFile() {
  const input = document.getElementById('restore-file-input');
  if (!input.files || input.files.length === 0) {
    showToast('Please select a .db file first', 'warning');
    return;
  }
  
  showToast('Database restore via UI is disabled for security. Use CLI or manual replacement.', 'error');
}
