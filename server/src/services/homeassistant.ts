import WebSocket from 'ws';
import dotenv from 'dotenv';
import pool from '../db';

dotenv.config();

const HA_URL = process.env.HA_URL || 'http://localhost:8123';
const HA_TOKEN = process.env.HA_TOKEN || '';

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: ReturnType<typeof setTimeout>;
};

interface TodoItemPayload {
  uid: string;
  summary: string;
  status: 'completed' | 'needs_action';
  due?: string | null;
  description?: string | null;
}

interface ConfigEntry {
  entry_id: string;
  domain: string;
  title: string;
  state: string;
  source: string;
}

let ws: WebSocket | null = null;
let msgIdCounter = 0;

const pendingRequests = new Map<number, PendingRequest>();

interface Subscription {
  projectId: string;
  entityId: string;
  callback: (items: TodoItemPayload[]) => void;
}
const subscriptions = new Map<number, Subscription>();

const recentlyWritten = new Set<string>();
let syncing = false;

let haState: 'disconnected' | 'authenticating' | 'connected' = 'disconnected';
let authResolve: (() => void) | null = null;
let authReject: ((err: Error) => void) | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;

function haSlugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function nextMsgId(): number {
  return ++msgIdCounter;
}

function handleMessage(data: string) {
  let msg: any;
  try {
    msg = JSON.parse(data);
  } catch {
    return;
  }

  if (haState === 'authenticating') {
    if (msg.type === 'auth_required') {
      ws!.send(JSON.stringify({ type: 'auth', access_token: HA_TOKEN }));
      return;
    }
    if (msg.type === 'auth_ok') {
      haState = 'connected';
      console.log('HA WebSocket authenticated');
      reconnectDelay = 1000;
      authResolve?.();
      authResolve = null;
      authReject = null;
      syncAllToHA(pool).catch((err) =>
        console.error('Post-auth HA sync failed:', err)
      );
      return;
    }
    if (msg.type === 'auth_invalid') {
      haState = 'disconnected';
      authReject?.(new Error('HA auth failed: ' + (msg.message || 'invalid token')));
      authResolve = null;
      authReject = null;
      return;
    }
  }

  if (msg.type === 'result' && msg.id != null && pendingRequests.has(msg.id)) {
    const { resolve, reject, timer } = pendingRequests.get(msg.id)!;
    clearTimeout(timer);
    pendingRequests.delete(msg.id);
    if (msg.success) {
      resolve(msg.result);
    } else {
      const errMsg = msg.error?.message || 'HA request failed';
      console.log(`WS error for id=${msg.id}: ${errMsg}`);
      reject(new Error(errMsg));
    }
    return;
  }

  if (msg.type === 'event' && msg.id != null && subscriptions.has(msg.id)) {
    const sub = subscriptions.get(msg.id)!;
    const items: TodoItemPayload[] = msg.event?.items || [];
    handleTodoItemsChanged(sub.projectId, sub.entityId, items);
    return;
  }
}

async function handleTodoItemsChanged(
  projectId: string,
  entityId: string,
  items: TodoItemPayload[]
) {
  if (recentlyWritten.has(projectId)) {
    return;
  }

  for (const item of items) {
    try {
      const mapping = await pool.query(
        'SELECT task_id FROM ha_todo_items WHERE item_uid = $1',
        [item.uid]
      );
      if (mapping.rows.length === 0) continue;

      const taskId = mapping.rows[0].task_id;
      const task = await pool.query('SELECT status FROM tasks WHERE id = $1', [taskId]);
      if (task.rows.length === 0) continue;

      const dbStatus = task.rows[0].status;
      const expectedHaStatus = dbStatus === 'DONE' ? 'completed' : 'needs_action';

      if (item.status !== expectedHaStatus) {
        const newDbStatus = item.status === 'completed' ? 'DONE' : 'TODO';
        await pool.query('UPDATE tasks SET status = $1 WHERE id = $2', [
          newDbStatus,
          taskId,
        ]);
        console.log(
          `HA changed status of task ${taskId} to ${newDbStatus} (${
            item.status
          })`
        );
      }
    } catch (err) {
      console.error('Error handling todo item change:', err);
    }
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, 60000);
  console.log(`Reconnecting to HA in ${delay}ms...`);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await connectHA();
    } catch {
      scheduleReconnect();
    }
  }, delay);
}

function onDisconnect() {
  haState = 'disconnected';
  for (const [, { reject, timer }] of pendingRequests) {
    clearTimeout(timer);
    reject(new Error('WebSocket disconnected'));
  }
  pendingRequests.clear();
  subscriptions.clear();
  scheduleReconnect();
}

function sendMessage(msg: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket not connected'));
      return;
    }
    const id = nextMsgId();
    const message = { ...msg, id };
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      console.log(`WS timeout for id=${id} type=${msg.type}`);
      reject(new Error(`Request ${id} timed out`));
    }, 30000);
    pendingRequests.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify(message));
  });
}

export async function connectHA(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws) {
      try {
        ws.close();
      } catch {}
      ws = null;
    }

    haState = 'authenticating';
    const wsUrl = HA_URL.replace(/^http/, 'ws') + '/api/websocket';

    ws = new WebSocket(wsUrl);

    ws.on('message', (data: WebSocket.Data) => {
      handleMessage(data.toString());
    });

    ws.on('close', () => {
      console.log('HA WebSocket disconnected');
      onDisconnect();
    });

    ws.on('error', (err) => {
      console.error('HA WebSocket error:', err.message);
    });

    ws.on('open', () => {
      console.log('HA WebSocket connected, authenticating...');
    });

    authResolve = () => resolve();
    authReject = reject;

    setTimeout(() => {
      if (haState === 'authenticating') {
        authReject?.(new Error('HA connection timeout'));
        authResolve = null;
        authReject = null;
      }
    }, 15000);
  });
}

async function callService(
  domain: string,
  service: string,
  target: Record<string, any>,
  serviceData: Record<string, any> = {},
  returnResponse = false
): Promise<any> {
  const msg: any = {
    type: 'call_service',
    domain,
    service,
    target,
    service_data: serviceData,
  };
  if (returnResponse) {
    msg.return_response = true;
  }
  return sendMessage(msg);
}

async function wsCommand(type: string, params: Record<string, any> = {}): Promise<any> {
  return sendMessage({ type, ...params });
}

async function getConfigEntries(): Promise<ConfigEntry[]> {
  try {
    const url = `${HA_URL}/api/config/config_entries/entry`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${HA_TOKEN}` },
    });
    if (!response.ok) throw new Error(`REST get entries failed: ${response.status}`);
    return (await response.json()) || [];
  } catch (err) {
    console.error('REST getConfigEntries failed:', err);
    return [];
  }
}

async function createLocalTodoFlow(
  todoListName: string
): Promise<{ entry_id: string; entity_id: string }> {
  const startUrl = `${HA_URL}/api/config/config_entries/flow`;
  const flowResp = await fetch(startUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ handler: 'local_todo' }),
  });
  if (!flowResp.ok) {
    const text = await flowResp.text();
    throw new Error(`REST flow start failed: ${flowResp.status} ${text}`);
  }
  const flowData: any = await flowResp.json();
  const flowId = flowData.flow_id;

  const advanceUrl = `${HA_URL}/api/config/config_entries/flow/${flowId}`;
  const advanceResp = await fetch(advanceUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ todo_list_name: todoListName }),
  });
  if (!advanceResp.ok) {
    const text = await advanceResp.text();
    throw new Error(`REST flow advance failed: ${advanceResp.status} ${text}`);
  }
  const advanceData: any = await advanceResp.json();
  if (advanceData.type !== 'create_entry') {
    const reason = advanceData.reason || 'flow did not create entry';
    throw new Error(`Flow aborted: ${reason}`);
  }

  const entryId = advanceData.entry_id || advanceData.result?.entry_id;
  if (!entryId) {
    throw new Error('No entry_id in flow result: ' + JSON.stringify(advanceData));
  }

  const entityId = `todo.${haSlugify(todoListName)}`;
  return { entry_id: entryId, entity_id: entityId };
}

async function removeConfigEntry(entryId: string): Promise<void> {
  try {
    const url = `${HA_URL}/api/config/config_entries/entry/${entryId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${HA_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      if (response.status === 404) return;
      const text = await response.text();
      throw new Error(`HA REST delete failed: ${response.status} ${text}`);
    }
  } catch (err: any) {
    if (err.message?.includes('not found') || err.message?.includes('404')) return;
    throw err;
  }
}

async function getTodoItems(entityId: string): Promise<TodoItemPayload[]> {
  const result = await wsCommand('todo/item/list', { entity_id: entityId });
  return result?.items || [];
}

async function ensureTodoList(
  projectId: string,
  projectName: string
): Promise<{ entryId: string; entityId: string } | null> {
  const existing = await pool.query(
    'SELECT entry_id, entity_id FROM ha_todo_lists WHERE project_id = $1',
    [projectId]
  );

  let entryId: string;
  let entityId: string;

  if (existing.rows.length > 0) {
    entryId = existing.rows[0].entry_id;
    entityId = existing.rows[0].entity_id;

    try {
      await subscribeTodoItems(entityId, projectId);
      return { entryId, entityId };
    } catch {
      console.log(`HA todo entity missing for project ${projectName}, recreating...`);
    }
  }

  let attemptName = projectName;
  let retries = 0;

  while (retries < 5) {
    try {
      const result = await createLocalTodoFlow(attemptName);
      entryId = result.entry_id;
      entityId = result.entity_id;

      await pool.query(
        `INSERT INTO ha_todo_lists (project_id, entry_id, entity_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id) DO UPDATE SET entry_id = $2, entity_id = $3`,
        [projectId, entryId, entityId]
      );

      await subscribeTodoItems(entityId, projectId);
      return { entryId, entityId };
    } catch (err: any) {
      if (
        err.message?.includes('already exists') ||
        err.message?.includes('aborted') ||
        err.message?.includes('already configured')
      ) {
        retries++;
        attemptName = `${projectName} (${retries + 1})`;
        continue;
      }
      console.error('Failed to create HA todo list:', err);
      return null;
    }
  }

  console.error(`Could not create HA todo list for ${projectName} after retries`);
  return null;
}

async function subscribeTodoItems(
  entityId: string,
  projectId: string
): Promise<number> {
  for (const [subId, sub] of subscriptions) {
    if (sub.projectId === projectId) {
      return subId;
    }
  }

  const subId = await wsCommand('todo/item/subscribe', { entity_id: entityId });
  const msgId = msgIdCounter;
  subscriptions.set(msgId, {
    projectId,
    entityId,
    callback: (items) => {
      handleTodoItemsChanged(projectId, entityId, items);
    },
  });

  return subId;
}

export async function createTodoForProject(
  projectId: string,
  projectName: string
): Promise<void> {
  if (!ws || haState !== 'connected') return;
  await ensureTodoList(projectId, projectName);
}

export async function removeTodoForProject(projectId: string): Promise<void> {
  try {
    const result = await pool.query(
      'SELECT entry_id FROM ha_todo_lists WHERE project_id = $1',
      [projectId]
    );
    if (result.rows.length > 0) {
      const entryId = result.rows[0].entry_id;
      await removeConfigEntry(entryId);
      await pool.query('DELETE FROM ha_todo_lists WHERE project_id = $1', [projectId]);
    }

    await pool.query('DELETE FROM ha_todo_items WHERE task_id IN (SELECT id FROM tasks WHERE project_id = $1)', [projectId]);

    for (const [subId, sub] of subscriptions) {
      if (sub.projectId === projectId) {
        subscriptions.delete(subId);
        break;
      }
    }
  } catch (err) {
    console.error('Error removing HA todo list:', err);
  }
}

export async function renameTodoForProject(
  projectId: string,
  newName: string
): Promise<void> {
  await removeTodoForProject(projectId);
  await ensureTodoList(projectId, newName);
  await reconcileProjectTasks(projectId);
}

export async function addTodoItem(
  taskId: string,
  projectId: string,
  taskName: string
): Promise<void> {
  if (!ws || haState !== 'connected') return;

  const todo = await pool.query(
    'SELECT entity_id FROM ha_todo_lists WHERE project_id = $1',
    [projectId]
  );
  if (todo.rows.length === 0) return;
  const entityId = todo.rows[0].entity_id;

  try {
    const beforeItems = await getTodoItems(entityId);

    recentlyWritten.add(projectId);
    await callService('todo', 'add_item', { entity_id: entityId }, { item: taskName });

    const afterItems = await getTodoItems(entityId);

    const existingSet = new Set(beforeItems.map((i) => i.uid));
    const newItem = afterItems.find((i) => !existingSet.has(i.uid));

    if (newItem) {
      await pool.query(
        `INSERT INTO ha_todo_items (task_id, item_uid)
         VALUES ($1, $2)
         ON CONFLICT (task_id) DO UPDATE SET item_uid = $2`,
        [taskId, newItem.uid]
      );
    }
  } catch (err) {
    console.error('Error adding HA todo item:', err);
  } finally {
    setTimeout(() => recentlyWritten.delete(projectId), 1500);
  }
}

export async function updateTodoItem(
  taskId: string,
  projectId: string,
  taskName: string,
  taskStatus: string
): Promise<void> {
  if (!ws || haState !== 'connected') return;

  const todo = await pool.query(
    'SELECT entity_id FROM ha_todo_lists WHERE project_id = $1',
    [projectId]
  );
  if (todo.rows.length === 0) return;
  const entityId = todo.rows[0].entity_id;

  const mapping = await pool.query(
    'SELECT item_uid FROM ha_todo_items WHERE task_id = $1',
    [taskId]
  );
  if (mapping.rows.length === 0) return;
  const uid = mapping.rows[0].item_uid;

  try {
    recentlyWritten.add(projectId);
    const haStatus = taskStatus === 'DONE' ? 'completed' : 'needs_action';
    await callService(
      'todo',
      'update_item',
      { entity_id: entityId },
      { item: uid, rename: taskName, status: haStatus }
    );
  } catch (err) {
    console.error('Error updating HA todo item:', err);
  } finally {
    setTimeout(() => recentlyWritten.delete(projectId), 1500);
  }
}

export async function removeTodoItem(taskId: string): Promise<void> {
  if (!ws || haState !== 'connected') return;

  const mapping = await pool.query(
    'SELECT item_uid FROM ha_todo_items WHERE task_id = $1',
    [taskId]
  );
  if (mapping.rows.length === 0) return;
  const uid = mapping.rows[0].item_uid;

  const task = await pool.query('SELECT project_id FROM tasks WHERE id = $1', [taskId]);
  if (task.rows.length === 0) return;
  const projectId = task.rows[0].project_id;

  const todo = await pool.query(
    'SELECT entity_id FROM ha_todo_lists WHERE project_id = $1',
    [projectId]
  );
  if (todo.rows.length === 0) return;
  const entityId = todo.rows[0].entity_id;

  try {
    await callService('todo', 'remove_item', { entity_id: entityId }, { item: uid });
  } catch (err: any) {
    if (!err.message?.includes('not found')) {
      console.error('Error removing HA todo item:', err);
    }
  }
}

async function reconcileProjectTasks(projectId: string): Promise<void> {
  try {
    const todo = await pool.query(
      'SELECT entity_id FROM ha_todo_lists WHERE project_id = $1',
      [projectId]
    );
    if (todo.rows.length === 0) return;
    const entityId = todo.rows[0].entity_id;

    const tasks = await pool.query(
      'SELECT id, name, status FROM tasks WHERE project_id = $1',
      [projectId]
    );

    const items = await getTodoItems(entityId);

    const uidToTask = new Map<string, { id: string; name: string; status: string }>();
    const taskMappings = await pool.query(
      'SELECT task_id, item_uid FROM ha_todo_items WHERE task_id IN (SELECT id FROM tasks WHERE project_id = $1)',
      [projectId]
    );
    const taskUidMap = new Map<string, string>();
    for (const m of taskMappings.rows) {
      taskUidMap.set(m.task_id, m.item_uid);
      uidToTask.set(m.item_uid, {
        id: m.task_id,
        name: '',
        status: '',
      });
    }
    for (const task of tasks.rows) {
      const uid = taskUidMap.get(task.id);
      if (uid) {
        uidToTask.set(uid, { id: task.id, name: task.name, status: task.status });
      }
    }

    const itemUidSet = new Set(items.map((i) => i.uid));
    const addedTaskIds = new Set<string>();

    for (const task of tasks.rows) {
      const uid = taskUidMap.get(task.id);
      if (uid && itemUidSet.has(uid)) {
        const haItem = items.find((i) => i.uid === uid)!;
        const haStatus = task.status === 'DONE' ? 'completed' : 'needs_action';
        if (haItem.status !== haStatus || haItem.summary !== task.name) {
          recentlyWritten.add(projectId);
          await callService(
            'todo',
            'update_item',
            { entity_id: entityId },
            {
              item: uid,
              rename: task.name,
              status: haStatus,
            }
          );
          recentlyWritten.delete(projectId);
        }
      } else if (uid && !itemUidSet.has(uid)) {
        recentlyWritten.add(projectId);
        await callService('todo', 'add_item', { entity_id: entityId }, { item: task.name });
        recentlyWritten.delete(projectId);
        const afterItems = await getTodoItems(entityId);
        const newItem = afterItems.find(
          (i) => !itemUidSet.has(i.uid) && i.summary === task.name
        );
        if (newItem) {
          await pool.query(
            `INSERT INTO ha_todo_items (task_id, item_uid)
             VALUES ($1, $2)
             ON CONFLICT (task_id) DO UPDATE SET item_uid = $2`,
            [task.id, newItem.uid]
          );
        }
        addedTaskIds.add(task.id);
      } else if (!uid) {
        recentlyWritten.add(projectId);
        await callService('todo', 'add_item', { entity_id: entityId }, { item: task.name });
        recentlyWritten.delete(projectId);
        const afterItems = await getTodoItems(entityId);
        const existingSet = new Set(items.map((i) => i.uid));
        const newItem = afterItems.find(
          (i) => !existingSet.has(i.uid) && i.summary === task.name
        );
        if (newItem) {
          await pool.query(
            `INSERT INTO ha_todo_items (task_id, item_uid)
             VALUES ($1, $2)
             ON CONFLICT (task_id) DO UPDATE SET item_uid = $2`,
            [task.id, newItem.uid]
          );
        }
        addedTaskIds.add(task.id);
      }
    }

    for (const item of items) {
      const task = uidToTask.get(item.uid);
      if (!task || addedTaskIds.has(task.id)) continue;
      if (!tasks.rows.find((t: any) => t.id === task.id)) {
        try {
          await callService('todo', 'remove_item', { entity_id: entityId }, { item: item.uid });
          await pool.query('DELETE FROM ha_todo_items WHERE item_uid = $1', [item.uid]);
        } catch {}
      }
    }
  } catch (err) {
    console.error(`Error reconciling project ${projectId} tasks:`, err);
  }
}

export async function syncAllToHA(pg: typeof pool): Promise<void> {
  if (syncing) return;
  syncing = true;

  try {
    if (!ws || haState !== 'connected') {
      console.log('HA not connected, skipping sync');
      return;
    }

    console.log('Syncing projects to Home Assistant...');

    const allEntries = await getConfigEntries();
    const localTodoEntries = allEntries.filter((e: ConfigEntry) => e.domain === 'local_todo');
    const localTodoEntryIds = new Map<string, ConfigEntry>();
    for (const e of localTodoEntries) {
      localTodoEntryIds.set(e.entry_id, e);
    }

    const projects = await pg.query("SELECT * FROM projects WHERE status = 'Active'");

    const mappings = await pg.query('SELECT * FROM ha_todo_lists');
    const mappingMap = new Map<string, { entry_id: string; entity_id: string }>();
    for (const m of mappings.rows) {
      mappingMap.set(m.project_id, {
        entry_id: m.entry_id,
        entity_id: m.entity_id,
      });
    }

    for (const project of projects.rows) {
      const existing = mappingMap.get(project.id);
      const haEntry = existing ? localTodoEntryIds.get(existing.entry_id) : undefined;

      if (haEntry) {
        await pg.query(
          `INSERT INTO ha_todo_lists (project_id, entry_id, entity_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (project_id) DO UPDATE SET entry_id = $2, entity_id = $3`,
          [project.id, haEntry.entry_id, existing!.entity_id]
        );
        await subscribeTodoItems(existing!.entity_id, project.id);
      } else {
        const result = await ensureTodoList(project.id, project.name);
        if (!result) continue;
      }

      await reconcileProjectTasks(project.id);
    }

    const projectIdSet = new Set(projects.rows.map((p: any) => p.id));

    for (const haEntry of localTodoEntries) {
      let belongsToActive = false;
      for (const [projectId, mapping] of mappingMap) {
        if (mapping.entry_id === haEntry.entry_id && projectIdSet.has(projectId)) {
          belongsToActive = true;
          break;
        }
      }
      if (!belongsToActive) {
        try {
          await removeConfigEntry(haEntry.entry_id);
          console.log(`Removed stale HA todo entry: ${haEntry.title}`);
        } catch (err) {
          console.error(`Failed to remove stale HA entry ${haEntry.title}:`, err);
        }
      }
    }

    for (const [projectId] of mappingMap) {
      if (!projectIdSet.has(projectId)) {
        await pg.query('DELETE FROM ha_todo_lists WHERE project_id = $1', [projectId]);
        await pg.query(
          'DELETE FROM ha_todo_items WHERE task_id IN (SELECT id FROM tasks WHERE project_id = $1)',
          [projectId]
        );
      }
    }

    console.log(`Synced ${projects.rows.length} active projects to HA`);
  } catch (err) {
    console.error('Error syncing to HA:', err);
  } finally {
    syncing = false;
  }
}

export async function purgeOldMqttSensors(pg: typeof pool): Promise<void> {
  if (!process.env.MQTT_URL) {
    console.log('No MQTT_URL configured, skipping sensor purge');
    return;
  }

  const mqtt = await import('mqtt');
  const MQTT_PREFIX = 'project_mgmt';

  return new Promise((resolve) => {
    const client = mqtt.connect(process.env.MQTT_URL!, {
      username: process.env.MQTT_USERNAME || undefined,
      password: process.env.MQTT_PASSWORD || undefined,
    });

    client.on('connect', async () => {
      console.log('Purging old MQTT sensors...');

      try {
        const projects = await pg.query('SELECT id FROM projects');
        for (const p of projects.rows) {
          const safId = p.id.replace(/-/g, '_');
          const topic = `homeassistant/sensor/${MQTT_PREFIX}_project_${safId}/config`;
          client.publish(topic, '', { retain: true });
        }

        const tasks = await pg.query('SELECT id FROM tasks');
        for (const t of tasks.rows) {
          const safId = t.id.replace(/-/g, '_');
          const topic = `homeassistant/sensor/${MQTT_PREFIX}_task_${safId}/config`;
          client.publish(topic, '', { retain: true });
        }

        await new Promise((r) => setTimeout(r, 1500));
        console.log(
          `Purged ${projects.rows.length} project + ${tasks.rows.length} task MQTT sensors`
        );
      } catch (err) {
        console.error('Error purging MQTT sensors:', err);
      }

      client.end();
      resolve();
    });

    client.on('error', () => {
      client.end();
      resolve();
    });

    setTimeout(() => {
      try {
        client.end();
      } catch {}
      resolve();
    }, 10000);
  });
}

export function isHAConnected(): boolean {
  return haState === 'connected';
}
