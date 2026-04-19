# Project Management Software

A Jira-style project management tool with TypeScript, PostgreSQL, and Home Assistant MQTT integration.

## Features
- **Project-specific Pages:** Each project has its own dedicated page.
- **Kanban Board:** Per-project boards with TODO, IN_PROGRESS, and DONE columns.
- **Tagging System:** Create global tags and assign them to projects or tasks.
- **Deadlines:** Set and track deadlines for projects and tasks.
- **Home Assistant Integration:** Automatic MQTT discovery and state announcements.

## Setup

### Prerequisites
- Node.js (v18+)
- Docker & Docker Compose (for Postgres and MQTT Broker)

### 1. Infrastructure
Start the database and MQTT broker:
```bash
docker-compose up -d
```

### 2. Backend
```bash
cd server
npm install
# Create .env file with your DB/MQTT credentials if different from defaults
npm run dev
```

### 3. Frontend
```bash
cd client
npm install
npm run dev
```

The application will be available at `http://localhost:5173`.

## MQTT & Home Assistant
The system automatically announces new projects and tasks to Home Assistant using MQTT Discovery.
- **Discovery Topic:** `homeassistant/sensor/project_mgmt_{type}_{id}/config`
- **State Topic:** `project_mgmt/{type}/{id}/state`

When a project or task status changes, it is immediately updated in Home Assistant.
