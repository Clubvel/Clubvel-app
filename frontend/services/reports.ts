export interface ReportRow {
  contribution_id: string;
  member_id: string;
  person_id: string;
  member_name: string | null;
  month: number;
  year: number;
  amount_due: number;
  amount_paid: number;
  outstanding: number;
  awaiting_verification: number;
  status: string;
  recorded_status: string;
  payment_date: string | null;
}
export interface GroupReport {
  schema_version: 1;
  group_id: string;
  group_name: string;
  year: number;
  month: number | null;
  generated_at: string;
  rows: ReportRow[];
  summary: {
    total_collected: number;
    recorded_obligations: number;
    collection_rate: number | null;
    outstanding: number;
    awaiting_verification: number;
    late_members: number;
  };
}
const amount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const named = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const statuses = ['pending', 'due', 'late', 'proof_uploaded', 'confirmed', 'paid', 'excused'];

export function groupReport(data: unknown, groupId: string, year: number, month: number | null): GroupReport {
  const d = data as GroupReport;
  const s = d?.summary;
  if (!d || d.schema_version !== 1 || d.group_id !== groupId || !named(d.group_name) ||
      d.year !== year || d.month !== month || !named(d.generated_at) || !Number.isFinite(Date.parse(d.generated_at)) ||
      !s || ![s.total_collected, s.recorded_obligations, s.outstanding, s.awaiting_verification].every(amount) ||
      !Number.isInteger(s.late_members) || s.late_members < 0 ||
      (s.recorded_obligations === 0 ? s.collection_rate !== null : !amount(s.collection_rate) || s.collection_rate > 100) ||
      !Array.isArray(d.rows)) throw new Error('The report could not be verified. Please retry.');
  const ids = new Set<string>();
  for (const row of d.rows) {
    if (!row || ![row.contribution_id, row.member_id, row.person_id].every(named) || ids.has(row.contribution_id) ||
        !(row.member_name === null || named(row.member_name)) ||
        ![row.amount_due, row.amount_paid, row.outstanding, row.awaiting_verification].every(amount) ||
        !statuses.includes(row.status) || !statuses.includes(row.recorded_status) ||
        row.year !== year || !Number.isInteger(row.month) || row.month < 1 || row.month > 12 ||
        (month !== null && row.month !== month) || !(row.payment_date === null || typeof row.payment_date === 'string')) {
      throw new Error('The report records could not be verified. Please retry.');
    }
    ids.add(row.contribution_id);
  }
  return d;
}

export const reportMoney = (value: number) => `R${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
export const reportPeriod = (report: GroupReport) => report.month === null ? `${report.year} (full year)` : `${report.year}-${String(report.month).padStart(2, '0')}`;
export const reportExplanation = 'Collected is recorded amount paid. The rate is paid amounts applied to non-excused recorded obligations, capped at each obligation. Uploaded proofs awaiting verification are separate from payment outstanding. Status reflects current records, not a historical ledger snapshot.';
export function reportSummary(report: GroupReport) {
  const s = report.summary;
  return [
    ['Total Collected', reportMoney(s.total_collected)],
    ['Collection Rate', s.collection_rate === null ? 'Not applicable' : `${s.collection_rate.toFixed(2)}%`],
    ['Outstanding', reportMoney(s.outstanding)],
    ['Late Members', String(s.late_members)],
    ['Recorded Obligations (excluding excused)', reportMoney(s.recorded_obligations)],
    ['Awaiting Verification', reportMoney(s.awaiting_verification)],
  ];
}
export function reportRowValues(row: ReportRow) {
  return [row.member_name || 'Name unavailable', `${row.year}-${String(row.month).padStart(2, '0')}`,
    reportMoney(row.amount_due), reportMoney(row.amount_paid), reportMoney(row.outstanding),
    reportMoney(row.awaiting_verification), row.status.replace(/_/g, ' '), row.payment_date || 'Unavailable'];
}
export const reportColumns = ['Person', 'Period', 'Recorded amount', 'Paid', 'Outstanding', 'Awaiting verification', 'Status', 'Recorded payment/proof date'];
const escapeHTML = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function generateReportHTML(report: GroupReport): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Clubvel Report</title>
    <style>body{font-family:Arial,sans-serif;color:#3F4145;padding:24px;font-size:12px}table{border-collapse:collapse;width:100%;margin-top:20px}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}tr{page-break-inside:avoid}th{background:#f5f5f5}p{line-height:1.5}</style></head><body>
    <h1>Clubvel — Contribution Report</h1><h2>${escapeHTML(report.group_name)}</h2>
    <p>Group: ${escapeHTML(report.group_id)}<br>Period: ${escapeHTML(reportPeriod(report))}<br>Generated: ${escapeHTML(report.generated_at)}</p>
    <table>${reportSummary(report).map(([label, value]) => `<tr><th>${escapeHTML(label)}</th><td>${escapeHTML(value)}</td></tr>`).join('')}</table>
    <p>${escapeHTML(reportExplanation)}</p>
    ${report.rows.length ? `<table><thead><tr>${reportColumns.map(c => `<th>${escapeHTML(c)}</th>`).join('')}</tr></thead><tbody>${report.rows.map(row => `<tr>${reportRowValues(row).map(v => `<td>${escapeHTML(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p>No contribution records for this period.</p>'}
    </body></html>`;
}
