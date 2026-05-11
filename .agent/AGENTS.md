# 🤖 Pro CRM — AI Agent Definitions

> **System Version:** 2.1.0
> **Deployment:** Node.js + Express + BullMQ + PostgreSQL + Meta Cloud API
> **Language Support:** Sinhala (සිංහල) | English (en) | Auto-detect

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  INCOMING MESSAGE                   │
│              (Meta Cloud API Webhook)               │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  PRE-FILTER    │ ← Spam, Opt-out, Block check
              │  AGENT         │
              └───────┬────────┘
                      │
                      ▼
              ┌────────────────┐
              │  ORCHESTRATOR  │ ← Intent detection + AI generation
              │  AGENT         │
              └───────┬────────┘
                      │
                      ▼
              ┌────────────────┐
              │  COMPLIANCE    │ ← PII mask, 24h window, tone check
              │  AGENT         │
              └───────┬────────┘
                      │
                      ▼
              ┌────────────────┐
              │  ROUTING       │ ← auto_send / human_queue / template
              │  AGENT         │
              └───────┬────────┘
                      │
                      ▼
              ┌────────────────┐
              │  AUDIT LOGGER  │ ← Full decision trail
              └────────────────┘
```

---

## 📋 Agent Definitions

### 1. `pre_filter_agent`

- **Role:** Gatekeeper — validates every inbound message before processing.
- **Trigger:** Webhook `POST /api/webhook/whatsapp`
- **Actions:**
  - Check sender status: `active` | `unsubscribed` | `blocked`
  - Detect spam patterns (rate limiting, repetition, known spam signatures)
  - Enforce business hours from `workspace-rules.json`
  - Detect opt-out keywords in Sinhala and English
  - Flag messages from unknown senders for lead capture
- **Output:** `{ pass: boolean, flags: string[], sender_status: string }`
- **Rules File:** `rules/workspace-rules.json` → `business_hours`, `spam_detection`
- **Fail Behavior:** If sender is blocked → `suppress`. If unsubscribed → `opt_out_confirm`. If spam → `drop`.

---

### 2. `orchestrator_agent` (Primary)

- **Role:** Central AI Engine — processes intent, generates responses, manages conversation flow.
- **Trigger:** Passes pre-filter check with `pass: true`
- **Actions:**
  - Load conversation history from PostgreSQL (last 10 messages)
  - Detect intent using keyword matching + AI classification
  - Generate response using Gemini API with system context
  - Enforce `max_tokens_per_reply` and `temperature: 0.6`
  - Match language (Sinhala/English/Mixed) automatically
  - Apply confidence scoring (0.0 - 1.0)
- **Output:** Structured JSON matching the core output schema
- **Rules Files:**
  - `rules/agent-rules.json` → `ai_config`, `response_limits`
  - `rules/intent-routing.json` → keyword maps, team assignments
- **Fail Behavior:** If AI API fails → `next_action: "human_queue"`, `flags: ["ai_error"]`
- **Confidence Threshold:** `0.7` (below → `requires_human_review: true`)

---

### 3. `compliance_agent`

- **Role:** Policy Enforcer — validates every outbound message for regulatory compliance.
- **Trigger:** After orchestrator generates a response, before routing.
- **Actions:**
  - **24h Window Check:** Verify last user message timestamp. If >24h → force `template_required`.
  - **PII Scanning:** Regex + pattern matching for phone numbers, NIC, emails, bank details. Mask all detected PII.
  - **Tone Validation:** Ensure response is professional, culturally appropriate, and non-aggressive.
  - **Template Compliance:** If outside conversational window → validate against approved Meta templates.
  - **Prompt Injection Defense:** Strip markdown injection, role-switching attempts, system prompt extraction.
  - **GDPR/CCPA Check:** Ensure no personal data is stored beyond retention period.
- **Output:** `{ compliant: boolean, violations: string[], modified_reply: string | null }`
- **Rules File:** `rules/compliance-rules.json`
- **Fail Behavior:** If non-compliant → block send, flag for human review, log violation.

---

### 4. `routing_agent`

- **Role:** Message Dispatcher — determines final action for every processed message.
- **Trigger:** After compliance validation.
- **Actions:**
  - Route to appropriate team based on intent + rules
  - Determine action: `auto_send` | `human_queue` | `template_required` | `suppress`
  - Check SLA status and flag breaches
  - Handle escalation chains (repeated failures → manager notification)
  - Manage queue priority (VIP, SLA breach, first contact)
- **Output:** Final structured JSON response
- **Rules File:** `rules/agent-rules.json` → `routing`, `sla_config`, `escalation`
- **Fail Behavior:** If routing unclear → default to `human_queue` + `general_pool`

---

### 5. `audit_logger_agent`

- **Role:** Compliance Recorder — creates immutable audit trail for every decision.
- **Trigger:** After every agent action (pre-filter, orchestrator, compliance, routing).
- **Actions:**
  - Log: `{ message_id, intent, confidence, rule_applied, action, timestamp, agent_id }`
  - Store in PostgreSQL `audit_logs` table
  - Flag anomalies (sudden spike, repeated escalations, policy violations)
  - Generate daily compliance reports
- **Output:** `{ logged: boolean, log_id: string }`
- **Rules File:** N/A (always active, no bypass)
- **Fail Behavior:** If logging fails → halt message processing, alert ops team.

---

## 🔗 Agent Communication Protocol

| From | To | Data Passed |
|------|-----|-------------|
| Webhook | `pre_filter_agent` | Raw message payload |
| `pre_filter_agent` | `orchestrator_agent` | Validated message + sender status + flags |
| `orchestrator_agent` | `compliance_agent` | Generated reply + intent + confidence |
| `compliance_agent` | `routing_agent` | Compliant reply + violation flags |
| `routing_agent` | Meta Cloud API / Queue | Final JSON response |
| All Agents | `audit_logger_agent` | Decision metadata |

---

## ⚙️ Configuration Hierarchy

1. `rules/workspace-rules.json` — Global workspace settings (hours, limits, features)
2. `rules/agent-rules.json` — AI behavior, SLA, escalation, routing logic
3. `rules/compliance-rules.json` — GDPR, Meta policy, PII patterns, opt-out
4. `rules/intent-routing.json` — Keyword maps, intent classification, team assignments
5. `rules/templates.json` — Pre-approved Meta WhatsApp message templates

---

## 🚨 Escalation Chain

```
Level 0: AI auto-response (confidence ≥ 0.7)
Level 1: Human agent queue (confidence < 0.7 OR policy flag)
Level 2: Team lead notification (2+ consecutive escalations)
Level 3: Manager alert (SLA breach OR compliance violation)
Level 4: System halt (critical security/data breach)
```

---

## 📊 Monitoring & Health

- **Heartbeat:** Each agent reports health every 60s to `/api/health`
- **Metrics:** Response time, confidence distribution, escalation rate, SLA compliance %
- **Alerts:** Slack/Email on SLA breach, compliance violation, agent failure
- **Dashboard:** Real-time agent status at `/admin/agents`
