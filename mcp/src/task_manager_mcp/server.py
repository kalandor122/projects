from __future__ import annotations

import json
from typing import Any, Optional

from mcp.server.fastmcp import FastMCP

from .api_client import APIClient

mcp = FastMCP("task-manager-mcp")
api = APIClient()


def _fmt(data: Any) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False, default=str)


# ── Projects ────────────────────────────────────────────────────────────────

@mcp.tool()
async def list_projects() -> str:
    """List all projects with their tags."""
    return _fmt(await api.get("/projects"))


@mcp.tool()
async def get_project(id: str) -> str:
    """Get a single project by its UUID."""
    return _fmt(await api.get(f"/projects/{id}"))


@mcp.tool()
async def create_project(
    name: str,
    description: Optional[str] = None,
    deadline: Optional[str] = None,
) -> str:
    """Create a new project.

    Args:
        name: Project name (required)
        description: Optional description
        deadline: Optional deadline as ISO-8601 string (e.g. 2026-06-15T17:00:00Z)
    """
    body: dict[str, Any] = {"name": name}
    if description is not None:
        body["description"] = description
    if deadline is not None:
        body["deadline"] = deadline
    return _fmt(await api.post("/projects", body))


@mcp.tool()
async def update_project(
    id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    deadline: Optional[str] = None,
    status: Optional[str] = None,
) -> str:
    """Update an existing project. Only provided fields will be changed.

    Args:
        id: Project UUID
        name: New name
        description: New description
        deadline: New deadline (ISO-8601)
        status: New status (e.g. Active, Archived, Completed)
    """
    body: dict[str, Any] = {}
    if name is not None:
        body["name"] = name
    if description is not None:
        body["description"] = description
    if deadline is not None:
        body["deadline"] = deadline
    if status is not None:
        body["status"] = status
    return _fmt(await api.patch(f"/projects/{id}", body))


@mcp.tool()
async def delete_project(id: str) -> str:
    """Delete a project and all its tasks, subtasks, and worklogs (cascading).

    Args:
        id: Project UUID
    """
    return _fmt(await api.delete(f"/projects/{id}"))


# ── Tasks ───────────────────────────────────────────────────────────────────

@mcp.tool()
async def list_tasks() -> str:
    """List all tasks across all projects with their tags."""
    return _fmt(await api.get("/tasks"))


@mcp.tool()
async def get_project_tasks(project_id: str) -> str:
    """Get all tasks belonging to a specific project.

    Args:
        project_id: Project UUID
    """
    return _fmt(await api.get(f"/tasks/project/{project_id}"))


@mcp.tool()
async def get_task(id: str) -> str:
    """Get a single task by its UUID. Filters from the full task list."""
    tasks = await api.get("/tasks")
    task = next((t for t in tasks if t.get("id") == id), None)
    if task is None:
        return f"Task {id} not found"
    return _fmt(task)


@mcp.tool()
async def create_task(
    project_id: str,
    name: str,
    description: Optional[str] = None,
    deadline: Optional[str] = None,
    status: Optional[str] = None,
    ease_level: Optional[str] = None,
    priority: Optional[int] = None,
) -> str:
    """Create a new task within a project.

    Args:
        project_id: Project UUID (required)
        name: Task name (required)
        description: Optional description
        deadline: Optional deadline as ISO-8601 string
        status: One of TODO, IN_PROGRESS, DONE (default: TODO)
        ease_level: One of Easy, Medium, Hard (default: Medium)
        priority: 1=Urgent, 2=High, 3=Medium, 4=Low (default: 3)
    """
    body: dict[str, Any] = {"project_id": project_id, "name": name}
    if description is not None:
        body["description"] = description
    if deadline is not None:
        body["deadline"] = deadline
    if status is not None:
        body["status"] = status
    if ease_level is not None:
        body["ease_level"] = ease_level
    if priority is not None:
        body["priority"] = priority
    return _fmt(await api.post("/tasks", body))


@mcp.tool()
async def update_task(
    id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    deadline: Optional[str] = None,
    status: Optional[str] = None,
    ease_level: Optional[str] = None,
    priority: Optional[int] = None,
) -> str:
    """Update an existing task. Only provided fields will be changed.

    Args:
        id: Task UUID
        name: New name
        description: New description
        deadline: New deadline (ISO-8601)
        status: TODO, IN_PROGRESS, or DONE
        ease_level: Easy, Medium, or Hard
        priority: 1=Urgent, 2=High, 3=Medium, 4=Low
    """
    body: dict[str, Any] = {}
    if name is not None:
        body["name"] = name
    if description is not None:
        body["description"] = description
    if deadline is not None:
        body["deadline"] = deadline
    if status is not None:
        body["status"] = status
    if ease_level is not None:
        body["ease_level"] = ease_level
    if priority is not None:
        body["priority"] = priority
    return _fmt(await api.patch(f"/tasks/{id}", body))


@mcp.tool()
async def delete_task(id: str) -> str:
    """Delete a task and all its subtasks.

    Args:
        id: Task UUID
    """
    return _fmt(await api.delete(f"/tasks/{id}"))


# ── Tags ────────────────────────────────────────────────────────────────────

@mcp.tool()
async def list_tags() -> str:
    """List all tags alphabetically by name."""
    return _fmt(await api.get("/tags"))


@mcp.tool()
async def create_tag(
    name: str,
    color: Optional[str] = None,
) -> str:
    """Create a new tag.

    Args:
        name: Tag name (required, must be unique)
        color: Hex color code (e.g. #ff0000), defaults to #cccccc
    """
    body: dict[str, Any] = {"name": name}
    if color is not None:
        body["color"] = color
    return _fmt(await api.post("/tags", body))


@mcp.tool()
async def update_tag(
    id: str,
    name: Optional[str] = None,
    color: Optional[str] = None,
) -> str:
    """Update an existing tag. Only provided fields will be changed.

    Args:
        id: Tag UUID
        name: New name
        color: New hex color (e.g. #ff0000)
    """
    body: dict[str, Any] = {}
    if name is not None:
        body["name"] = name
    if color is not None:
        body["color"] = color
    return _fmt(await api.patch(f"/tags/{id}", body))


@mcp.tool()
async def delete_tag(id: str) -> str:
    """Delete a tag and remove it from all tasks and projects.

    Args:
        id: Tag UUID
    """
    return _fmt(await api.delete(f"/tags/{id}"))


@mcp.tool()
async def assign_tag_to_task(task_id: str, tag_id: str) -> str:
    """Assign an existing tag to a task.

    Args:
        task_id: Task UUID
        tag_id: Tag UUID
    """
    return _fmt(await api.post(f"/tasks/{task_id}/tags", {"tag_id": tag_id}))


@mcp.tool()
async def unassign_tag_from_task(task_id: str, tag_id: str) -> str:
    """Remove a tag from a task.

    Args:
        task_id: Task UUID
        tag_id: Tag UUID
    """
    return _fmt(await api.delete(f"/tasks/{task_id}/tags/{tag_id}"))


@mcp.tool()
async def assign_tag_to_project(project_id: str, tag_id: str) -> str:
    """Assign an existing tag to a project.

    Args:
        project_id: Project UUID
        tag_id: Tag UUID
    """
    return _fmt(await api.post(f"/projects/{project_id}/tags", {"tag_id": tag_id}))


@mcp.tool()
async def unassign_tag_from_project(project_id: str, tag_id: str) -> str:
    """Remove a tag from a project.

    Args:
        project_id: Project UUID
        tag_id: Tag UUID
    """
    return _fmt(await api.delete(f"/projects/{project_id}/tags/{tag_id}"))


# ── Subtasks ────────────────────────────────────────────────────────────────

@mcp.tool()
async def list_subtasks(task_id: str) -> str:
    """List all subtasks for a given task.

    Args:
        task_id: Task UUID
    """
    return _fmt(await api.get(f"/tasks/{task_id}/subtasks"))


@mcp.tool()
async def create_subtask(task_id: str, name: str) -> str:
    """Create a new subtask under a task.

    Args:
        task_id: Task UUID
        name: Subtask name
    """
    return _fmt(await api.post(f"/tasks/{task_id}/subtasks", {"name": name}))


@mcp.tool()
async def toggle_subtask(subtask_id: str, completed: bool) -> str:
    """Set a subtask's completion status.

    Args:
        subtask_id: Subtask UUID
        completed: True to mark complete, False to unmark
    """
    return _fmt(await api.patch(f"/tasks/subtasks/{subtask_id}", {"completed": completed}))


@mcp.tool()
async def delete_subtask(subtask_id: str) -> str:
    """Delete a subtask.

    Args:
        subtask_id: Subtask UUID
    """
    return _fmt(await api.delete(f"/tasks/subtasks/{subtask_id}"))


# ── Worklogs ────────────────────────────────────────────────────────────────

@mcp.tool()
async def list_worklogs(project_id: str) -> str:
    """List all worklog entries for a project, sorted by date descending.

    Args:
        project_id: Project UUID
    """
    return _fmt(await api.get(f"/worklogs/project/{project_id}"))


@mcp.tool()
async def create_worklog(
    project_id: str,
    date: str,
    title: str,
    description: Optional[str] = None,
) -> str:
    """Create a new worklog entry.

    Args:
        project_id: Project UUID
        date: Date string (e.g. 2026-06-03 or ISO-8601)
        title: Worklog title
        description: Optional description of work done
    """
    body: dict[str, Any] = {"project_id": project_id, "date": date, "title": title}
    if description is not None:
        body["description"] = description
    return _fmt(await api.post("/worklogs", body))


@mcp.tool()
async def update_worklog(
    id: str,
    date: Optional[str] = None,
    title: Optional[str] = None,
    description: Optional[str] = None,
) -> str:
    """Update an existing worklog entry. Only provided fields will be changed.

    Args:
        id: Worklog UUID
        date: New date string
        title: New title
        description: New description
    """
    body: dict[str, Any] = {}
    if date is not None:
        body["date"] = date
    if title is not None:
        body["title"] = title
    if description is not None:
        body["description"] = description
    return _fmt(await api.patch(f"/worklogs/{id}", body))


@mcp.tool()
async def delete_worklog(id: str) -> str:
    """Delete a worklog entry.

    Args:
        id: Worklog UUID
    """
    return _fmt(await api.delete(f"/worklogs/{id}"))


def main() -> None:
    mcp.run(transport="stdio")
