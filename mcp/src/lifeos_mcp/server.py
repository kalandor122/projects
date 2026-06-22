"""lifeos_mcp.server — unified MCP server for the merged "Projects & Tasks" app.

Connects to the merged REST API (default http://localhost:3090/api/) via httpx
and exposes all tools from both the project-manager and todomcp servers over
stdio using the ``mcp`` Python package (FastMCP).

Tool groups:
    Projects, Project Tasks, Subtasks, Tags, Worklogs,
    Daily Todos, Daily Categories, Analytics, Settings.
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

API_BASE_URL = os.environ.get(
    "LIFEOS_API_BASE_URL", "http://localhost:3090/api/"
).rstrip("/") + "/"
"""Base URL for the merged REST API, always ending with a single trailing slash."""

DEFAULT_TIMEOUT = 10.0

# ---------------------------------------------------------------------------
# MCP server (FastMCP)
# ---------------------------------------------------------------------------

mcp = FastMCP("lifeos-mcp")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_jsonable(value: Any) -> Any:
    """Return *value* as-is if already JSON-serialisable; otherwise stringify."""
    try:
        json.dumps(value)
        return value
    except (TypeError, ValueError):
        return str(value)


def _format_response(data: Any, status: int) -> str:
    """Render an API response as a string for the MCP client.

    On 2xx we return the JSON payload (compact, sorted keys for determinism).
    On error we return a clearly-marked error line including the status code
    and the raw body so the model can see what the API said.
    """
    if 200 <= status < 300:
        try:
            return json.dumps(data, sort_keys=True, separators=(",", ":"))
        except (TypeError, ValueError):
            return str(data)
    body = data if isinstance(data, str) else json.dumps(data, sort_keys=True)
    return f"LifeOS API error (HTTP {status}): {body}"


async def _request(
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
) -> tuple[Any, int]:
    """Perform an HTTP request against the merged REST API.

    Returns ``(parsed_body, status_code)``.  Network errors are surfaced as a
    synthetic 599 response with an informative message.
    """
    url = API_BASE_URL + path.lstrip("/")
    # Drop None values so we don't send "null" to the API.
    if params is not None:
        params = {k: v for k, v in params.items() if v is not None}
    if json_body is not None:
        json_body = {k: v for k, v in json_body.items() if v is not None}

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            resp = await client.request(
                method, url, params=params, json=json_body
            )
    except httpx.RequestError as exc:
        return (
            f"LifeOS API unreachable: {exc.__class__.__name__}: {exc}",
            599,
        )

    # Try to parse JSON; fall back to raw text.
    try:
        body = resp.json()
    except (ValueError, json.JSONDecodeError):
        body = resp.text
    return body, resp.status_code


# ===========================================================================
# Project tools  (calling /api/projects)
# ===========================================================================


@mcp.tool()
async def list_projects() -> str:
    """List all projects with their tags.

    Returns:
        JSON array of project objects, or an error string.
    """
    body, status_code = await _request("GET", "projects")
    return _format_response(body, status_code)


@mcp.tool()
async def get_project(id: str) -> str:
    """Get a single project by its UUID.

    Args:
        id: Project UUID.

    Returns:
        JSON project object, or an error string if not found.
    """
    body, status_code = await _request("GET", f"projects/{id}")
    return _format_response(body, status_code)


@mcp.tool()
async def create_project(
    name: str,
    description: str | None = None,
    deadline: str | None = None,
) -> str:
    """Create a new project.

    Args:
        name: Project name (required).
        description: Optional description.
        deadline: Optional deadline as ISO-8601 string (e.g. 2026-06-15T17:00:00Z).

    Returns:
        JSON object of the created project, or an error string.
    """
    payload: dict[str, Any] = {
        "name": name,
        "description": description,
        "deadline": deadline,
    }
    body, status_code = await _request("POST", "projects", json_body=payload)
    return _format_response(body, status_code)


@mcp.tool()
async def update_project(
    id: str,
    name: str | None = None,
    description: str | None = None,
    deadline: str | None = None,
    status: str | None = None,
) -> str:
    """Update an existing project. Only provided fields will be changed.

    Args:
        id: Project UUID.
        name: New name.
        description: New description.
        deadline: New deadline (ISO-8601).
        status: New status (e.g. Active, Archived, Completed).

    Returns:
        JSON object of the updated project, or an error string.
    """
    payload: dict[str, Any] = {
        "name": name,
        "description": description,
        "deadline": deadline,
        "status": status,
    }
    body, status_code = await _request("PATCH", f"projects/{id}", json_body=payload)
    return _format_response(body, status_code)


@mcp.tool()
async def delete_project(id: str) -> str:
    """Delete a project and all its tasks, subtasks, and worklogs (cascading).

    Args:
        id: Project UUID.

    Returns:
        Confirmation message, or an error string.
    """
    body, status_code = await _request("DELETE", f"projects/{id}")
    if 200 <= status_code < 300:
        return f"Project {id} deleted."
    return _format_response(body, status_code)


# ===========================================================================
# Project task tools  (calling /api/tasks)
# ===========================================================================


@mcp.tool()
async def list_project_tasks() -> str:
    """List all project tasks across all projects with their tags.

    Returns:
        JSON array of task objects, or an error string.
    """
    body, status_code = await _request("GET", "tasks")
    return _format_response(body, status_code)


@mcp.tool()
async def get_project_task(id: str) -> str:
    """Get a single project task by its UUID.

    The API does not expose a per-task GET endpoint, so this filters from
    the full task list.

    Args:
        id: Task UUID.

    Returns:
        JSON task object, or an error string if not found.
    """
    body, status_code = await _request("GET", "tasks")
    if not (200 <= status_code < 300):
        return _format_response(body, status_code)
    tasks = body if isinstance(body, list) else []
    task = next((t for t in tasks if t.get("id") == id), None)
    if task is None:
        return f"Task {id} not found"
    return _format_response(task, status_code)


@mcp.tool()
async def get_tasks_for_project(project_id: str) -> str:
    """Get all tasks belonging to a specific project.

    Args:
        project_id: Project UUID.

    Returns:
        JSON array of task objects, or an error string.
    """
    body, status_code = await _request("GET", f"tasks/project/{project_id}")
    return _format_response(body, status_code)


@mcp.tool()
async def create_project_task(
    project_id: str,
    name: str,
    description: str | None = None,
    deadline: str | None = None,
    status: str | None = None,
    ease_level: str | None = None,
    priority: int | None = None,
) -> str:
    """Create a new task within a project.

    Args:
        project_id: Project UUID (required).
        name: Task name (required).
        description: Optional description.
        deadline: Optional deadline as ISO-8601 string.
        status: One of TODO, IN_PROGRESS, DONE (default: TODO).
        ease_level: One of Easy, Medium, Hard (default: Medium).
        priority: 1=Urgent, 2=High, 3=Medium, 4=Low (default: 3).

    Returns:
        JSON object of the created task, or an error string.
    """
    payload: dict[str, Any] = {
        "project_id": project_id,
        "name": name,
        "description": description,
        "deadline": deadline,
        "status": status,
        "ease_level": ease_level,
        "priority": priority,
    }
    body, status_code = await _request("POST", "tasks", json_body=payload)
    return _format_response(body, status_code)


@mcp.tool()
async def update_project_task(
    id: str,
    name: str | None = None,
    description: str | None = None,
    deadline: str | None = None,
    status: str | None = None,
    ease_level: str | None = None,
    priority: int | None = None,
) -> str:
    """Update an existing project task. Only provided fields will be changed.

    Args:
        id: Task UUID.
        name: New name.
        description: New description.
        deadline: New deadline (ISO-8601).
        status: TODO, IN_PROGRESS, or DONE.
        ease_level: Easy, Medium, or Hard.
        priority: 1=Urgent, 2=High, 3=Medium, 4=Low.

    Returns:
        JSON object of the updated task, or an error string.
    """
    payload: dict[str, Any] = {
        "name": name,
        "description": description,
        "deadline": deadline,
        "status": status,
        "ease_level": ease_level,
        "priority": priority,
    }
    body, status_code = await _request("PATCH", f"tasks/{id}", json_body=payload)
    return _format_response(body, status_code)


@mcp.tool()
async def delete_project_task(id: str) -> str:
    """Delete a project task and all its subtasks.

    Args:
        id: Task UUID.

    Returns:
        Confirmation message, or an error string.
    """
    body, status_code = await _request("DELETE", f"tasks/{id}")
    if 200 <= status_code < 300:
        return f"Task {id} deleted."
    return _format_response(body, status_code)


# ===========================================================================
# Subtask tools  (calling /api/tasks/:id/subtasks, /api/tasks/subtasks/:id)
# ===========================================================================


@mcp.tool()
async def list_subtasks(task_id: str) -> str:
    """List all subtasks for a given task.

    Args:
        task_id: Task UUID.

    Returns:
        JSON array of subtask objects, or an error string.
    """
    body, status_code = await _request("GET", f"tasks/{task_id}/subtasks")
    return _format_response(body, status_code)


@mcp.tool()
async def create_subtask(task_id: str, name: str) -> str:
    """Create a new subtask under a task.

    Args:
        task_id: Task UUID.
        name: Subtask name.

    Returns:
        JSON object of the created subtask, or an error string.
    """
    payload: dict[str, Any] = {"name": name}
    body, status_code = await _request(
        "POST", f"tasks/{task_id}/subtasks", json_body=payload
    )
    return _format_response(body, status_code)


@mcp.tool()
async def toggle_subtask(subtask_id: str, completed: bool) -> str:
    """Set a subtask's completion status.

    Args:
        subtask_id: Subtask UUID.
        completed: True to mark complete, False to unmark.

    Returns:
        JSON object of the updated subtask, or an error string.
    """
    payload: dict[str, Any] = {"completed": completed}
    body, status_code = await _request(
        "PATCH", f"tasks/subtasks/{subtask_id}", json_body=payload
    )
    return _format_response(body, status_code)


@mcp.tool()
async def delete_subtask(subtask_id: str) -> str:
    """Delete a subtask.

    Args:
        subtask_id: Subtask UUID.

    Returns:
        Confirmation message, or an error string.
    """
    body, status_code = await _request("DELETE", f"tasks/subtasks/{subtask_id}")
    if 200 <= status_code < 300:
        return f"Subtask {subtask_id} deleted."
    return _format_response(body, status_code)


# ===========================================================================
# Tag tools  (calling /api/tags, /api/projects/:id/tags, /api/tasks/:id/tags)
# ===========================================================================


@mcp.tool()
async def list_tags() -> str:
    """List all tags alphabetically by name.

    Returns:
        JSON array of tag objects, or an error string.
    """
    body, status_code = await _request("GET", "tags")
    return _format_response(body, status_code)


@mcp.tool()
async def create_tag(
    name: str,
    color: str | None = None,
) -> str:
    """Create a new tag.

    Args:
        name: Tag name (required, must be unique).
        color: Hex color code (e.g. #ff0000), defaults to #cccccc.

    Returns:
        JSON object of the created tag, or an error string.
    """
    payload: dict[str, Any] = {"name": name, "color": color}
    body, status_code = await _request("POST", "tags", json_body=payload)
    return _format_response(body, status_code)


@mcp.tool()
async def delete_tag(id: str) -> str:
    """Delete a tag and remove it from all tasks and projects.

    Args:
        id: Tag UUID.

    Returns:
        Confirmation message, or an error string.
    """
    body, status_code = await _request("DELETE", f"tags/{id}")
    if 200 <= status_code < 300:
        return f"Tag {id} deleted."
    return _format_response(body, status_code)


@mcp.tool()
async def assign_tag_to_project(project_id: str, tag_id: str) -> str:
    """Assign an existing tag to a project.

    Args:
        project_id: Project UUID.
        tag_id: Tag UUID.

    Returns:
        JSON confirmation object, or an error string.
    """
    payload: dict[str, Any] = {"tag_id": tag_id}
    body, status_code = await _request(
        "POST", f"projects/{project_id}/tags", json_body=payload
    )
    return _format_response(body, status_code)


@mcp.tool()
async def unassign_tag_from_project(project_id: str, tag_id: str) -> str:
    """Remove a tag from a project.

    Args:
        project_id: Project UUID.
        tag_id: Tag UUID.

    Returns:
        JSON confirmation object, or an error string.
    """
    body, status_code = await _request(
        "DELETE", f"projects/{project_id}/tags/{tag_id}"
    )
    return _format_response(body, status_code)


@mcp.tool()
async def assign_tag_to_task(task_id: str, tag_id: str) -> str:
    """Assign an existing tag to a task.

    Args:
        task_id: Task UUID.
        tag_id: Tag UUID.

    Returns:
        JSON confirmation object, or an error string.
    """
    payload: dict[str, Any] = {"tag_id": tag_id}
    body, status_code = await _request(
        "POST", f"tasks/{task_id}/tags", json_body=payload
    )
    return _format_response(body, status_code)


@mcp.tool()
async def unassign_tag_from_task(task_id: str, tag_id: str) -> str:
    """Remove a tag from a task.

    Args:
        task_id: Task UUID.
        tag_id: Tag UUID.

    Returns:
        JSON confirmation object, or an error string.
    """
    body, status_code = await _request(
        "DELETE", f"tasks/{task_id}/tags/{tag_id}"
    )
    return _format_response(body, status_code)


# ===========================================================================
# Worklog tools  (calling /api/worklogs)
# ===========================================================================


@mcp.tool()
async def list_worklogs(project_id: str) -> str:
    """List all worklog entries for a project, sorted by date descending.

    Args:
        project_id: Project UUID.

    Returns:
        JSON array of worklog objects, or an error string.
    """
    params: dict[str, Any] = {"project_id": project_id}
    body, status_code = await _request("GET", "worklogs", params=params)
    return _format_response(body, status_code)


@mcp.tool()
async def create_worklog(
    project_id: str,
    date: str,
    title: str,
    description: str | None = None,
) -> str:
    """Create a new worklog entry.

    Args:
        project_id: Project UUID.
        date: Date string (e.g. 2026-06-03 or ISO-8601).
        title: Worklog title.
        description: Optional description of work done.

    Returns:
        JSON object of the created worklog, or an error string.
    """
    payload: dict[str, Any] = {
        "project_id": project_id,
        "date": date,
        "title": title,
        "description": description,
    }
    body, status_code = await _request("POST", "worklogs", json_body=payload)
    return _format_response(body, status_code)


@mcp.tool()
async def update_worklog(
    id: str,
    date: str | None = None,
    title: str | None = None,
    description: str | None = None,
) -> str:
    """Update an existing worklog entry. Only provided fields will be changed.

    Args:
        id: Worklog UUID.
        date: New date string.
        title: New title.
        description: New description.

    Returns:
        JSON object of the updated worklog, or an error string.
    """
    payload: dict[str, Any] = {
        "date": date,
        "title": title,
        "description": description,
    }
    body, status_code = await _request("PATCH", f"worklogs/{id}", json_body=payload)
    return _format_response(body, status_code)


@mcp.tool()
async def delete_worklog(id: str) -> str:
    """Delete a worklog entry.

    Args:
        id: Worklog UUID.

    Returns:
        Confirmation message, or an error string.
    """
    body, status_code = await _request("DELETE", f"worklogs/{id}")
    if 200 <= status_code < 300:
        return f"Worklog {id} deleted."
    return _format_response(body, status_code)


# ===========================================================================
# Daily Todo tools  (calling /api/daily/tasks)
# ===========================================================================


@mcp.tool()
async def list_daily_tasks(
    status: str | None = None,
    priority: int | None = None,
    category_id: str | None = None,
    search: str | None = None,
    due_date: str | None = None,
) -> str:
    """List daily todo tasks, with optional filters.

    Args:
        status: Filter by status — one of "pending", "completed".
        priority: Filter by priority (1=Urgent, 2=High, 3=Medium, 4=Low).
        category_id: Filter by category UUID.
        search: Free-text search over task name.
        due_date: Filter by due date (ISO date, e.g. "2026-06-21").

    Returns:
        JSON array of task objects, or an error string.
    """
    params: dict[str, Any] = {
        "status": status,
        "priority": priority,
        "category_id": category_id,
        "search": search,
        "due_date": due_date,
    }
    body, status_code = await _request("GET", "daily/tasks", params=params)
    return _format_response(body, status_code)


@mcp.tool()
async def get_daily_task(id: str) -> str:
    """Get a single daily todo task by its UUID.

    Args:
        id: The task UUID.

    Returns:
        JSON task object, or an error string if not found.
    """
    body, status_code = await _request("GET", f"daily/tasks/{id}")
    return _format_response(body, status_code)


@mcp.tool()
async def create_daily_task(
    name: str,
    description: str | None = None,
    priority: int | None = None,
    due_date: str | None = None,
    category_id: str | None = None,
    tags: list[str] | None = None,
) -> str:
    """Create a new daily todo task.

    Args:
        name: Task name (required).
        description: Optional longer description.
        priority: 1=Urgent, 2=High, 3=Medium, 4=Low (optional).
        due_date: Optional ISO date string, e.g. "2026-06-21".
        category_id: Optional category UUID to assign.
        tags: Optional list of tag UUIDs to attach.

    Returns:
        JSON object of the created task, or an error string.
    """
    payload: dict[str, Any] = {
        "name": name,
        "description": description,
        "priority": priority,
        "due_date": due_date,
        "category_id": category_id,
        "tags": tags,
    }
    body, status_code = await _request("POST", "daily/tasks", json_body=payload)
    return _format_response(body, status_code)


@mcp.tool()
async def update_daily_task(
    id: str,
    name: str | None = None,
    description: str | None = None,
    status: str | None = None,
    priority: int | None = None,
    due_date: str | None = None,
    category_id: str | None = None,
    tags: list[str] | None = None,
) -> str:
    """Update an existing daily todo task. Only provided fields are changed.

    Args:
        id: The task UUID (required).
        name: New name.
        description: New description.
        status: New status — "pending" or "completed".
        priority: New priority (1-4).
        due_date: New due date (ISO) or empty string to clear.
        category_id: New category UUID or empty string to clear.
        tags: Replace the task's tags with this list of tag UUIDs.

    Returns:
        JSON object of the updated task, or an error string.
    """
    payload: dict[str, Any] = {
        "name": name,
        "description": description,
        "status": status,
        "priority": priority,
        "due_date": due_date,
        "category_id": category_id,
        "tags": tags,
    }
    body, status_code = await _request(
        "PUT", f"daily/tasks/{id}", json_body=payload
    )
    return _format_response(body, status_code)


@mcp.tool()
async def delete_daily_task(id: str) -> str:
    """Delete a daily todo task by its UUID.

    Args:
        id: The task UUID.

    Returns:
        Confirmation message, or an error string.
    """
    body, status_code = await _request("DELETE", f"daily/tasks/{id}")
    if 200 <= status_code < 300:
        return f"Daily task {id} deleted."
    return _format_response(body, status_code)


# ===========================================================================
# Daily Category tools  (calling /api/daily/categories)
# ===========================================================================


@mcp.tool()
async def list_daily_categories() -> str:
    """List all daily todo categories.

    Returns:
        JSON array of category objects {id, name, color}, or an error string.
    """
    body, status_code = await _request("GET", "daily/categories")
    return _format_response(body, status_code)


@mcp.tool()
async def create_daily_category(
    name: str,
    color: str | None = None,
) -> str:
    """Create a new daily todo category.

    Args:
        name: Category name (required, unique).
        color: Optional hex color, e.g. "#ff0000".

    Returns:
        JSON object of the created category, or an error string.
    """
    payload: dict[str, Any] = {"name": name, "color": color}
    body, status_code = await _request(
        "POST", "daily/categories", json_body=payload
    )
    return _format_response(body, status_code)


# ===========================================================================
# Analytics tools  (calling /api/daily/analytics)
# ===========================================================================


@mcp.tool()
async def get_daily_stats() -> str:
    """Get aggregate daily todo statistics.

    Returns:
        JSON object {total, completed, pending, rolled_over, streak}.
    """
    body, status_code = await _request("GET", "daily/analytics/stats")
    return _format_response(body, status_code)


@mcp.tool()
async def get_daily_heatmap() -> str:
    """Get the 365-day task-completion activity heatmap.

    Returns:
        JSON array of {date, tasks_completed} objects for the last 365 days.
    """
    body, status_code = await _request("GET", "daily/analytics/heatmap")
    return _format_response(body, status_code)


# ===========================================================================
# Settings tools  (calling /api/daily/settings)
# ===========================================================================


@mcp.tool()
async def get_settings() -> str:
    """Get all daily todo settings as a key-value object.

    Returns:
        JSON object of settings, or an error string.
    """
    body, status_code = await _request("GET", "daily/settings")
    return _format_response(body, status_code)


@mcp.tool()
async def update_settings(settings: dict[str, Any]) -> str:
    """Bulk update daily todo settings.

    Args:
        settings: A JSON object of key-value pairs to upsert.

    Returns:
        JSON confirmation object, or an error string.
    """
    body, status_code = await _request(
        "PUT", "daily/settings", json_body=settings
    )
    return _format_response(body, status_code)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    """CLI entry point — run the MCP server over stdio."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
