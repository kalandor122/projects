# Task Manager MCP Server

MCP (Model Context Protocol) server for the Task Project Manager API. Allows AI assistants (Hermes, Claude, Cursor, etc.) to query and manage projects, tasks, tags, subtasks, and worklogs.

## Prerequisites

- Python 3.10+ (tested on 3.12.3)
- The project manager API running at `http://localhost:3001` (via Docker or local dev)

## Installation

```bash
cd mcp
pip install -e .

# Or if using uv
uv pip install -e .
```

Verify it works:

```bash
python -m task_manager_mcp
```

The server starts and waits for MCP requests on stdin/stdout (no output means it's ready).

## Configuration

The MCP server connects to the project manager API. Set the base URL via the `API_BASE_URL` environment variable:

| Variable | Default | Description |
|----------|---------|-------------|
| `API_BASE_URL` | `http://localhost:3001` | Base URL of the project manager API |

If the API is running in Docker with the default port mapping, no configuration is needed.

## Connecting to an AI Assistant

### Hermes (Recommended)

Add to your Hermes MCP config (typically `mcp.json` or `~/.config/hermes/mcp.json`):

```json
{
  "mcpServers": {
    "task-manager": {
      "command": "python",
      "args": ["-m", "task_manager_mcp"],
      "env": {
        "API_BASE_URL": "http://localhost:3001"
      }
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "task-manager": {
      "command": "python",
      "args": ["-m", "task_manager_mcp"],
      "env": {
        "API_BASE_URL": "http://localhost:3001"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "task-manager": {
      "command": "python",
      "args": ["-m", "task_manager_mcp"],
      "env": {
        "API_BASE_URL": "http://localhost:3001"
      }
    }
  }
}
```

### General / Other Clients

Any MCP-compatible client can connect using:

- **Transport:** stdio
- **Command:** `python`
- **Args:** `-m`, `task_manager_mcp`
- **Environment:** `API_BASE_URL=http://localhost:3001`

Alternatively, use the console script:

- **Command:** `task-manager-mcp`

## Available Tools

### Projects

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list_projects` | *none* | List all projects with their tags |
| `get_project` | `id: str` | Get a single project by UUID |
| `create_project` | `name: str`, `description?: str`, `deadline?: str` | Create a new project |
| `update_project` | `id: str`, `name?: str`, `description?: str`, `deadline?: str`, `status?: str` | Update an existing project |
| `delete_project` | `id: str` | Delete a project and all its data (cascading) |

### Tasks

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list_tasks` | *none* | List all tasks across all projects |
| `get_project_tasks` | `project_id: str` | Get all tasks for a project |
| `get_task` | `id: str` | Get a single task by UUID |
| `create_task` | `project_id: str`, `name: str`, `description?: str`, `deadline?: str`, `status?: str`, `ease_level?: str`, `priority?: int` | Create a new task |
| `update_task` | `id: str`, `name?: str`, `description?: str`, `deadline?: str`, `status?: str`, `ease_level?: str`, `priority?: int` | Update an existing task |
| `delete_task` | `id: str` | Delete a task and its subtasks |

**Task field values:**
- `status`: `TODO`, `IN_PROGRESS`, `DONE`
- `ease_level`: `Easy`, `Medium`, `Hard`
- `priority`: `1` (Urgent), `2` (High), `3` (Medium), `4` (Low)

### Tags

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list_tags` | *none* | List all tags alphabetically |
| `create_tag` | `name: str`, `color?: str` | Create a tag (color e.g. `#ff0000`, default `#cccccc`) |
| `update_tag` | `id: str`, `name?: str`, `color?: str` | Update a tag |
| `delete_tag` | `id: str` | Delete a tag (removes from all items) |
| `assign_tag_to_task` | `task_id: str`, `tag_id: str` | Assign a tag to a task |
| `unassign_tag_from_task` | `task_id: str`, `tag_id: str` | Remove a tag from a task |
| `assign_tag_to_project` | `project_id: str`, `tag_id: str` | Assign a tag to a project |
| `unassign_tag_from_project` | `project_id: str`, `tag_id: str` | Remove a tag from a project |

### Subtasks

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list_subtasks` | `task_id: str` | List subtasks for a task |
| `create_subtask` | `task_id: str`, `name: str` | Add a subtask |
| `toggle_subtask` | `subtask_id: str`, `completed: bool` | Mark subtask complete/incomplete |
| `delete_subtask` | `subtask_id: str` | Delete a subtask |

### Worklogs

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list_worklogs` | `project_id: str` | List worklog entries for a project (newest first) |
| `create_worklog` | `project_id: str`, `date: str`, `title: str`, `description?: str` | Add a worklog entry |
| `update_worklog` | `id: str`, `date?: str`, `title?: str`, `description?: str` | Update a worklog entry |
| `delete_worklog` | `id: str` | Delete a worklog entry |

## Example Prompts

Once connected, you can ask your AI assistant things like:

- "List all my active projects"
- "Create a task called 'Fix login bug' in project X with high priority"
- "Show me all tasks in the API Redesign project"
- "Mark the 'Add tests' subtask as done"
- "What worklogs did I write this week for project Y?"
- "Assign the 'urgent' tag to task Z"
- "Create a new project called 'Q3 Planning' with a deadline of September 30"

## Troubleshooting

### "Connection refused" or timeout

The project manager API must be running. Start it with:

```bash
docker-compose up -d --build
```

Then verify: `curl http://localhost:3001/api/projects`

### Tool not found

Ensure the MCP server is installed correctly:

```bash
pip show task-manager-mcp
python -c "from task_manager_mcp.server import mcp; print('OK')"
```

### Restart after installing

After installing the MCP server, restart your AI assistant to pick up the new tools.

## Development

```bash
cd mcp
pip install -e .        # Editable install
python -m task_manager_mcp   # Run manually
```

Modify `src/task_manager_mcp/server.py` to add or change tools. No restart needed for the install — MCP clients restart the process on each connection.
