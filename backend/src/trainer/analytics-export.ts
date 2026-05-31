import * as ExcelJS from 'exceljs';

/**
 * Shape produced by SessionsService.mapSessionToFrontend()
 * (the same objects returned by GET /trainer/sessions).
 */
export interface ExportMetrics {
  totalDuration: number;
  timeToResolveAsynchrony: number | null;
  numberOfSettingChanges: number;
  chaosIndex: number;
  asynchronyDetected: boolean;
  asynchronyTypes: string[];
  successfulResolution: boolean;
}

export interface ExportSession {
  id: string;
  stationId: string;
  traineeId: string;
  traineeName: string;
  scenarioId: string | null;
  scenarioName: string;
  roomId: string | null;
  startTime: number;
  endTime: number | null;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'ABORTED' | 'PENDING';
  metrics: ExportMetrics;
}

const STATUS_PL: Record<string, string> = {
  COMPLETED: 'Ukończona',
  IN_PROGRESS: 'W toku',
  ABORTED: 'Przerwana',
  PENDING: 'Oczekująca',
};

/**
 * Builds an .xlsx analytics workbook with a per-student breakdown.
 *
 *   - "Podsumowanie" sheet: one row per student with aggregate stats.
 *   - one sheet per student: every session of that student in detail.
 *
 * Returns a Buffer ready to stream as an HTTP response.
 */
export async function buildAnalyticsWorkbook(
  sessions: ExportSession[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Symulator Respiratora';
  wb.created = new Date();

  // ─── Group sessions by student ──────────────────────────────
  const byStudent = new Map<string, ExportSession[]>();
  for (const s of sessions) {
    const key = s.traineeName || s.traineeId || 'Nieznany';
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key)!.push(s);
  }

  const students = Array.from(byStudent.keys()).sort((a, b) =>
    a.localeCompare(b, 'pl'),
  );

  // ─── Summary sheet ──────────────────────────────────────────
  const summary = wb.addWorksheet('Podsumowanie');
  summary.columns = [
    { header: 'Uczeń', key: 'student', width: 28 },
    { header: 'Liczba sesji', key: 'count', width: 14 },
    { header: 'Ukończone', key: 'completed', width: 12 },
    { header: 'Z asynchronią', key: 'withAsync', width: 14 },
    { header: 'Śr. czas reakcji (s)', key: 'avgReaction', width: 20 },
    { header: 'Śr. liczba zmian', key: 'avgChanges', width: 18 },
    { header: 'Skuteczność %', key: 'successRate', width: 14 },
    { header: 'Łączny czas (s)', key: 'duration', width: 16 },
    { header: 'Ostatnia sesja', key: 'last', width: 20 },
  ];
  styleHeader(summary);

  for (const name of students) {
    const list = byStudent.get(name)!;
    const count = list.length;
    const completed = list.filter((s) => s.status === 'COMPLETED').length;
    const withAsync = list.filter((s) => s.metrics?.asynchronyDetected).length;
    const reactionVals = list
      .map((s) => s.metrics?.timeToResolveAsynchrony)
      .filter((v): v is number => v != null && v > 0);
    const avgReaction = reactionVals.length ? avg(reactionVals) : 0;
    const avgChanges = avg(list.map((s) => s.metrics?.numberOfSettingChanges || 0));
    const successRate =
      count > 0
        ? (list.filter((s) => s.metrics?.successfulResolution).length / count) *
          100
        : 0;
    const duration = sum(list.map((s) => s.metrics?.totalDuration || 0));
    const last = Math.max(...list.map((s) => s.startTime || 0));

    summary.addRow({
      student: name,
      count,
      completed,
      withAsync,
      avgReaction: round1(avgReaction),
      avgChanges: round1(avgChanges),
      successRate: Math.round(successRate),
      duration,
      last: last ? formatDate(last) : '—',
    });
  }

  // ─── Per-student detail sheets ──────────────────────────────
  const usedNames = new Set<string>();
  for (const name of students) {
    const list = [...byStudent.get(name)!].sort(
      (a, b) => (b.startTime || 0) - (a.startTime || 0),
    );

    const ws = wb.addWorksheet(uniqueSheetName(name, usedNames));
    ws.columns = [
      { header: 'Data', key: 'date', width: 20 },
      { header: 'Scenariusz', key: 'scenario', width: 26 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Czas trwania (s)', key: 'duration', width: 16 },
      { header: 'Czas reakcji (s)', key: 'reaction', width: 16 },
      { header: 'Liczba zmian', key: 'changes', width: 14 },
      { header: 'Chaos index', key: 'chaos', width: 13 },
      { header: 'Asynchronia', key: 'async', width: 14 },
      { header: 'Typy asynchronii', key: 'asyncTypes', width: 34 },
      { header: 'Rozwiązano', key: 'resolved', width: 13 },
    ];
    styleHeader(ws);

    for (const s of list) {
      ws.addRow({
        date: s.startTime ? formatDate(s.startTime) : '—',
        scenario: s.scenarioName || '—',
        status: STATUS_PL[s.status] || s.status,
        duration: s.metrics?.totalDuration || 0,
        reaction: s.metrics?.timeToResolveAsynchrony ?? '—',
        changes: s.metrics?.numberOfSettingChanges || 0,
        chaos: s.metrics?.chaosIndex ?? 0,
        async: s.metrics?.asynchronyDetected ? 'Tak' : 'Nie',
        asyncTypes: (s.metrics?.asynchronyTypes || []).join(', ') || '—',
        resolved: s.metrics?.successfulResolution ? 'Tak' : 'Nie',
      });
    }
  }

  if (students.length === 0) {
    const ws = wb.addWorksheet('Brak danych');
    ws.addRow(['Brak zapisanych sesji.']);
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

// ─── helpers ──────────────────────────────────────────────────
function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}
function avg(arr: number[]): number {
  return arr.length ? sum(arr) / arr.length : 0;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function formatDate(ms: number): string {
  const date = new Date(ms);
  if (isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function styleHeader(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF065A82' },
  };
  header.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}
/** Excel sheet names: max 31 chars, unique, cannot contain : \ / ? * [ ] */
function uniqueSheetName(name: string, used: Set<string>): string {
  const cleaned = (name.replace(/[:\\/?*[\]]/g, '-').trim() || 'Uczeń').slice(
    0,
    31,
  );
  let candidate = cleaned;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i})`;
    candidate = cleaned.slice(0, 31 - suffix.length) + suffix;
    i++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}
