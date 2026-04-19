# Project Management System (Self-Hosted)

A high-performance, containerized project management tool with a React frontend, Node.js backend, and deep Home Assistant integration via MQTT.

## 🚀 Quick Start (Docker)

The fastest way to deploy the entire stack (Frontend, Backend, Database, and MQTT Broker) is using Docker Compose.

1.  **Clone the repository**
2.  **Configure Environment:**
    Copy the variables below into a `.env` file in the root directory:
    ```env
    # Database
    POSTGRES_USER=user
    POSTGRES_PASSWORD=password
    POSTGRES_DB=task_project

    # MQTT (Defaults for internal container)
    MQTT_URL=mqtt://mqtt:1883
    MQTT_USERNAME=admin
    MQTT_PASSWORD=password
    ```
3.  **Launch:**
    ```bash
    docker-compose up -d --build
    ```

The application will be live at:
- **Frontend:** [http://localhost:8080](http://localhost:8080)
- **API:** [http://localhost:3001](http://localhost:3001)

## ✨ Features
- **Kanban Flow:** Manage tasks with a drag-and-drop Kanban interface.
- **Project Detail Views:** Dedicated views for complex project tracking.
- **Smart Timeline:** Visualize your project roadmap with an automated Gantt-style timeline.
- **Global Tagging:** Categorize projects and tasks with custom colors and labels.
- **Worklogs:** Exportable technical documentation and logs per project.
- **Home Assistant Integration:** Real-time state syncing and MQTT Discovery.

## 🏠 Homelab Deployment
### Cloudflare Tunnels / Reverse Proxy
Point your tunnel or proxy to `http://localhost:8080`. The system is configured to handle routing and API proxying internally through Nginx.

### Data Persistence
Data is stored in the following Docker volumes:
- `postgres_data`: All projects, tasks, and tags.
- `mosquitto_data`: MQTT broker state and persistence.

## 🛠 Architecture
The system follows a modern microservices-inspired architecture:
- **Client:** React (TypeScript) + Tailwind v4 + Vite. Served via Nginx.
- **Server:** Node.js (Express) + PostgreSQL.
- **Database:** PostgreSQL 15.
- **Broker:** Eclipse Mosquitto (configured for internal container communication).

### Architectural Map
An interactive map of the system architecture can be generated via `graphify` and viewed in `graphify-out/graph.html`.

## 🤖 Home Assistant Integration
The system automatically registers projects and tasks as sensors in Home Assistant using **MQTT Discovery**.
- **Sensors:** Appear automatically as `sensor.project_mgmt_...`
- **Device:** All entities are grouped under the "Project Management System" device.
- **Sync:** The server performs a full state sync to MQTT every time it starts.

---
Created by Füvesi Magor
