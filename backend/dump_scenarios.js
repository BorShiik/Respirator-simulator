const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'respirator-trainer.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected.');
});

db.all('SELECT id, name, description, initialSettings, blocks, durationSeconds FROM scenarios', [], (err, rows) => {
  if (err) {
    console.error('Error querying scenarios:', err.message);
    db.close();
    process.exit(1);
  }

  console.log('\n--- SCENARIOS ---');
  rows.forEach((row) => {
    console.log(`\nID: ${row.id}`);
    console.log(`Name: ${row.name}`);
    console.log(`Description: ${row.description}`);
    console.log(`Duration: ${row.durationSeconds}s`);
    console.log('Initial Settings:', row.initialSettings);
    console.log('Blocks:', row.blocks);
  });

  db.close();
});
