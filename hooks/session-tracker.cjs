const fs = require('fs');
const path = require('path');
const config = require('../../config.cjs');

const STATE_FILE = path.join(
  config.getHistoryDir(),
  '.session-state.json'
);

function readSessionState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {}
  return null;
}

function saveSessionState(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {}
}

function getOrCreateSession(sessionId) {
  const existingState = readSessionState();
  if (!existingState || existingState.sessionId !== sessionId) {
    const state = {
      sessionId: sessionId,
      startTime: new Date().toISOString(),
      promptCount: 0,
      responseCount: 0,
      currentFile: null,
      currentTopic: null,
      currentPart: 1,
      filePaths: [],
      lastActivity: new Date().toISOString()
    };
    return state;
  }
  return existingState;
}

function updateSessionState(sessionId, updates) {
  const state = getOrCreateSession(sessionId);
  Object.assign(state, updates);
  saveSessionState(state);
  return state;
}

function cleanupOldSessions() {
  const state = readSessionState();
  if (!state) return;
  const startTime = new Date(state.startTime);
  const now = new Date();
  const hoursDiff = (now - startTime) / (1000 * 60 * 60);
  if (hoursDiff > 24) {
    try { fs.unlinkSync(STATE_FILE); } catch (e) {}
  }
}

module.exports = {
  readSessionState,
  saveSessionState,
  getOrCreateSession,
  updateSessionState,
  cleanupOldSessions
};
