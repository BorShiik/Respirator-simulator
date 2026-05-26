const sqlite3 = require('c:/Users/BorShiik/Desktop/prog/JS/Collegiate Programming/respirator-simulator/Respirator-simulator/backend/node_modules/sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve('c:/Users/BorShiik/Desktop/prog/JS/Collegiate Programming/respirator-simulator/Respirator-simulator/backend/respirator-trainer.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
});

// Mock of sessions.service mapping function
function mapSessionToFrontend(session, logs) {
  const sortedLogs = (logs || []).sort((a, b) => a.timestamp - b.timestamp);

  let totalDuration = 0;
  if (session.startedAt && session.endedAt) {
    totalDuration = Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000);
  } else if (session.startedAt) {
    totalDuration = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000);
  }

  const settingChanges = sortedLogs.filter(l => l.eventType === 'setting_change');
  const numberOfSettingChanges = settingChanges.length;

  const asynchronyStartLogs = sortedLogs.filter(l => l.eventType === 'asynchrony_start');
  const asynchronyEndLogs = sortedLogs.filter(l => l.eventType === 'asynchrony_end');
  const asynchronyTypes = [...new Set(asynchronyStartLogs.map(l => l.asynchronyType).filter(Boolean))];

  let timeToResolveAsynchrony = null;
  if (asynchronyStartLogs.length > 0 && asynchronyEndLogs.length > 0) {
    timeToResolveAsynchrony = Math.round(
      (asynchronyEndLogs[0].timestamp - asynchronyStartLogs[0].timestamp) / 1000
    );
  }

  const successfulResolution = asynchronyEndLogs.length > 0;
  const durationMinutes = totalDuration > 0 ? totalDuration / 60 : 1;
  const chaosIndex = Math.min(1, Math.round((numberOfSettingChanges / durationMinutes) * 100) / 100);

  return {
    id: session.id,
    stationId: session.stationId,
    traineeName: session.studentName || session.stationId,
    scenarioName: session.scenarioName || 'Free Practice',
    status: session.status,
    metrics: {
      totalDuration,
      timeToResolveAsynchrony,
      numberOfSettingChanges,
      chaosIndex,
      asynchronyDetected: asynchronyStartLogs.length > 0,
      asynchronyTypes,
      successfulResolution,
      startLogsCount: asynchronyStartLogs.length,
      endLogsCount: asynchronyEndLogs.length
    },
  };
}

db.serialize(() => {
  db.all('SELECT * FROM sessions ORDER BY createdAt DESC', [], (err, sessions) => {
    if (err) {
      console.error(err);
      return;
    }
    
    db.all('SELECT * FROM session_logs', [], (err, allLogs) => {
      if (err) {
        console.error(err);
        return;
      }
      
      const mapped = sessions.map(s => {
        const logs = allLogs.filter(l => l.sessionId === s.id);
        return mapSessionToFrontend(s, logs);
      });
      
      console.log('=== MAPPED SESSIONS ===');
      console.log(JSON.stringify(mapped, null, 2));
      db.close();
    });
  });
});
