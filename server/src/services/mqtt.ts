import mqtt, { MqttClient } from 'mqtt';
import { Pool } from 'pg';

const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
const MQTT_USERNAME = process.env.MQTT_USERNAME || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
const MQTT_TOPIC_PREFIX = 'project_mgmt';

let client: MqttClient | null = null;

export const connectMQTT = (): MqttClient => {
  const options = {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
  };
  client = mqtt.connect(MQTT_URL, options.username ? options : {});

  client.on('connect', () => {
    console.log('Connected to MQTT Broker');
  });

  client.on('error', (err) => {
    console.error('MQTT Connection Error:', err);
  });

  return client;
};

export const waitForConnection = (mqttClient: MqttClient, timeoutMs = 10000): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (mqttClient.connected) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      reject(new Error('MQTT connection timed out'));
    }, timeoutMs);
    mqttClient.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    mqttClient.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
};

export const announceEntity = (type: 'project' | 'task', id: string, name: string) => {
  if (!client) return;

  const configTopic = `homeassistant/sensor/${MQTT_TOPIC_PREFIX}_${type}_${id.replace(/-/g, '_')}/config`;
  const stateTopic = `${MQTT_TOPIC_PREFIX}/${type}/${id}/state`;

  const configPayload = {
    name: `${type === 'project' ? 'Project' : 'Task'}: ${name}`,
    state_topic: stateTopic,
    value_template: '{{ value_json.status }}',
    unique_id: `${MQTT_TOPIC_PREFIX}_${type}_${id}`,
    json_attributes_topic: stateTopic,
    device: {
      identifiers: ['project_mgmt_system'],
      name: 'Project Management System',
      model: 'TypeScript/Postgres App',
      manufacturer: 'Gemini CLI',
    },
  };

  client.publish(configTopic, JSON.stringify(configPayload), { retain: true });
};

export const updateEntityState = (type: 'project' | 'task', id: string, name: string, status: string, details: Record<string, unknown> = {}) => {
  if (!client) return;

  const stateTopic = `${MQTT_TOPIC_PREFIX}/${type}/${id}/state`;
  const statePayload = {
    status,
    name,
    ...details,
    updated_at: new Date().toISOString(),
  };

  client.publish(stateTopic, JSON.stringify(statePayload), { retain: true });
};

export const deleteEntity = (type: 'project' | 'task', id: string) => {
  if (!client) return;
  const configTopic = `homeassistant/sensor/${MQTT_TOPIC_PREFIX}_${type}_${id.replace(/-/g, '_')}/config`;
  client.publish(configTopic, '', { retain: true }); // Empty payload removes the entity from HA
};

export const syncAllToHA = async (pool: Pool) => {
  if (!client) return;
  console.log('Syncing all projects and tasks to Home Assistant...');
  
  try {
    // Sync Projects
    const projects = await pool.query('SELECT * FROM projects');
    for (const project of projects.rows) {
      announceEntity('project', project.id, project.name);
      updateEntityState('project', project.id, project.name, project.status, { deadline: project.deadline });
    }

    // Sync Tasks
    const tasks = await pool.query('SELECT * FROM tasks');
    for (const task of tasks.rows) {
      announceEntity('task', task.id, task.name);
      updateEntityState('task', task.id, task.name, task.status, { deadline: task.deadline, project_id: task.project_id });
    }
    console.log(`Synced ${projects.rows.length} projects and ${tasks.rows.length} tasks.`);
  } catch (err) {
    console.error('Error syncing to HA:', err);
  }
};

export default { connectMQTT, waitForConnection, announceEntity, updateEntityState, deleteEntity, syncAllToHA };
