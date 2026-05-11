# 🚀 Pro CRM — WhatsApp Business CRM

> Production-grade WhatsApp CRM integrated with **Meta Cloud API** & **Google Gemini AI**
> Built for Sri Lankan businesses with full **Sinhala (සිංහල)** & **English** support

![Version](https://img.shields.io/badge/version-2.1.0-green)
![Node](https://img.shields.io/badge/node-%3E%3D18-blue)
![License](https://img.shields.io/badge/license-MIT-orange)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🤖 **AI-Powered Replies** | Gemini AI generates contextual responses in Sinhala & English |
| 📱 **Meta Cloud API** | Direct WhatsApp Business integration (v21.0) |
| 🔄 **5-Stage Pipeline** | PreFilter → Orchestrator → Compliance → Routing → Audit |
| 🛡️ **Full Compliance** | GDPR, CCPA, Meta WhatsApp Business Policy 2025+ |
| 🔒 **PII Protection** | Auto-detect & mask phone, NIC, email, credit cards |
| ⏰ **24h Window** | Automatic template fallback outside conversational window |
| 📊 **Admin Dashboard** | Real-time CRM dashboard with chat simulator |
| 🏷️ **Lead Scoring** | Automatic contact scoring and nurture sequences |
| 📋 **Audit Trail** | Immutable decision log for every message |
| 🌍 **Bilingual** | Sinhala + English auto-detection and response |

---

## 🏗️ Architecture

```
Incoming Message (Meta Webhook)
        │
        ▼
┌──────────────┐
│  Pre-Filter  │ → Spam, opt-out, blocked, business hours
└──────┬───────┘
       ▼
┌──────────────┐
│ Orchestrator │ → Intent detection + AI response generation
└──────┬───────┘
       ▼
┌──────────────┐
│  Compliance  │ → PII masking, prompt injection defense, tone
└──────┬───────┘
       ▼
┌──────────────┐
│   Routing    │ → auto_send / human_queue / template / suppress
└──────┬───────┘
       ▼
┌──────────────┐
│ Audit Logger │ → Immutable decision trail
└──────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** ≥ 18
- **Docker** (for PostgreSQL + Redis)
- **Meta WhatsApp Business Account** (for production)
- **Google Gemini API Key** (for AI responses)

### 1. Clone & Install
```bash
git clone <repo-url>
cd pro-crm
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Start Services (Docker)
```bash
npm run docker:up
# Starts PostgreSQL + Redis containers
```

### 4. Setup Database
```bash
npm run db:migrate   # Run migrations
npm run db:seed      # Create admin user + sample data
```

### 5. Start Server
```bash
npm run dev          # Development with hot-reload
# or
npm start            # Production
```

### 6. Access
- 🌐 **Server:** http://localhost:3000
- 📊 **Dashboard:** http://localhost:3000/admin
- 💚 **Health:** http://localhost:3000/api/health
- 🧪 **Simulator:** http://localhost:3000/admin → Simulator tab

### Default Login
```
Email:    admin@procrm.com
Password: admin123
```

---

## 📁 Project Structure

```
pro-crm/
├── .agent/rules/           # AI agent rules & configuration
├── src/
│   ├── index.js            # Express server entry
│   ├── config/             # Database, Redis, environment
│   ├── agents/             # 5 AI processing agents
│   ├── pipeline/           # Message processing orchestrator
│   ├── services/           # WhatsApp, Gemini, contacts, conversations
│   ├── routes/             # Webhook, API, health, test
│   ├── middleware/         # Auth, rate limiting, error handling
│   ├── queues/             # BullMQ message queue
│   ├── dashboard/public/   # Admin dashboard (SPA)
│   └── utils/              # Logger, PII masker, language detection
├── db/                     # Migrations & seed scripts
├── docker-compose.yml      # PostgreSQL + Redis
└── .env.example            # Environment template
```

---

## 🔑 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/health` | ❌ | System health check |
| `GET` | `/api/webhook/whatsapp` | ❌ | Meta webhook verification |
| `POST` | `/api/webhook/whatsapp` | ❌ | Incoming messages |
| `POST` | `/api/auth/login` | ❌ | Agent login |
| `GET` | `/api/contacts` | ✅ | List contacts |
| `GET` | `/api/conversations` | ✅ | List conversations |
| `GET` | `/api/audit-logs` | ✅ | View audit logs |
| `GET` | `/api/dashboard/stats` | ✅ | Dashboard statistics |
| `POST` | `/api/test/simulate` | ❌ | Simulate message (dev only) |
| `GET` | `/api/test/intents` | ❌ | Test intent detection (dev only) |

---

## 🛡️ Security & Compliance

- **Meta Policy 2025+** — 24h window, template enforcement, opt-in/out
- **GDPR/CCPA** — Data minimization, right to erasure, consent management
- **PII Protection** — Auto-mask phone, NIC, email, credit cards
- **Prompt Injection** — Pattern detection and sanitization
- **JWT Auth** — Role-based access control (admin/manager/agent)
- **Rate Limiting** — API and webhook rate limits

---

## 📜 Available Scripts

```bash
npm run dev          # Start with hot-reload
npm start            # Production start
npm run db:migrate   # Run database migrations
npm run db:seed      # Seed database with sample data
npm run db:setup     # Migrate + seed in one command
npm run simulate     # CLI message simulator
npm run docker:up    # Start Docker services
npm run docker:down  # Stop Docker services
npm run setup        # Full setup (Docker + migrate + seed)
```

---

## 🌍 Language Support

The system auto-detects Sinhala and English based on Unicode character analysis:

| Input | Detected | Response Language |
|-------|----------|-------------------|
| `ආයුබෝවන්` | 🇱🇰 Sinhala | Sinhala |
| `Hello` | 🇬🇧 English | English |
| `මට help කරන්න` | 🔀 Mixed | Sinhala (primary) |

---

## 📄 License

MIT — Built by **Vieora Digital Solutions**
