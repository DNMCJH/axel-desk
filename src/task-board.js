'use strict';

const { parseList } = require('./util');

// Older installs may not have these source hygiene rules in their saved settings.
function excludedTaskFile(path, settings) {
  const normalized = String(path || '').replace(/\\/g, '/');
  if (/(^|\/)(_history|_archive|templates?|node_modules|\.git|\.obsidian)(\/|$)/i.test(normalized)) return true;
  return parseList(settings.taskExcludes).some((fragment) => normalized.includes(fragment));
}

function groupTaskFiles(tasks, settings = {}) {
  const groups = new Map();
  (tasks || []).forEach((task) => {
    if (!task.path || task.done || task.cancelled || excludedTaskFile(task.path, settings)) return;
    if (!groups.has(task.path)) {
      groups.set(task.path, {
        path: task.path, name: task.path.split('/').pop(),
        count: 0, line: task.line, mtime: task.mtime || 0,
      });
    }
    const group = groups.get(task.path);
    group.count += 1;
    group.line = Math.min(group.line, task.line);
  });
  return [...groups.values()].sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path));
}

function taskFileItem(file) {
  return {
    cardId: 'task-files', cardLabel: '含待办的文件', id: file.path,
    label: file.name, sourcePaths: [file.path],
    // Explicitly removed files stay removed even when their tasks change.
    signature: file.path,
  };
}

function normalizeManualTasks(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter((task) => task && typeof task.id === 'string' && task.id.trim()
    && typeof task.text === 'string' && task.text.trim()).filter((task) => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  }).map((task) => ({ id: task.id, text: task.text.trim(), done: task.done === true }));
}

function manualTaskItem(task) {
  return {
    cardId: 'manual-tasks', cardLabel: '个人待办', id: task.id,
    label: task.text, sourcePaths: [], signature: task.id,
  };
}

module.exports = { excludedTaskFile, groupTaskFiles, taskFileItem, normalizeManualTasks, manualTaskItem };
