export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === value;
}
const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
export function dateFrom(quote) {
  const explicitDates = quote.match(/\b\d{4}-\d{2}-\d{2}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4}\b/gi) || [];
  if (explicitDates.length > 1) return {dueDate:'', uncertainty:'Multiple dates on this line. Split the tasks and choose each due date manually.'};
  const iso = quote.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return validDate(iso[1]) ? {dueDate:iso[1], uncertainty:''} : {dueDate:'', uncertainty:'Invalid calendar date. Set a date manually.'};
  const named = quote.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/i);
  if (named) {
    const value = `${named[3]}-${String(months.indexOf(named[1].toLowerCase())+1).padStart(2,'0')}-${named[2].padStart(2,'0')}`;
    return validDate(value) ? {dueDate:value, uncertainty:''} : {dueDate:'',uncertainty:'Invalid calendar date. Set a date manually.'};
  }
  return {dueDate:'', uncertainty:/\b(\d{1,2}[/-]\d{1,2}|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(quote) ? 'Date is ambiguous, relative, or missing a year. Confirm it manually.' : 'No supported explicit date found. Add one if needed.'};
}
export function extract(text) {
  const tasks = [];
  const lines = [...text.matchAll(/[^\r\n]+/g)];
  for (const line of lines) {
    const quote = line[0];
    if (!/\b(submit|write|prepare|deliver|create|complete|upload|present|read|design|build|due|deadline|report|essay|presentation|draft|proposal|quiz|exam|worksheet)\b/i.test(quote) && !/^\s*[-*•\d]+[.)]?\s+/.test(quote)) continue;
    tasks.push({title:quote.trim().replace(/^[-*•\d]+[.)]?\s+/, '').slice(0,200), quote, sourceStart:line.index, ...dateFrom(quote), completed:false});
    if (tasks.length === 50) break;
  }
  return {mode:'local-deterministic', tasks, warning:'Rule-based line extraction, not AI. It can miss tasks or combine multiple deliverables. Check every title, quote, and date before saving. Only ISO dates and English month-first dates with explicit years are recognized. Times and time zones are not extracted.'};
}
