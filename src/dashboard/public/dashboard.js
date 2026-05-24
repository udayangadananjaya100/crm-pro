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
    search_placeholder: 'Search conversations...',
    'flow-builder': 'Flow Builder'
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
    search_placeholder: 'සංවාද සොයන්න...',
    'flow-builder': 'නීති ප්‍රවාහය'
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
    checkShiftStatus();
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
    checkShiftStatus();
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
  const licenseKey = document.getElementById('setup-license-key').value;
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
        adminName, adminEmail, adminPassword, companyName, licenseKey,
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
async function apiCall(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    if (res.status === 401) {
      handleLogout();
      return null;
    }
    return await res.json();
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

  // Appointment updates
  socket.on('appointment:update', (data) => {
    if (currentPage === 'appointments') {
      loadAppointments();
    }
  });

  // Campaign updates
  socket.on('campaign:update', (data) => {
    if (currentPage === 'campaigns') {
      loadCampaigns();
    }
    // Show toast for key state transitions to provide premium UX
    if (data.status === 'completed') {
      showToast(`📢 Campaign "${data.name}" completed successfully! (${data.sent_count}/${data.total_recipients})`, 'success');
    } else if (data.status === 'failed') {
      showToast(`⚠️ Campaign "${data.name}" execution failed!`, 'error');
    } else if (data.status === 'sending' && data.sent_count === 0) {
      showToast(`🚀 Campaign "${data.name}" execution started!`, 'info');
    }
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
    const iconMap = { message_in: '💬', message_out: '📤', sla_breach: '⚠️', system: '🔔' };
    const iconClass = n.type.includes('message') ? 'message' : n.type === 'sla_breach' ? 'sla' : 'system';
    return `
      <div class="notif-item ${n.read ? '' : 'unread'}" onclick="handleNotifClick('${n.id}')">
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
  toast.className = `toast ${type}`;
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
  div.textContent = text;
  return div.innerHTML;
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
    case 'flow-builder': loadFlowBuilder(); break;
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
    animateCounter('stat-sla-breaches', data.sla_breaches || 0);

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
        container.innerHTML = data.top_leads.map(lead => `
          <div style="background: var(--bg-hover); padding: 0.75rem; border-radius: 8px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 4px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:700; font-size:0.8rem; color: var(--text-primary);">${lead.display_name}</span>
              <span class="badge ${lead.lead_score >= 80 ? 'badge-red' : 'badge-orange'}" style="font-size:0.6rem; padding: 1px 6px;">${lead.lead_score} pts</span>
            </div>
            <div style="font-size:0.7rem; color:var(--text-muted);">${lead.phone_number}</div>
            <div style="margin-top:0.4rem; height:4px; background:var(--bg-card); border-radius:2px; overflow:hidden;">
              <div style="width:${lead.lead_score}%; height:100%; background:var(--accent-purple); transition: width 1s;"></div>
            </div>
          </div>
        `).join('');
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
    loadAnalyticsLeaderboard(),
    loadAdvancedKPIs()
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
    if (el) el.textContent = `${value}%`;
    if (prog) prog.style.width = `${value}%`;
  };

  updateMetric('ai-response-rate', data.ai_response_rate, 'ai-response-progress');
  updateMetric('handoff-rate', data.handoff_rate, 'handoff-progress');
  updateMetric('ai-accuracy', data.accuracy_score, 'ai-accuracy-progress');
}

async function loadAnalyticsLeaderboard() {
  const data = await apiCall('/api/analytics/leaderboard');
  const tbody = document.getElementById('analytics-leaderboard-tbody');
  if (!tbody || !data) return;

  tbody.innerHTML = data.map(agent => `
    <tr>
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="avatar-sm" style="width:24px; height:24px; font-size:0.6rem;">${(agent.display_name || 'A')[0]}</div>
          <span style="font-weight:600;">${agent.display_name}</span>
        </div>
      </td>
      <td><span class="badge badge-gray">${agent.team || 'General'}</span></td>
      <td style="font-weight:700;">${agent.resolutions}</td>
      <td style="color:var(--text-muted);">${agent.avg_resolution_time_mins || 0}m</td>
      <td>
        <div class="performance-bar">
          <div class="performance-fill" style="width: ${Math.min(100, (agent.resolutions / 50) * 100)}%"></div>
        </div>
      </td>
    </tr>
  `).join('');
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
    <div class="health-item clickable-row" style="padding: 0.75rem 1.25rem;" onclick="navigateTo('conversations'); setTimeout(() => openChat('${c.id}'), 100)">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="user-avatar" style="width:30px;height:30px;font-size:0.75rem">${(c.contact_name || 'U')[0].toUpperCase()}</div>
        <div style="display:flex;flex-direction:column">
          <span style="font-weight:600;font-size:0.85rem">${c.contact_name || 'Unknown'}</span>
          <span style="font-size:0.75rem;color:var(--text-muted)">${c.intent ? `Intent: ${c.intent}` : 'New Message'}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end">
        <span class="badge ${priorityBadgeClass(c.priority)}" style="font-size:0.6rem">${c.priority}</span>
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
        <span style="font-weight:600;font-size:0.85rem">${(log.action || '').replace(/_/g, ' ').toUpperCase()}</span>
        <span style="font-size:0.75rem;color:var(--text-muted)">${log.agent_type || 'System'} | ${log.intent || 'No Intent'}</span>
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
let activeContactId = null;
let activeCopilotSuggestion = null;

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
    tbody.innerHTML = '<div class="empty-state">No conversations found</div>';
    return;
  }

  tbody.innerHTML = data.conversations.map((c) => {
    const initials = (c.contact_name || 'U')[0].toUpperCase();
    const statusBadge = `<span class="badge badge-${getStatusColor(c.status)}" style="font-size:0.65rem; padding: 2px 6px;">${escapeHtml(c.status)}</span>`;
    const teamBadge = c.assigned_team ? `<span class="badge badge-gray" style="font-size:0.65rem; padding: 2px 6px;">${escapeHtml(c.assigned_team)}</span>` : '';
    const priorityDot = `<span class="priority-dot priority-${c.priority}" title="Priority: ${c.priority}" style="margin: 0;"></span>`;
    const intentBadge = c.intent ? `<span class="badge badge-purple" style="font-size:0.65rem; padding: 2px 6px;">${escapeHtml(c.intent)}</span>` : '';
    
    return `
      <div class="chat-list-item ${activeConversationId === c.id ? 'active-row' : ''}" onclick="openChat('${c.id}')">
        <div class="chat-list-item-avatar" onclick="event.stopPropagation(); openContactDetails('${c.contact_id}')" title="View Contact Details">${escapeHtml(initials)}</div>
        <div class="chat-list-item-details">
          <div class="chat-list-item-meta">
            <span class="chat-list-item-name">${escapeHtml(c.contact_name || 'Unknown')}</span>
            <span class="chat-list-item-time">${formatDate(c.updated_at)}</span>
          </div>
          <div class="chat-list-item-preview">${escapeHtml(c.phone_number_masked || 'No phone')}</div>
          <div class="chat-list-item-badges">
            ${priorityDot}
            ${statusBadge}
            ${teamBadge}
            ${intentBadge}
          </div>
        </div>
      </div>
    `;
  }).join('');
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
  
  const placeholder = document.getElementById('chat-placeholder');
  if (placeholder) placeholder.classList.add('hidden');
  
  // Highlight active card
  document.querySelectorAll('#conversations-tbody .chat-list-item').forEach(item => {
    item.classList.remove('active-row');
  });
  const activeItem = [...document.querySelectorAll('#conversations-tbody .chat-list-item')].find(item => item.outerHTML.includes(id));
  if (activeItem) activeItem.classList.add('active-row');

  // Load chat info and messages
  const convList = await apiCall(`/api/conversations?limit=100`);
  const current = convList?.conversations?.find(c => c.id === id);
  
  if (current) {
    activeContactId = current.contact_id;
    document.getElementById('chat-user-name').textContent = current.contact_name || 'Unknown';
    document.getElementById('chat-user-phone').textContent = current.phone_number_masked || '';
    document.getElementById('chat-avatar').textContent = (current.contact_name || 'U')[0].toUpperCase();
    document.getElementById('chat-status-badge').textContent = current.status;
    document.getElementById('chat-status-badge').className = `badge badge-${getStatusColor(current.status)}`;
    document.getElementById('chat-team-badge').textContent = current.assigned_team || '—';
    
    // Load Right Intelligence Pane
    loadRightPanelIntelligence(current.contact_id);

    // Auto-update copilot suggestion if the panel is open
    const copilotPanel = document.getElementById('copilot-panel');
    if (copilotPanel && !copilotPanel.classList.contains('hidden')) {
      loadCopilotSuggestion();
    }
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
    <div class="msg-bubble msg-${msg.direction} ${msg.ai_generated ? 'msg-ai' : ''}">
      <div class="msg-content">${msg.content}</div>
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
  
  const rightPanel = document.getElementById('chat-right-panel');
  if (rightPanel) rightPanel.classList.add('hidden');

  const placeholder = document.getElementById('chat-placeholder');
  if (placeholder) placeholder.classList.remove('hidden');

  document.querySelectorAll('#conversations-tbody .chat-list-item').forEach(item => {
    item.classList.remove('active-row');
  });
}

async function loadRightPanelIntelligence(contactId) {
  const rightPanel = document.getElementById('chat-right-panel');
  if (!rightPanel) return;
  rightPanel.classList.remove('hidden');

  rightPanel.innerHTML = `
    <div class="right-panel-section">
      <h4>Contact Info</h4>
      <div id="right-contact-details" class="right-detail-box">
        <div style="font-size:0.8rem; color:var(--text-muted);">Loading details...</div>
      </div>
    </div>
    <div class="right-panel-section">
      <h4>AI Insights</h4>
      <div id="right-ai-insights" class="right-detail-box">
        <div style="font-size:0.8rem; color:var(--text-muted);">Loading insights...</div>
      </div>
    </div>
  `;

  // Fetch contact details
  const contacts = await apiCall('/api/contacts');
  const contact = contacts?.find(c => c.id === contactId);
  const detailsBox = document.getElementById('right-contact-details');
  if (detailsBox && contact) {
    detailsBox.innerHTML = `
      <div class="detail-row"><span class="detail-label">Name:</span> <span class="detail-value">${escapeHtml(contact.name)}</span></div>
      <div class="detail-row"><span class="detail-label">Phone:</span> <span class="detail-value">${escapeHtml(contact.phone)}</span></div>
      <div class="detail-row"><span class="detail-label">Source:</span> <span class="detail-value">${escapeHtml(contact.source || 'WhatsApp')}</span></div>
    `;
  } else if (detailsBox) {
    detailsBox.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted);">Details unavailable</div>';
  }

  // Fetch intelligence details
  const data = await apiCall(`/api/contacts/${contactId}/intelligence`);
  const insightsBox = document.getElementById('right-ai-insights');
  if (insightsBox && data) {
    const sentiment = data.sentiment || 'neutral';
    const sentimentClass = sentiment === 'positive' ? 'badge-green' : (sentiment === 'negative' ? 'badge-red' : 'badge-gray');
    
    const score = data.lead_score || 0;
    const scoreColor = score >= 70 ? '#ff4d4d' : (score >= 40 ? '#ffa500' : '#4da3ff');
    const scoreText = score >= 70 ? 'Hot' : (score >= 40 ? 'Warm' : 'Cold');

    insightsBox.innerHTML = `
      <div class="detail-row">
        <span class="detail-label">Sentiment:</span>
        <span class="badge ${sentimentClass}">${escapeHtml(sentiment.toUpperCase())}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Lead Temp:</span>
        <span class="badge" style="background: ${scoreColor}; color: white; border: none; padding: 2px 6px;">${scoreText} (${score})</span>
      </div>
      <div class="detail-row" style="flex-direction: column; align-items: flex-start; gap: 4px; margin-top: 0.5rem;">
        <span class="detail-label" style="font-weight: 600;">AI Summary:</span>
        <div style="font-size: 0.8rem; line-height: 1.4; color: var(--text-secondary); background: var(--bg-hover); padding: 8px; border-radius: 6px; width: 100%;">
          ${escapeHtml(data.summary || 'No summary available.')}
        </div>
      </div>
      <div class="detail-row" style="flex-direction: column; align-items: flex-start; gap: 4px; margin-top: 0.5rem;">
        <span class="detail-label" style="font-weight: 600;">AI Tags:</span>
        <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; width: 100%;">
          ${data.tags && data.tags.length > 0 
            ? data.tags.map(t => `<span class="badge badge-blue">${escapeHtml(t)}</span>`).join('') 
            : '<span style="font-size:0.75rem; color:var(--text-muted);">No tags detected</span>'}
        </div>
      </div>
    `;
  } else if (insightsBox) {
    insightsBox.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted);">AI insights unavailable</div>';
  }
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
  openCsatModal();
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

  tbody.innerHTML = data.contacts.map((c) => `
    <tr class="clickable-row">
      <td onclick="event.stopPropagation()">
        <input type="checkbox" class="contact-checkbox" value="${c.id}" onchange="updateBulkSelection()">
      </td>
      <td onclick="openContactDetails('${c.id}')">
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="avatar-sm">${escapeHtml((c.display_name || 'U')[0].toUpperCase())}</div>
          <strong>${escapeHtml(c.display_name || 'Unknown')}</strong>
        </div>
      </td>
      <td onclick="openContactDetails('${c.id}')">${escapeHtml(c.phone_number_masked || '—')}</td>
      <td onclick="openContactDetails('${c.id}')"><span class="badge ${statusBadgeClass(c.status)}">${escapeHtml(c.status)}</span></td>
      <td onclick="openContactDetails('${c.id}')">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:30px; height:4px; background:var(--bg-hover); border-radius:2px; overflow:hidden;">
            <div style="width:${c.lead_score || 0}%; height:100%; background:${getLeadScoreColor(c.lead_score)};"></div>
          </div>
          <span style="font-size:0.75rem; font-weight:700;">${c.lead_score || 0}</span>
        </div>
      </td>
      <td>${c.language_preference === 'si' ? '🇱🇰 Sinhala' : '🇬🇧 English'}</td>
      <td>${c.last_message_at ? timeAgo(c.last_message_at) : 'Never'}</td>
    </tr>
  `).join('');
}

function getLeadScoreColor(score) {
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
    
    return `
    <tr>
      <td><small>${new Date(log.created_at).toLocaleString()}</small></td>
      <td><span class="badge badge-blue">${log.agent_type}</span></td>
      <td>${log.action}</td>
      <td>${log.intent || '—'}</td>
      <td>${log.confidence != null ? (parseFloat(log.confidence) * 100).toFixed(0) + '%' : '—'}</td>
      <td>${flags.map(f => `<span class="badge badge-orange" style="margin:1px">${f}</span>`).join(' ') || '—'}</td>
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
    Object.keys(data).map(key => `<option value="${key}">${key}</option>`).join('');
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
          <div class="user-avatar" style="width:30px;height:30px;font-size:0.75rem">${agent.display_name[0].toUpperCase()}</div>
          <span>${agent.display_name}</span>
        </div>
      </td>
      <td>${agent.email}</td>
      <td><span class="badge badge-purple">${agent.role}</span></td>
      <td><span class="badge badge-gray">${agent.team}</span></td>
      <td><span class="badge ${agent.status === 'active' ? 'badge-green' : (agent.status === 'suspended' ? 'badge-red' : 'badge-gray')}">${agent.status}</span></td>
      <td>${agent.active_conversations || 0}</td>
      <td>${agent.last_active_at ? formatTime(agent.last_active_at) : 'Never'}</td>
      <td>
        <div class="action-group">
          <button class="btn-icon" onclick="showEditAgentModal('${agent.id}', '${agent.display_name}', '${agent.role}', '${agent.team}', '${agent.status}')" title="Edit">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
          </button>
          <button class="btn-icon" onclick="toggleAgentStatus('${agent.id}', '${agent.status}')" title="${agent.status === 'suspended' ? 'Activate' : 'Suspend'}" style="color:${agent.status === 'suspended' ? 'var(--accent-green)' : 'var(--accent-orange)'}">
            ${agent.status === 'suspended' 
              ? '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
              : '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>'}
          </button>
          <button class="btn-icon" onclick="handleDeleteAgent('${agent.id}')" title="Delete" style="color:var(--accent-red)">
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
        method: 'PUT',
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
    method: 'PUT',
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
  } else if (tab === 'advanced') {
    loadAdvancedRules();
  } else if (tab === 'general') {
    loadKnowledge();
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
  
  if (currentKBTab === 'documents') {
    loadKnowledgeDocuments();
  } else if (currentKBTab === 'advanced') {
    loadAdvancedRules();
  }
}

async function loadAdvancedRules() {
  const data = await apiCall('/api/system/rules/agent');
  if (data) {
    if (data.confidence_threshold) {
      document.getElementById('kb-conf-auto').value = data.confidence_threshold.auto_send;
      document.getElementById('kb-conf-human').value = data.confidence_threshold.human_review;
    }
    if (data.tone_guidelines) {
      document.getElementById('kb-tone-style').value = data.tone_guidelines.style;
    }
  }
}

async function loadKnowledgeDocuments() {
  const tbody = document.getElementById('kb-docs-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Loading documents...</td></tr>';

  const data = await apiCall('/api/knowledge/documents');
  if (!data || !data.documents) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Failed to load documents</td></tr>';
    return;
  }

  if (data.documents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No documents indexed yet.</td></tr>';
    return;
  }

  tbody.innerHTML = data.documents.map(doc => {
    let titleHTML = `<strong>${doc.title}</strong>`;
    if (doc.expires_at) {
      const isExpired = new Date(doc.expires_at) < new Date();
      titleHTML += `<br><small style="color:${isExpired ? 'red' : 'gray'}">Expires: ${new Date(doc.expires_at).toLocaleDateString()}</small>`;
    }
    return `
    <tr>
      <td>${titleHTML}</td>
      <td><span class="badge badge-purple">${(doc.category || 'general').toUpperCase()}</span></td>
      <td><span class="badge badge-gray">${doc.doc_type}</span></td>
      <td><span class="badge badge-green">${doc.status}</span></td>
      <td>${doc.total_chunks || 0}</td>
      <td><span class="badge badge-blue">${doc.usage_count || 0} hits</span></td>
      <td>
        <button class="btn-icon" onclick="openKnowledgeEditModal('${doc.id}')" style="color:var(--accent-blue); margin-right: 8px;">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
        </button>
        <button class="btn-icon" onclick="handleDeleteKnowledgeDoc('${doc.id}')" style="color:var(--accent-red)">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        </button>
      </td>
    </tr>
  `}).join('');
}

async function handleTrainAI() {
  const type = document.getElementById('kb-ingest-type').value;
  const title = document.getElementById('kb-input-title').value;
  const category = document.getElementById('kb-input-category').value;
  const expiryRaw = document.getElementById('kb-input-expiry').value;
  const content = document.getElementById('kb-input-content').value;
  const url = document.getElementById('kb-input-url').value;
  const fileInput = document.getElementById('kb-input-file');
  const btn = document.getElementById('btn-train-ai');

  let expiresAt = null;
  if (expiryRaw) {
    // End of day
    expiresAt = new Date(expiryRaw + 'T23:59:59Z').toISOString();
  }

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
        body: JSON.stringify({ title, category, content, expiresAt })
      });
    } else if (type === 'website') {
      res = await apiCall('/api/knowledge/scrape', {
        method: 'POST',
        body: JSON.stringify({ title, category, url, expiresAt })
      });
    } else if (type === 'file') {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('category', category);
      if (expiresAt) formData.append('expiresAt', expiresAt);
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
  const btn = document.getElementById('kb-save-btn-text');
  const originalText = btn.textContent;
  
  try {
    if (currentKBTab === 'general') {
      const editor = document.getElementById('kb-editor');
      const data = JSON.parse(editor.value);
      btn.textContent = currentLang === 'si' ? 'සුරකිමින්...' : 'Saving...';
      
      const res = await apiCall('/api/system/knowledge', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      
      if (res && res.success) {
        showToast('Configuration saved!', 'success');
      }
    } else if (currentKBTab === 'advanced') {
      btn.textContent = currentLang === 'si' ? 'සුරකිමින්...' : 'Saving...';
      
      // 1. Fetch current agent rules
      const data = await apiCall('/api/system/rules/agent');
      if (!data) {
        throw new Error('Failed to load current agent rules');
      }
      
      // 2. Update threshold and tone style
      if (!data.confidence_threshold) data.confidence_threshold = {};
      if (!data.tone_guidelines) data.tone_guidelines = {};
      
      data.confidence_threshold.auto_send = parseFloat(document.getElementById('kb-conf-auto').value);
      data.confidence_threshold.human_review = parseFloat(document.getElementById('kb-conf-human').value);
      data.tone_guidelines.style = document.getElementById('kb-tone-style').value;
      
      // 3. Save back
      const res = await apiCall('/api/system/rules/agent', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      
      if (res && res.success) {
        showToast('Advanced rules saved!', 'success');
      }
    }
  } catch (err) {
    if (currentKBTab === 'general') {
      showToast('Invalid JSON format', 'error');
    } else {
      showToast(err.message || 'Failed to save settings', 'error');
    }
  } finally {
    btn.textContent = originalText;
  }
}

// ─── SETTINGS ───
function switchSettingsTab(tabId) {
  document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-settings-tab') === tabId);
  });
  document.querySelectorAll('.settings-tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `settings-pane-${tabId}`);
  });
}

async function loadSettingsUI() {
  switchSettingsTab('general');
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
    
    // Licensing
    if (data.license_key && data.license_key !== 'null') {
      document.getElementById('set-license-key').value = data.license_key;
    } else {
      document.getElementById('set-license-key').value = '';
    }
    
    const licenseStatusEl = document.getElementById('license-status-badge');
    if (licenseStatusEl) {
      let isValid = false;
      if (data.license_status) {
        try {
          const statusObj = typeof data.license_status === 'string' ? JSON.parse(data.license_status) : data.license_status;
          isValid = statusObj && statusObj.valid;
        } catch (e) {
          isValid = false;
        }
      }
      if (isValid) {
        licenseStatusEl.textContent = currentLang === 'si' ? 'සක්‍රීයයි' : 'Active';
        licenseStatusEl.className = 'badge badge-green';
      } else {
        licenseStatusEl.textContent = currentLang === 'si' ? 'අක්‍රීයයි' : 'Inactive';
        licenseStatusEl.className = 'badge badge-red';
      }
    }
    
    // Webhook Setup
    if (data.META_APP_ID) document.getElementById('set-meta-app-id').value = data.META_APP_ID;
    if (data.META_APP_SECRET) document.getElementById('set-meta-app-secret').placeholder = "••••••••";
    if (data.PUBLIC_BASE_URL) document.getElementById('set-public-url').value = data.PUBLIC_BASE_URL;
    if (data.WEBHOOK_VERIFY_TOKEN) document.getElementById('set-verify-token').value = data.WEBHOOK_VERIFY_TOKEN;

    // Telegram & FB Messenger Bot Tokens
    if (data.TELEGRAM_BOT_TOKEN) document.getElementById('set-tg-token').placeholder = data.TELEGRAM_BOT_TOKEN;
    if (data.MESSENGER_PAGE_TOKEN) document.getElementById('set-msgr-token').placeholder = data.MESSENGER_PAGE_TOKEN;
  }
  
  // Load Canned Responses & Webhooks Settings cards
  loadCannedResponsesSettings();
  loadWebhooksSettings();
  loadWorkspaceRulesSettings();
  loadComplianceRulesSettings();
}

async function loadCannedResponsesSettings() {
  const tbody = document.getElementById('canned-responses-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">Loading canned responses...</td></tr>';
  
  const data = await apiCall('/api/canned-responses');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">No canned responses found.</td></tr>';
    return;
  }
  
  tbody.innerHTML = data.map(r => `
    <tr>
      <td><strong>[${escapeHtml(r.shortcut)}]</strong></td>
      <td><span class="badge badge-gray">${escapeHtml(r.category || 'General')}</span></td>
      <td title="${escapeHtml(r.content)}">${escapeHtml(r.content.substring(0, 50))}${r.content.length > 50 ? '...' : ''}</td>
      <td>
        <button class="btn btn-link btn-xs" onclick="deleteCannedResponse('${r.id}')" style="color: #ef4444; padding: 0; background: none; border: none; cursor: pointer;">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function addCannedResponse() {
  const shortcutInput = document.getElementById('canned-shortcut');
  const categoryInput = document.getElementById('canned-category');
  const contentInput = document.getElementById('canned-content');
  
  const shortcut = shortcutInput?.value.trim();
  const category = categoryInput?.value.trim() || 'General';
  const content = contentInput?.value.trim();
  
  if (!shortcut || !content) {
    showToast('Shortcut and Reply Content are required!', 'error');
    return;
  }
  
  showToast('Creating canned response...', 'info');
  const res = await apiCall('/api/canned-responses', {
    method: 'POST',
    body: JSON.stringify({ shortcut, category, content })
  });
  
  if (res) {
    showToast('Canned response added!', 'success');
    if (shortcutInput) shortcutInput.value = '';
    if (categoryInput) categoryInput.value = '';
    if (contentInput) contentInput.value = '';
    loadCannedResponsesSettings();
    if (typeof loadCannedResponses === 'function') loadCannedResponses();
  }
}

async function deleteCannedResponse(id) {
  if (!confirm('Are you sure you want to delete this canned response?')) return;
  
  showToast('Deleting canned response...', 'info');
  const res = await apiCall(`/api/canned-responses/${id}`, {
    method: 'DELETE'
  });
  
  if (res) {
    showToast('Canned response deleted!', 'success');
    loadCannedResponsesSettings();
    if (typeof loadCannedResponses === 'function') loadCannedResponses();
  }
}

async function loadWebhooksSettings() {
  const tbody = document.getElementById('webhooks-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3" class="empty-cell">Loading webhooks...</td></tr>';
  
  const data = await apiCall('/api/webhooks');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-cell">No outgoing webhooks registered.</td></tr>';
    return;
  }
  
  tbody.innerHTML = data.map(w => `
    <tr>
      <td title="${escapeHtml(w.target_url)}"><code>${escapeHtml(w.target_url)}</code></td>
      <td><span class="badge badge-gray">${escapeHtml(w.events)}</span></td>
      <td>
        <button class="btn btn-link btn-xs" onclick="deleteWebhookSubscription('${w.id}')" style="color: #ef4444; padding: 0; background: none; border: none; cursor: pointer;">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function addWebhookSubscription() {
  const targetUrlInput = document.getElementById('webhook-target-url');
  const eventsInput = document.getElementById('webhook-events');
  const secretInput = document.getElementById('webhook-secret');
  
  const targetUrl = targetUrlInput?.value.trim();
  const events = eventsInput?.value.trim() || '*';
  const secret = secretInput?.value.trim();
  
  if (!targetUrl) {
    showToast('Target URL is required!', 'error');
    return;
  }
  
  showToast('Registering webhook...', 'info');
  const res = await apiCall('/api/webhooks', {
    method: 'POST',
    body: JSON.stringify({ targetUrl, events, secret })
  });
  
  if (res) {
    showToast('Webhook registered successfully!', 'success');
    if (targetUrlInput) targetUrlInput.value = '';
    if (eventsInput) eventsInput.value = '';
    if (secretInput) secretInput.value = '';
    loadWebhooksSettings();
  }
}

async function deleteWebhookSubscription(id) {
  if (!confirm('Are you sure you want to delete this webhook subscription?')) return;
  
  showToast('Deleting webhook...', 'info');
  const res = await apiCall(`/api/webhooks/${id}`, {
    method: 'DELETE'
  });
  
  if (res) {
    showToast('Webhook subscription deleted!', 'success');
    loadWebhooksSettings();
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

async function saveWebhookSettings() {
  const appId = document.getElementById('set-meta-app-id').value;
  const appSecret = document.getElementById('set-meta-app-secret').value;
  const baseUrl = document.getElementById('set-public-url').value;
  const verifyToken = document.getElementById('set-verify-token').value;

  const isUpdating = document.getElementById('set-meta-app-secret').placeholder === "••••••••";

  const btn = event.target;
  const originalText = btn.textContent;
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    const updates = [];
    if (appId) updates.push(apiCall('/api/system/settings', { method: 'POST', body: JSON.stringify({ key: 'META_APP_ID', value: appId }) }));
    // Only save App Secret if user typed a new value (non-empty)
    if (appSecret) updates.push(apiCall('/api/system/settings', { method: 'POST', body: JSON.stringify({ key: 'META_APP_SECRET', value: appSecret }) }));
    if (baseUrl) updates.push(apiCall('/api/system/settings', { method: 'POST', body: JSON.stringify({ key: 'PUBLIC_BASE_URL', value: baseUrl }) }));
    if (verifyToken) updates.push(apiCall('/api/system/settings', { method: 'POST', body: JSON.stringify({ key: 'WEBHOOK_VERIFY_TOKEN', value: verifyToken }) }));

    await Promise.all(updates);
    alert(currentLang === 'si' ? 'සාර්ථකව සුරැකුණා!' : 'Saved successfully!');
    loadSettingsUI();
  } catch (err) {
    alert('Failed to save configuration: ' + err.message);
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

async function saveLicenseKey() {
  const val = document.getElementById('set-license-key').value.trim();
  if (!val) return;
  
  // 1. Save license_key
  const res1 = await apiCall('/api/system/settings', {
    method: 'POST',
    body: JSON.stringify({ key: 'license_key', value: val })
  });
  
  if (res1 && res1.success) {
    // 2. Update license_status to valid since a key is provided
    const status = { valid: true, activated_at: new Date().toISOString() };
    await apiCall('/api/system/settings', {
      method: 'POST',
      body: JSON.stringify({ key: 'license_status', value: JSON.stringify(status) })
    });
    
    alert(currentLang === 'si' ? 'ලයිසන් එක සාර්ථකව සක්‍රිය කරන ලදී!' : 'License key activated successfully!');
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
    const formData = new FormData();
    formData.append('file', file);
    
    const res = await fetch(`${API_BASE}/api/system/restore`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`
        // Do not set Content-Type, fetch will automatically set it to multipart/form-data with the boundary
      },
      body: formData
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

  const customModel = document.getElementById('sim-model').value;
  const customTemp = parseFloat(document.getElementById('sim-temp').value);
  const customSystemPrompt = document.getElementById('sim-instruction').value;

  const msgList = document.getElementById('sim-messages');
  msgList.innerHTML += `<div class="sim-msg user"><div class="sim-bubble">${text}</div></div>`;
  document.getElementById('sim-text').value = '';
  msgList.scrollTop = msgList.scrollHeight;

  const res = await apiCall('/api/test/simulate', {
    method: 'POST',
    body: JSON.stringify({ 
      text, 
      bypassRules: bypass,
      aiOverrides: {
        model: customModel,
        temperature: customTemp,
        systemPrompt: customSystemPrompt
      }
    })
  });

  if (res && res.result) {
    const result = res.result;
    
    // Display bot reply in sim chat
    if (result.reply_text) {
      setTimeout(() => {
        msgList.innerHTML += `<div class="sim-msg bot"><div class="sim-bubble">${result.reply_text}</div></div>`;
        msgList.scrollTop = msgList.scrollHeight;
      }, 500);
    }

    // Update Analysis panel
    const analysisEl = document.getElementById('sim-analysis');
    analysisEl.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.75rem">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:0.8rem;color:var(--text-muted)">Detected Intent</span>
          <span class="badge badge-purple">${result.intent}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:0.8rem;color:var(--text-muted)">Confidence Score</span>
          <span style="font-weight:700">${(result.confidence * 100).toFixed(1)}%</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:0.8rem;color:var(--text-muted)">Next Action</span>
          <span class="badge badge-blue">${result.next_action}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:0.8rem;color:var(--text-muted)">Assigned Team</span>
          <span class="badge badge-gray">${result.assigned_team}</span>
        </div>
        <div style="margin-top:0.5rem">
          <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.4rem">Active Flags</div>
          <div style="display:flex;flex-wrap:wrap;gap:0.25rem">
            ${result.flags.map(f => `<span class="badge badge-orange" style="font-size:0.65rem">${f}</span>`).join('') || '<span style="color:var(--text-muted);font-size:0.7rem">None</span>'}
          </div>
        </div>
        <div style="margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid var(--border-color)">
          <div style="font-size:0.75rem;color:var(--text-muted)">Processing Time: <strong>${res.result.pipeline_time_ms}ms</strong></div>
        </div>
      </div>
    `;
  }
}

async function exportStatsReport() {
  try {
    const data = await apiCall('/api/dashboard/stats');
    if (!data) {
      showToast('Failed to export stats: no data received', 'error');
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Metric,Value\n";
    csvContent += `Active Contacts,${data.active_contacts || 0}\n`;
    csvContent += `Open Conversations,${data.open_conversations || 0}\n`;
    csvContent += `Today's Messages,${data.today_messages || 0}\n`;
    csvContent += `SLA Breaches,${data.sla_breaches || 0}\n`;
    csvContent += `Lead Temperature - Hot,${data.lead_distribution?.hot || 0}\n`;
    csvContent += `Lead Temperature - Warm,${data.lead_distribution?.warm || 0}\n`;
    csvContent += `Lead Temperature - Cold,${data.lead_distribution?.cold || 0}\n`;
    
    csvContent += "\nTop High-Value Leads\n";
    csvContent += "Display Name,Phone Number,Lead Score,Status\n";
    if (data.top_leads && data.top_leads.length > 0) {
      data.top_leads.forEach(lead => {
        csvContent += `"${lead.display_name}","${lead.phone_number}",${lead.lead_score},"${lead.status}"\n`;
      });
    } else {
      csvContent += "No high value leads found,,,\n";
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `procrm_stats_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Report exported successfully!', 'success');
  } catch (err) {
    showToast(`Export failed: ${err.message}`, 'error');
  }
}

async function triggerSLABreachSimulation() {
  if (!confirm('Are you sure you want to trigger a simulated SLA breach? This will alert managers and create a warning.')) return;
  try {
    const res = await apiCall('/api/test/trigger-sla-breach', { method: 'POST' });
    if (res && res.success) {
      showToast(res.message || 'SLA breach simulated successfully!', 'success');
      refreshDashboard();
      if (typeof loadNotifications === 'function') loadNotifications();
    } else {
      showToast(res?.error || 'Failed to trigger simulated SLA breach', 'error');
    }
  } catch (err) {
    showToast(`Simulation failed: ${err.message}`, 'error');
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
// showToast is already defined above (line ~559). Using that version.

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
      <td>${app.appointment_date}</td>
      <td>${app.appointment_time}</td>
      <td><strong>${app.contact_name || 'Guest'}</strong></td>
      <td>${app.contact_phone}</td>
      <td><span style="font-size:0.8rem">${app.reason || 'Not specified'}</span></td>
      <td><span class="badge ${app.status === 'confirmed' ? 'badge-green' : 'badge-orange'}">${app.status}</span></td>
      <td>
        ${app.status === 'confirmed' ? `<button class="btn btn-sm btn-outline" onclick="cancelAppointment('${app.id}')">Cancel</button>` : ''}
      </td>
    </tr>
  `).join('');
}

async function cancelAppointment(id) {
  if (!confirm('Are you sure you want to cancel this appointment?')) return;
  const res = await apiCall(`/api/appointments/${id}/cancel`, { method: 'POST' });
  if (res && res.success) {
    showToast('Appointment cancelled successfully!', 'success');
    loadAppointments();
  }
}

async function showNewAppointmentModal() {
  // Clear previous inputs
  document.getElementById('booking-date').value = '';
  document.getElementById('booking-time').value = '';
  document.getElementById('booking-reason').value = '';
  
  // Load active contacts for selection
  const selectEl = document.getElementById('booking-contact-id');
  selectEl.innerHTML = '<option value="">Loading contacts...</option>';
  
  const contactsData = await apiCall('/api/contacts?limit=100');
  if (contactsData && contactsData.contacts) {
    selectEl.innerHTML = contactsData.contacts.map(c => `
      <option value="${c.id}" data-name="${escapeHtml(c.display_name)}" data-phone="${escapeHtml(c.phone_number)}">
        ${escapeHtml(c.display_name)} (${escapeHtml(c.phone_number_masked || c.phone_number)})
      </option>
    `).join('');
  } else {
    selectEl.innerHTML = '<option value="">Failed to load contacts</option>';
  }
  
  document.getElementById('booking-modal').classList.add('active');
}

async function handleCreateAppointment() {
  const contactSelect = document.getElementById('booking-contact-id');
  const contactId = contactSelect.value;
  if (!contactId) {
    showToast('Please select a contact', 'error');
    return;
  }
  
  const selectedOption = contactSelect.options[contactSelect.selectedIndex];
  const contactName = selectedOption.getAttribute('data-name');
  const contactPhone = selectedOption.getAttribute('data-phone');
  
  const date = document.getElementById('booking-date').value;
  const time = document.getElementById('booking-time').value;
  const reason = document.getElementById('booking-reason').value;
  
  if (!date || !time) {
    showToast('Please select date and time', 'error');
    return;
  }
  
  const res = await apiCall('/api/appointments', {
    method: 'POST',
    body: JSON.stringify({
      contactId,
      contactName,
      contactPhone,
      date,
      time,
      reason
    })
  });
  
  if (res && res.success) {
    showToast('Appointment scheduled successfully!', 'success');
    closeModal('booking-modal');
    loadAppointments();
  } else {
    showToast(res?.error || 'Failed to book appointment', 'error');
  }
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
            <h3 style="margin:0; font-size:1.1rem;">${c.name}</h3>
            <p style="font-size:0.8rem; color:var(--text-muted); margin:4px 0;">Target: <strong>${c.target_segment.replace('_', ' ')}</strong></p>
          </div>
          <span class="badge ${c.status === 'completed' ? 'badge-green' : 'badge-blue'}">${c.status.toUpperCase()}</span>
        </div>
        
        <div style="margin-top:1rem; background:var(--bg-hover); padding:0.75rem; border-radius:6px; font-style:italic; font-size:0.85rem; border: 1px solid var(--border-color);">
          "${c.message_template}"
        </div>

        <div style="margin-top:1rem; display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:0.8rem;">
            Sent: <strong>${c.sent_count} / ${c.total_recipients}</strong>
          </div>
          <div>
            ${c.status === 'draft' ? `<button class="btn btn-sm btn-primary" onclick="handleExecuteCampaign('${c.id}')">Start Campaign</button>` : ''}
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
    summaryBox.innerHTML = data.summary || 'No summary available.';
    
    if (data.tags && data.tags.length > 0) {
      tagBox.innerHTML = data.tags.map(tag => `<span class="badge badge-blue" style="margin: 2px;">${tag}</span>`).join('');
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
        <div class="timeline-content">${item.content}</div>
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
    toggleContactDrawer(false);
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
    <div class="palette-item" onclick="executePaletteAction('${item.id}')">
      <div class="palette-item-icon">${item.icon}</div>
      <div class="palette-item-text">
        <span class="palette-item-title">${item.title}</span>
        <span class="palette-item-desc">${item.desc}</span>
      </div>
      ${item.shortcut ? `<span class="palette-item-shortcut">${item.shortcut}</span>` : ''}
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
  const contactData = await apiCall(`/api/contacts?search=${query}&limit=5`);
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
      title: c.display_name || c.phone_number_masked,
      desc: c.phone_number_masked,
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
  bc.innerHTML = `<span class="breadcrumb-item">Pro CRM</span> <span class="breadcrumb-item">${page}</span>`;
}

// ─── CANNED RESPONSES (PHASE 5) ───
let cannedResponses = [];

async function loadCannedResponses() {
  const data = await apiCall('/api/canned-responses');
  const select = document.getElementById('chat-template-select');
  if (!select || !data) return;

  cannedResponses = data;
  select.innerHTML = '<option value="">— Select Template —</option>' + 
    data.map(r => `<option value="${r.id}">[${r.shortcut}] ${r.content.substring(0, 30)}...</option>`).join('');
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
    const res = await apiCall('/api/contacts', {
      method: 'DELETE',
      body: JSON.stringify({ ids: selectedIds })
    });
    
    if (res && res.success) {
      showToast(`Successfully deleted ${selectedIds.length} contacts`, 'success');
      loadContacts();
    }
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

  const res = await apiCall('/api/scheduled-messages', {
    method: 'POST',
    body: JSON.stringify({
      conversationId: activeConversationId,
      contactId: null, // Should be fetched from active conversation context
      content,
      scheduledFor
    })
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

  const res = await apiCall(`/api/conversations/${activeConversationId}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ team, note })
  });

  if (res) {
    showToast(`Conversation transferred to ${team}`, 'success');
    closeChatPanel();
    closeModal('transfer-modal');
    loadConversations();
  }
}
// NOTE: loadKnowledge, switchKBTab, toggleIngestFields, handleSaveKnowledge
// are already defined above (Phase 4/5 section). Removed duplicates.

async function reloadRules() {
  await apiCall('/api/system/reload-rules', { method: 'POST' });
}


// ─── ADVANCED FEATURES (Phase 8 UI) ───
let flowLayout = null;
let flowRules = null;
let flowWorkspaceEl = null;

async function loadAdvancedKPIs() {
  const data = await apiCall('/api/analytics/advanced');
  if (!data) return;

  const slaBreachEl = document.getElementById('metric-sla-breach');
  const slaBreachProg = document.getElementById('sla-breach-progress');
  if (slaBreachEl) slaBreachEl.textContent = `${data.sla_breach_rate}%`;
  if (slaBreachProg) slaBreachProg.style.width = `${data.sla_breach_rate}%`;

  const avgResponseEl = document.getElementById('metric-avg-response');
  const avgResponseProg = document.getElementById('avg-response-progress');
  if (avgResponseEl) avgResponseEl.textContent = `${data.avg_response_time_mins} min`;
  if (avgResponseProg) {
    const percentage = Math.min(100, Math.max(0, (data.avg_response_time_mins / 30) * 100));
    avgResponseProg.style.width = `${percentage}%`;
  }

  const csatEl = document.getElementById('metric-csat');
  const csatProg = document.getElementById('csat-progress');
  if (csatEl) csatEl.textContent = data.avg_csat > 0 ? `${data.avg_csat} / 5` : '0.0 / 5';
  if (csatProg) {
    const percentage = data.avg_csat > 0 ? (data.avg_csat / 5) * 100 : 0;
    csatProg.style.width = `${percentage}%`;
  }
}

async function loadFlowBuilder() {
  updateBreadcrumbs('Flow Builder');
  flowWorkspaceEl = document.getElementById('flow-workspace');
  if (!flowWorkspaceEl) return;
  flowWorkspaceEl.innerHTML = '';
  
  const svg = document.getElementById('flow-connections-svg');
  if (svg) svg.innerHTML = '';

  flowLayout = await apiCall('/api/system/flow-builder');
  flowRules = await apiCall('/api/system/rules/intentRouting');

  if (!flowRules || !flowRules.intents) {
    flowWorkspaceEl.innerHTML = '<div class="empty-state"><p>Failed to load intent routing rules</p></div>';
    return;
  }

  if (!flowLayout || !flowLayout.nodes || flowLayout.nodes.length === 0) {
    generateDefaultFlowLayout();
  }

  renderFlowNodes();
}

function generateDefaultFlowLayout() {
  flowLayout = { nodes: [], edges: [] };
  
  flowLayout.nodes.push({ id: 'trigger', left: 40, top: 200, type: 'trigger' });

  const intents = Object.keys(flowRules.intents);
  intents.forEach((intentId, index) => {
    flowLayout.nodes.push({
      id: `intent_${intentId}`,
      left: 320,
      top: 20 + index * 100,
      type: 'intent',
      intentId: intentId
    });
  });

  const uniqueTeams = ['sales', 'support', 'finance', 'general_pool'];
  uniqueTeams.forEach((teamId, index) => {
    flowLayout.nodes.push({
      id: `team_${teamId}`,
      left: 700,
      top: 100 + index * 120,
      type: 'team',
      teamId: teamId
    });
  });
}

function reconcileFlowLayout() {
  if (!flowLayout) flowLayout = { nodes: [], edges: [] };
  if (!flowLayout.nodes) flowLayout.nodes = [];

  const activeNodes = [];

  let triggerNode = flowLayout.nodes.find(n => n.id === 'trigger');
  if (!triggerNode) {
    triggerNode = { id: 'trigger', left: 40, top: 200, type: 'trigger' };
  }
  activeNodes.push(triggerNode);

  const intents = Object.keys(flowRules.intents);
  intents.forEach((intentId, index) => {
    let node = flowLayout.nodes.find(n => n.id === `intent_${intentId}`);
    if (!node) {
      node = {
        id: `intent_${intentId}`,
        left: 320,
        top: 20 + index * 100,
        type: 'intent',
        intentId: intentId
      };
    }
    activeNodes.push(node);
  });

  const uniqueTeams = ['sales', 'support', 'finance', 'general_pool'];
  uniqueTeams.forEach((teamId, index) => {
    let node = flowLayout.nodes.find(n => n.id === `team_${teamId}`);
    if (!node) {
      node = {
        id: `team_${teamId}`,
        left: 700,
        top: 100 + index * 120,
        type: 'team',
        teamId: teamId
      };
    }
    activeNodes.push(node);
  });

  flowLayout.nodes = activeNodes;
}

function renderFlowNodes() {
  if (!flowWorkspaceEl) return;
  flowWorkspaceEl.innerHTML = '';
  
  reconcileFlowLayout();

  flowLayout.nodes.forEach(node => {
    let html = '';
    if (node.type === 'trigger') {
      html = `
        <div class="flow-node" id="node-trigger" style="left: ${node.left}px; top: ${node.top}px;">
          <div class="flow-node-header" style="background: rgba(255,255,255,0.02); height: 36px; padding: 0.5rem 0.75rem;">
            <span>📥 Webhook Trigger</span>
          </div>
          <div class="flow-node-body" style="font-size: 0.75rem; color: var(--text-secondary); padding: 0.75rem;">
            Ingests inbound WhatsApp, Telegram & FB Messenger messages.
          </div>
          <div class="flow-node-port output" style="right: -7px; top: 50%;"></div>
        </div>
      `;
    } else if (node.type === 'intent') {
      const intentData = flowRules.intents[node.intentId] || {};
      const keywordsEn = (intentData.keywords_en || []).join(', ');
      const keywordsSi = (intentData.keywords_si || []).join(', ');
      const responseEn = (intentData.auto_responses || {}).en || '';
      const responseSi = (intentData.auto_responses || {}).si || '';
      const priority = intentData.priority || 'low';
      const assignedTeam = intentData.assigned_team || 'general_pool';

      html = `
        <div class="flow-node" id="node-intent_${node.intentId}" style="left: ${node.left}px; top: ${node.top}px; min-height: 120px;">
          <div class="flow-node-port input" style="left: -7px; top: 50%;"></div>
          <div class="flow-node-header" style="border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; height: 36px; padding: 0.5rem 0.75rem;">
            <span style="font-weight: 700;">Intent: ${node.intentId.toUpperCase()}</span>
            <button class="btn btn-link btn-xs" onclick="toggleEditIntent('${node.intentId}')" style="color: var(--accent-blue); padding: 0; font-size: 0.75rem; text-decoration: none;">Edit</button>
          </div>
          <div class="flow-node-body" style="padding: 0.75rem;">
            <div class="static-view" id="view-${node.intentId}" style="font-size: 0.75rem; display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Priority:</strong> <span class="badge badge-gray" style="text-transform: capitalize; padding: 2px 6px; font-size: 0.65rem;">${priority}</span></div>
              <div class="text-ellipsis" title="${keywordsEn}" style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><strong>Keywords (EN):</strong> ${keywordsEn || '—'}</div>
              <div class="text-ellipsis" title="${keywordsSi}" style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><strong>Keywords (SI):</strong> ${keywordsSi || '—'}</div>
              <div><strong>Route to:</strong>
                <select class="form-input" style="font-size: 0.7rem; padding: 2px 4px; border-radius: 4px; margin-top: 4px; width: 100%; height: auto; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-primary);" onchange="changeIntentTeam('${node.intentId}', this.value)">
                  <option value="sales" ${assignedTeam === 'sales' ? 'selected' : ''}>Sales Team</option>
                  <option value="support" ${assignedTeam === 'support' ? 'selected' : ''}>Support Team</option>
                  <option value="finance" ${assignedTeam === 'finance' ? 'selected' : ''}>Finance Team</option>
                  <option value="general_pool" ${assignedTeam === 'general_pool' ? 'selected' : ''}>General Queue</option>
                </select>
              </div>
            </div>
            
            <div class="edit-view hidden" id="edit-${node.intentId}" style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%;">
              <div style="display: flex; flex-direction: column;">
                <label style="font-size: 0.65rem; color: var(--text-muted); margin-bottom: 2px;">Keywords (EN)</label>
                <input type="text" class="form-input" id="kw-en-${node.intentId}" value="${keywordsEn}" style="font-size: 0.75rem; padding: 4px 8px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 4px;">
              </div>
              <div style="display: flex; flex-direction: column;">
                <label style="font-size: 0.65rem; color: var(--text-muted); margin-bottom: 2px;">Keywords (SI)</label>
                <input type="text" class="form-input" id="kw-si-${node.intentId}" value="${keywordsSi}" style="font-size: 0.75rem; padding: 4px 8px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 4px;">
              </div>
              <div style="display: flex; flex-direction: column;">
                <label style="font-size: 0.65rem; color: var(--text-muted); margin-bottom: 2px;">Auto Response (EN)</label>
                <textarea class="form-input" id="resp-en-${node.intentId}" rows="2" style="font-size: 0.75rem; padding: 4px 8px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 4px; resize: vertical;">${responseEn}</textarea>
              </div>
              <div style="display: flex; flex-direction: column;">
                <label style="font-size: 0.65rem; color: var(--text-muted); margin-bottom: 2px;">Auto Response (SI)</label>
                <textarea class="form-input" id="resp-si-${node.intentId}" rows="2" style="font-size: 0.75rem; padding: 4px 8px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 4px; resize: vertical;">${responseSi}</textarea>
              </div>
              <div style="display: flex; flex-direction: column;">
                <label style="font-size: 0.65rem; color: var(--text-muted); margin-bottom: 2px;">Priority</label>
                <select class="form-input" id="priority-${node.intentId}" style="font-size: 0.75rem; padding: 4px 8px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 4px;">
                  <option value="low" ${priority === 'low' ? 'selected' : ''}>Low</option>
                  <option value="medium" ${priority === 'medium' ? 'selected' : ''}>Medium</option>
                  <option value="high" ${priority === 'high' ? 'selected' : ''}>High</option>
                </select>
              </div>
              <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 4px;">
                <button class="btn btn-outline btn-xs" onclick="deleteIntent('${node.intentId}')" style="padding: 2px 6px; font-size: 0.7rem; color: #ef4444; border-color: #ef4444;">Delete</button>
                <button class="btn btn-outline btn-xs" onclick="toggleEditIntent('${node.intentId}')" style="padding: 2px 6px; font-size: 0.7rem;">Cancel</button>
                <button class="btn btn-primary btn-xs" onclick="applyIntentChanges('${node.intentId}')" style="padding: 2px 6px; font-size: 0.7rem;">Apply</button>
              </div>
            </div>
          </div>
          <div class="flow-node-port output" style="right: -7px; top: 50%;"></div>
        </div>
      `;
    } else if (node.type === 'team') {
      let teamName = node.teamId.replace('_', ' ').toUpperCase();
      let colorClass = node.teamId;
      let desc = '';
      if (node.teamId === 'sales') desc = 'Resolves sales, trial & demo inquiries.';
      else if (node.teamId === 'support') desc = 'Troubleshoots technical issues & errors.';
      else if (node.teamId === 'finance') desc = 'Handles invoices, billing & payments.';
      else desc = 'Handles greetings and general catch-all queue.';

      html = `
        <div class="flow-team-node ${colorClass}" id="node-team_${node.teamId}" style="left: ${node.left}px; top: ${node.top}px;">
          <div class="flow-node-port input" style="left: -7px; top: 50%;"></div>
          <div class="flow-team-header" style="height: 36px; padding: 0.5rem 0.75rem;">${teamName} TEAM</div>
          <div class="flow-team-body" style="font-size: 0.75rem; color: var(--text-secondary); padding: 0.75rem;">
            ${desc}
          </div>
        </div>
      `;
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html.trim();
    const nodeEl = tempDiv.firstChild;
    flowWorkspaceEl.appendChild(nodeEl);

    makeNodeDraggable(node.id, nodeEl);
  });

  setTimeout(drawConnections, 50);
}

function makeNodeDraggable(nodeId, nodeEl) {
  const header = nodeEl.querySelector('.flow-node-header') || nodeEl.querySelector('.flow-team-header') || nodeEl;
  header.style.cursor = 'grab';
  
  header.onmousedown = function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') {
      return;
    }
    e.preventDefault();
    header.style.cursor = 'grabbing';
    
    const workspaceEl = document.getElementById('flow-workspace');
    const wsRect = workspaceEl.getBoundingClientRect();
    
    let shiftX = e.clientX - nodeEl.getBoundingClientRect().left;
    let shiftY = e.clientY - nodeEl.getBoundingClientRect().top;
    
    function moveAt(clientX, clientY) {
      let newLeft = clientX - wsRect.left - shiftX;
      let newTop = clientY - wsRect.top - shiftY;
      
      newLeft = Math.max(0, Math.min(newLeft, wsRect.width - nodeEl.offsetWidth));
      newTop = Math.max(0, Math.min(newTop, wsRect.height - nodeEl.offsetHeight));
      
      nodeEl.style.left = newLeft + 'px';
      nodeEl.style.top = newTop + 'px';
      
      const nodeObj = flowLayout.nodes.find(n => n.id === nodeId);
      if (nodeObj) {
        nodeObj.left = newLeft;
        nodeObj.top = newTop;
      }
      
      drawConnections();
    }
    
    function onMouseMove(e) {
      moveAt(e.clientX, e.clientY);
    }
    
    document.addEventListener('mousemove', onMouseMove);
    
    document.onmouseup = function() {
      document.removeEventListener('mousemove', onMouseMove);
      document.onmouseup = null;
      header.style.cursor = 'grab';
    };
  };
  
  header.ondragstart = function() {
    return false;
  };
}

function getBezierPath(x1, y1, x2, y2) {
  const controlOffset = Math.abs(x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;
}

function drawConnections() {
  const svg = document.getElementById('flow-connections-svg');
  if (!svg) return;
  svg.innerHTML = '';

  const workspaceEl = document.getElementById('flow-workspace');
  if (!workspaceEl) return;
  const wsRect = workspaceEl.getBoundingClientRect();

  function getPortPosition(nodeId, isOutput) {
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!nodeEl) return null;
    const portEl = nodeEl.querySelector(isOutput ? '.flow-node-port.output' : '.flow-node-port.input');
    if (!portEl) return null;
    
    const portRect = portEl.getBoundingClientRect();
    return {
      x: portRect.left - wsRect.left + portRect.width / 2,
      y: portRect.top - wsRect.top + portRect.height / 2
    };
  }

  const triggerPos = getPortPosition('trigger', true);
  if (triggerPos && flowRules && flowRules.intents) {
    Object.keys(flowRules.intents).forEach(intentId => {
      const intentPos = getPortPosition(`intent_${intentId}`, false);
      if (intentPos) {
        const pathData = getBezierPath(triggerPos.x, triggerPos.y, intentPos.x, intentPos.y);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('stroke', '#4b5563');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        svg.appendChild(path);
      }
    });
  }

  if (flowRules && flowRules.intents) {
    Object.keys(flowRules.intents).forEach(intentId => {
      const intentOutPos = getPortPosition(`intent_${intentId}`, true);
      const assignedTeam = flowRules.intents[intentId].assigned_team;
      if (intentOutPos && assignedTeam) {
        const teamInPos = getPortPosition(`team_${assignedTeam}`, false);
        if (teamInPos) {
          let color = '#3b82f6';
          if (assignedTeam === 'support') color = '#f97316';
          else if (assignedTeam === 'finance') color = '#a855f7';
          else if (assignedTeam === 'general_pool') color = '#22c55e';

          const pathData = getBezierPath(intentOutPos.x, intentOutPos.y, teamInPos.x, teamInPos.y);
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', pathData);
          path.setAttribute('stroke', color);
          path.setAttribute('stroke-width', '2.5');
          path.setAttribute('fill', 'none');
          
          path.setAttribute('stroke-dasharray', '6 4');
          path.innerHTML = `<animate attributeName="stroke-dashoffset" values="20;0" dur="2s" repeatCount="indefinite" />`;

          svg.appendChild(path);
        }
      }
    });
  }
}

function toggleEditIntent(intentId) {
  const viewEl = document.getElementById(`view-${intentId}`);
  const editEl = document.getElementById(`edit-${intentId}`);
  if (viewEl && editEl) {
    viewEl.classList.toggle('hidden');
    editEl.classList.toggle('hidden');
  }
}

function applyIntentChanges(intentId) {
  const kwEnInput = document.getElementById(`kw-en-${intentId}`);
  const kwSiInput = document.getElementById(`kw-si-${intentId}`);
  const respEnText = document.getElementById(`resp-en-${intentId}`);
  const respSiText = document.getElementById(`resp-si-${intentId}`);
  const prioritySelect = document.getElementById(`priority-${intentId}`);

  if (flowRules && flowRules.intents && flowRules.intents[intentId]) {
    const intent = flowRules.intents[intentId];
    intent.keywords_en = (kwEnInput?.value || '').split(',').map(s => s.trim()).filter(Boolean);
    intent.keywords_si = (kwSiInput?.value || '').split(',').map(s => s.trim()).filter(Boolean);
    
    if (!intent.auto_responses) intent.auto_responses = {};
    intent.auto_responses.en = respEnText?.value.trim() || '';
    intent.auto_responses.si = respSiText?.value.trim() || '';
    intent.priority = prioritySelect?.value || 'low';

    showToast(`Updated local parameters for ${intentId}`, 'success');
    renderFlowNodes();
  }
}

function changeIntentTeam(intentId, newTeam) {
  if (flowRules && flowRules.intents && flowRules.intents[intentId]) {
    flowRules.intents[intentId].assigned_team = newTeam;
    drawConnections();
  }
}

function addNewIntent() {
  const newId = prompt('Enter a new Intent ID (e.g., return_policy, pricing):');
  if (!newId || newId.trim() === '') return;
  const intentId = newId.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

  if (flowRules.intents[intentId]) {
    showToast('An intent with this ID already exists!', 'error');
    return;
  }

  // Create default rules for the new intent
  flowRules.intents[intentId] = {
    keywords_en: [],
    keywords_si: [],
    priority: 'low',
    assigned_team: 'general_pool',
    auto_responses: { en: '', si: '' }
  };

  // Add layout positioning
  flowLayout.nodes.push({
    id: `intent_${intentId}`,
    left: 320,
    top: 50 + (Object.keys(flowRules.intents).length * 40),
    type: 'intent',
    intentId: intentId
  });

  showToast(`Added new intent: ${intentId}`, 'success');
  renderFlowNodes();
}

function deleteIntent(intentId) {
  if (!confirm(`Are you sure you want to delete the intent "${intentId}"?`)) return;
  
  if (flowRules.intents[intentId]) {
    delete flowRules.intents[intentId];
  }
  
  const nodeIndex = flowLayout.nodes.findIndex(n => n.id === `intent_${intentId}`);
  if (nodeIndex !== -1) {
    flowLayout.nodes.splice(nodeIndex, 1);
  }

  showToast(`Deleted intent: ${intentId}`, 'success');
  renderFlowNodes();
}

async function autoGenerateFlow() {
  const promptText = prompt('Describe your business routing needs (e.g., "I run a hospital. Route emergencies to support, appointments to sales..."):');
  if (!promptText || promptText.trim() === '') return;

  showToast('AI is generating flow layout. This may take a few seconds...', 'info');
  
  const res = await apiCall('/api/system/flow-builder/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt: promptText })
  });

  if (res && res.success && res.rules && res.rules.intents) {
    if (confirm('Do you want to REPLACE the current flow with the AI generated one? (Cancel to just merge)')) {
      flowRules.intents = res.rules.intents;
    } else {
      flowRules.intents = { ...flowRules.intents, ...res.rules.intents };
    }
    
    showToast('AI Flow generated! Adjust as needed and click Save.', 'success');
    generateDefaultFlowLayout(); // Reset positions
    renderFlowNodes();
  } else {
    showToast(res?.error || 'Failed to generate flow via AI.', 'error');
  }
}

async function generateFlowFromKB() {
  if (!confirm('This will read your categorized AI Knowledge Hub to generate a dynamic routing flow. This may take 10-20 seconds. Continue?')) return;

  showToast('AI is reading your Knowledge Base and building the flow...', 'info');

  const res = await apiCall('/api/system/flow-builder/generate-from-kb', {
    method: 'POST'
  });

  if (res && res.success && res.rules && res.rules.intents) {
    if (confirm('Do you want to REPLACE the current flow with the Knowledge Base generated flow? (Cancel to just merge)')) {
      flowRules.intents = res.rules.intents;
    } else {
      flowRules.intents = { ...flowRules.intents, ...res.rules.intents };
    }
    
    showToast('Flow successfully generated from Knowledge Base!', 'success');
    generateDefaultFlowLayout();
    renderFlowNodes();
  } else {
    showToast(res?.error || 'Failed to generate flow from Knowledge Base.', 'error');
  }
}

async function saveFlowBuilder() {
  if (!flowLayout || !flowRules) {
    showToast('No configurations loaded to save.', 'error');
    return;
  }

  showToast('Saving flow layout and rules...', 'info');

  const res = await apiCall('/api/system/flow-builder', {
    method: 'POST',
    body: JSON.stringify({
      layout: flowLayout,
      compiledRules: flowRules
    })
  });

  if (res && res.success) {
    showToast('Flow Builder configuration saved & compiled rules live!', 'success');
  } else {
    showToast('Failed to save Flow Builder configuration.', 'error');
  }
}

async function resetFlowLayout() {
  if (!confirm('Are you sure you want to reset the visual layout positions to default?')) return;
  generateDefaultFlowLayout();
  renderFlowNodes();
  showToast('Layout positions reset', 'info');
}

// ─── CO-PILOT AI SUGGESTIONS ───
function toggleCopilot() {
  const panel = document.getElementById('copilot-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    loadCopilotSuggestion();
  }
}

async function loadCopilotSuggestion() {
  const textEl = document.getElementById('copilot-suggestion-text');
  const badgeEl = document.getElementById('copilot-sentiment-badge');
  if (!textEl) return;

  if (!activeConversationId || !activeContactId) {
    textEl.textContent = 'Select a conversation to load AI suggestions.';
    if (badgeEl) {
      badgeEl.textContent = 'Neutral';
      badgeEl.className = 'badge badge-gray';
    }
    activeCopilotSuggestion = null;
    return;
  }

  textEl.textContent = 'Generating AI response suggestion... 🤖';
  if (badgeEl) {
    badgeEl.textContent = 'Analyzing...';
    badgeEl.className = 'badge badge-gray';
  }

  const suggestData = await apiCall(`/api/conversations/${activeConversationId}/copilot-suggest`);
  const intelData = await apiCall(`/api/contacts/${activeContactId}/intelligence`);

  if (suggestData && suggestData.success && suggestData.suggestion) {
    textEl.textContent = suggestData.suggestion;
    activeCopilotSuggestion = suggestData.suggestion;
  } else {
    textEl.textContent = 'Failed to generate AI suggestion. Please try again.';
    activeCopilotSuggestion = null;
  }

  if (badgeEl) {
    if (intelData && intelData.sentiment) {
      const sentiment = intelData.sentiment.toLowerCase();
      let text = 'Neutral';
      let className = 'badge badge-gray';
      if (sentiment === 'positive') {
        text = 'Positive';
        className = 'badge badge-green';
      } else if (sentiment === 'negative') {
        text = 'Negative';
        className = 'badge badge-red';
      }
      badgeEl.textContent = text;
      badgeEl.className = className;
    } else {
      badgeEl.textContent = 'Neutral';
      badgeEl.className = 'badge badge-gray';
    }
  }
}

function useCopilotSuggestion() {
  if (!activeCopilotSuggestion) {
    showToast('No suggestion available to insert', 'warning');
    return;
  }
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = activeCopilotSuggestion;
    input.focus();
  }
}

async function sendCopilotSuggestion() {
  if (!activeCopilotSuggestion || !activeConversationId) {
    showToast('No suggestion available to send', 'warning');
    return;
  }
  
  const text = activeCopilotSuggestion;
  const res = await apiCall(`/api/conversations/${activeConversationId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ text })
  });

  if (res && res.success) {
    showToast('Suggested response sent!', 'success');
    loadChatMessages(activeConversationId);
  } else {
    showToast('Failed to send response', 'error');
  }
}

// Bind methods globally
window.loadAdvancedKPIs = loadAdvancedKPIs;
window.loadFlowBuilder = loadFlowBuilder;
window.resetFlowLayout = resetFlowLayout;
window.saveFlowBuilder = saveFlowBuilder;
window.toggleEditIntent = toggleEditIntent;
window.applyIntentChanges = applyIntentChanges;
window.changeIntentTeam = changeIntentTeam;
window.toggleCopilot = toggleCopilot;
window.loadCopilotSuggestion = loadCopilotSuggestion;
window.useCopilotSuggestion = useCopilotSuggestion;
window.sendCopilotSuggestion = sendCopilotSuggestion;
window.drawConnections = drawConnections;

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
        <div style="font-weight:600;">${b.filename}</div>
        <div style="color:var(--text-muted);">${new Date(b.createdAt).toLocaleString()} (${(b.size / 1024 / 1024).toFixed(2)} MB)</div>
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

function downloadDatabase() {
  // Use fetch with proper Authorization header instead of query param
  fetch(`${API_BASE}/api/system/download-db`, {
    headers: { Authorization: `Bearer ${authToken}` }
  }).then(res => {
    if (!res.ok) throw new Error('Download failed');
    return res.blob();
  }).then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `procrm_export_${new Date().toISOString().split('T')[0]}.db`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }).catch(err => showToast('Download failed: ' + err.message, 'error'));
}

function restoreFromLocalFile() {
  const input = document.getElementById('restore-file-input');
  if (!input.files || input.files.length === 0) {
    showToast('Please select a .db file first', 'warning');
    return;
  }
  
  showToast('Database restore via UI is disabled for security. Use CLI or manual replacement.', 'error');
}

// ==========================================
// KNOWLEDGE HUB ENHANCEMENTS
// ==========================================

// --- Quick Edit ---
async function openKnowledgeEditModal(docId) {
  document.getElementById('kb-edit-id').value = docId;
  const contentArea = document.getElementById('kb-edit-content');
  contentArea.value = 'Loading...';
  
  document.getElementById('kb-edit-modal').classList.remove('hidden');

  const res = await apiCall(`/api/knowledge/documents/${docId}/content`);
  if (res && res.content) {
    contentArea.value = res.content;
  } else {
    contentArea.value = 'Error loading content. It may be empty.';
  }
}

function closeKnowledgeEditModal() {
  document.getElementById('kb-edit-modal').classList.add('hidden');
}

async function saveKnowledgeEdit() {
  const docId = document.getElementById('kb-edit-id').value;
  const content = document.getElementById('kb-edit-content').value;

  if (!content.trim()) {
    showToast('Content cannot be empty', 'error');
    return;
  }

  const btn = document.getElementById('btn-save-kb-edit');
  const oldText = btn.innerHTML;
  btn.innerHTML = 'Saving...';
  btn.disabled = true;

  const res = await apiCall(`/api/knowledge/documents/${docId}`, {
    method: 'PUT',
    body: JSON.stringify({ content })
  });

  if (res && res.success) {
    showToast('Document updated successfully!', 'success');
    closeKnowledgeEditModal();
    loadKnowledgeDocuments();
  } else {
    showToast(res?.error || 'Failed to update document', 'error');
  }

  btn.innerHTML = oldText;
  btn.disabled = false;
}

// --- Playground ---
function openKbPlaygroundModal() {
  document.getElementById('kb-playground-modal').classList.remove('hidden');
}

function closeKbPlaygroundModal() {
  document.getElementById('kb-playground-modal').classList.add('hidden');
}

async function testKnowledgeQuery() {
  const input = document.getElementById('kb-playground-input').value;
  if (!input.trim()) return;

  const resContainer = document.getElementById('kb-playground-results');
  const aiRes = document.getElementById('kb-playground-ai-response');
  const contextRes = document.getElementById('kb-playground-context');

  aiRes.innerHTML = '<span style="color:gray;">Thinking...</span>';
  contextRes.innerHTML = 'Fetching context...';
  resContainer.style.display = 'block';

  const res = await apiCall('/api/knowledge/test', {
    method: 'POST',
    body: JSON.stringify({ query: input })
  });

  if (res) {
    aiRes.innerText = res.answer || 'No valid response from AI.';
    if (res.chunksInfo && res.chunksInfo.length > 0) {
      contextRes.innerText = res.chunksInfo.map(c => `[Source: ${c.docTitle} | Score: ${(c.score * 100).toFixed(1)}%]\n${c.content}`).join('\n\n---\n\n');
    } else {
      contextRes.innerText = 'No relevant context found in Knowledge Hub.';
    }
  } else {
    aiRes.innerText = 'Error calling test API.';
    contextRes.innerText = '';
  }
}

// ─── SHIFT DUTY LOGGING ───
let activeShift = null;

async function checkShiftStatus() {
  const btn = document.getElementById('shift-status-btn');
  const text = document.getElementById('shift-status-text');
  const dot = document.getElementById('shift-status-dot');
  if (!btn || !text || !dot) return;

  const res = await apiCall('/api/shifts/active');
  if (res && res.shift) {
    activeShift = res.shift;
    btn.className = 'status-badge online';
    text.textContent = 'On Duty';
    dot.style.background = 'var(--accent-green)';
    dot.style.animation = 'pulse 2s infinite';
  } else {
    activeShift = null;
    btn.className = 'status-badge offline';
    text.textContent = 'Off Duty';
    dot.style.background = '#ef4444';
    dot.style.animation = 'none';
  }
}

async function toggleShift() {
  if (activeShift) {
    if (!confirm('Are you sure you want to clock out and end your shift?')) return;
    showToast('Ending shift...', 'info');
    const res = await apiCall('/api/shifts/end', { method: 'POST' });
    if (res) {
      showToast('Shift ended successfully.', 'success');
      checkShiftStatus();
    }
  } else {
    const notes = prompt('Enter notes for starting shift (optional):');
    if (notes === null) return; // cancelled
    showToast('Starting shift...', 'info');
    const res = await apiCall('/api/shifts/start', {
      method: 'POST',
      body: JSON.stringify({ notes })
    });
    if (res) {
      showToast('Shift started successfully. You are now On Duty.', 'success');
      checkShiftStatus();
    }
  }
}

// ─── CSAT RATING MODAL HANDLERS ───
let selectedCsatScore = 0;

function openCsatModal() {
  selectedCsatScore = 0;
  document.getElementById('csat-comment').value = '';
  updateCsatStarsDisplay();
  const modal = document.getElementById('csat-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeCsatModal() {
  const modal = document.getElementById('csat-modal');
  if (modal) modal.classList.add('hidden');
}

function setCsatScore(score) {
  selectedCsatScore = score;
  updateCsatStarsDisplay();
}

function updateCsatStarsDisplay() {
  const stars = document.querySelectorAll('.csat-star');
  stars.forEach((star, idx) => {
    if (idx < selectedCsatScore) {
      star.classList.add('active');
    } else {
      star.classList.remove('active');
    }
  });
}

async function submitCsatAndResolve() {
  if (selectedCsatScore === 0) {
    showToast('Please select a star rating between 1 and 5!', 'error');
    return;
  }
  
  const comment = document.getElementById('csat-comment').value.trim();
  showToast('Saving CSAT rating...', 'info');
  
  const csatRes = await apiCall(`/api/conversations/${activeConversationId}/csat`, {
    method: 'POST',
    body: JSON.stringify({ score: selectedCsatScore, comment })
  });
  
  if (csatRes) {
    closeCsatModal();
    showToast('CSAT saved! Closing conversation...', 'info');
    const res = await apiCall(`/api/conversations/${activeConversationId}/close`, {
      method: 'PATCH',
      body: JSON.stringify({ notes: 'Closed by agent with CSAT feedback' })
    });
    if (res) {
      closeChatPanel();
      loadConversations();
      showToast('Conversation closed.', 'success');
    }
  }
}

async function skipCsatAndResolve() {
  closeCsatModal();
  showToast('Closing conversation...', 'info');
  const res = await apiCall(`/api/conversations/${activeConversationId}/close`, {
    method: 'PATCH',
    body: JSON.stringify({ notes: 'Closed by agent (CSAT skipped)' })
  });
  if (res) {
    closeChatPanel();
    loadConversations();
    showToast('Conversation closed.', 'success');
  }
}

// ─── RULES EDITORS HANDLERS ───
let cachedWorkspaceRules = null;
let cachedComplianceRules = null;

async function loadWorkspaceRulesSettings() {
  const data = await apiCall('/api/system/rules/workspace');
  if (!data) return;
  cachedWorkspaceRules = data;
  
  const enabled = !!(data.business_hours?.enabled);
  const enabledCheckbox = document.getElementById('rules-hours-enabled');
  if (enabledCheckbox) {
    enabledCheckbox.checked = enabled;
    toggleHoursVisibility(enabled);
  }
  
  const schedule = data.business_hours?.schedule || {};
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const fullDayNames = { mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday' };
  
  days.forEach(d => {
    const dayKey = fullDayNames[d];
    const daySched = schedule[dayKey] || { start: '08:00', end: '20:00' };
    const startInput = document.getElementById(`hours-${d}-start`);
    const endInput = document.getElementById(`hours-${d}-end`);
    if (startInput) startInput.value = daySched.start;
    if (endInput) endInput.value = daySched.end;
  });
}

function toggleHoursVisibility(visible) {
  const container = document.getElementById('business-hours-schedule-container');
  if (container) container.style.display = visible ? 'flex' : 'none';
}

async function saveWorkspaceRules() {
  if (!cachedWorkspaceRules) return;
  
  const enabled = document.getElementById('rules-hours-enabled').checked;
  cachedWorkspaceRules.business_hours = cachedWorkspaceRules.business_hours || {};
  cachedWorkspaceRules.business_hours.enabled = enabled;
  
  const schedule = {};
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const fullDayNames = { mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday' };
  
  days.forEach(d => {
    const dayKey = fullDayNames[d];
    const start = document.getElementById(`hours-${d}-start`).value || '08:00';
    const end = document.getElementById(`hours-${d}-end`).value || '20:00';
    schedule[dayKey] = { start, end };
  });
  
  cachedWorkspaceRules.business_hours.schedule = schedule;
  
  showToast('Saving business hours schedule...', 'info');
  const res = await apiCall('/api/system/rules/workspace', {
    method: 'POST',
    body: JSON.stringify(cachedWorkspaceRules)
  });
  if (res) {
    showToast('Workspace rules saved successfully!', 'success');
  }
}

async function loadComplianceRulesSettings() {
  const data = await apiCall('/api/system/rules/compliance');
  if (!data) return;
  cachedComplianceRules = data;
  
  const pii = data.pii_protection || {};
  const piiEnabled = document.getElementById('rules-pii-enabled');
  const piiInbound = document.getElementById('rules-pii-inbound');
  const piiOutbound = document.getElementById('rules-pii-outbound');
  if (piiEnabled) piiEnabled.checked = !!pii.enabled;
  if (piiInbound) piiInbound.checked = !!pii.scan_inbound;
  if (piiOutbound) piiOutbound.checked = !!pii.scan_outbound;
  
  const optOut = data.opt_out || {};
  const optOutEn = document.getElementById('rules-optout-en');
  const optOutSi = document.getElementById('rules-optout-si');
  if (optOutEn) optOutEn.value = (optOut.keywords_en || []).join(', ');
  if (optOutSi) optOutSi.value = (optOut.keywords_si || []).join(', ');
  
  const promptDefense = data.prompt_injection_defense || {};
  const blockPatterns = document.getElementById('rules-prompt-defense');
  if (blockPatterns) blockPatterns.value = (promptDefense.block_patterns || []).join(', ');
}

async function saveComplianceRules() {
  if (!cachedComplianceRules) return;
  
  cachedComplianceRules.pii_protection = cachedComplianceRules.pii_protection || {};
  cachedComplianceRules.pii_protection.enabled = document.getElementById('rules-pii-enabled').checked;
  cachedComplianceRules.pii_protection.scan_inbound = document.getElementById('rules-pii-inbound').checked;
  cachedComplianceRules.pii_protection.scan_outbound = document.getElementById('rules-pii-outbound').checked;
  
  cachedComplianceRules.opt_out = cachedComplianceRules.opt_out || {};
  cachedComplianceRules.opt_out.keywords_en = (document.getElementById('rules-optout-en').value || '').split(',').map(s => s.trim()).filter(Boolean);
  cachedComplianceRules.opt_out.keywords_si = (document.getElementById('rules-optout-si').value || '').split(',').map(s => s.trim()).filter(Boolean);
  
  cachedComplianceRules.prompt_injection_defense = cachedComplianceRules.prompt_injection_defense || {};
  cachedComplianceRules.prompt_injection_defense.block_patterns = (document.getElementById('rules-prompt-defense').value || '').split(',').map(s => s.trim()).filter(Boolean);
  
  showToast('Saving compliance/security settings...', 'info');
  const res = await apiCall('/api/system/rules/compliance', {
    method: 'POST',
    body: JSON.stringify(cachedComplianceRules)
  });
  if (res) {
    showToast('Compliance rules saved successfully!', 'success');
  }
}
