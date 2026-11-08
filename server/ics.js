'use strict';
// iCalendar text -> the events that fall in a date range, in the shape Home Assistant's calendar.get_events returns.
const ICAL = require('ical.js');

const MAX_OCCURRENCES = 10000; // ponytail: caps a runaway rule; raise it if a series older than that must show

const stamp = (t) => (t.isDate ? t.toString() : t.toJSDate().toISOString());

function expand(text, from, to) {
  const root = new ICAL.Component(ICAL.parse(text));
  root.getAllSubcomponents('vtimezone').forEach((tz) => ICAL.TimezoneService.register(tz));
  const events = root.getAllSubcomponents('vevent').map((v) => new ICAL.Event(v));
  const masters = events.filter((e) => !e.isRecurrenceException());
  const orphans = [];
  events.filter((e) => e.isRecurrenceException()).forEach((ex) => {
    const master = masters.find((m) => m.uid === ex.uid);
    if (master) master.relateException(ex); else orphans.push(ex);
  });

  const start = ICAL.Time.fromJSDate(from, true), end = ICAL.Time.fromJSDate(to, true);
  const out = [];
  const add = (item, s, e) => {
    if (item.component.getFirstPropertyValue('status') === 'CANCELLED' || s.compare(end) >= 0 || e.compare(start) <= 0) return;
    out.push({ summary: item.summary || '', start: stamp(s), end: stamp(e), description: item.description || '', location: item.location || '', uid: item.uid });
  };
  [...masters, ...orphans].forEach((ev) => {
    if (!ev.isRecurring()) return add(ev, ev.startDate, ev.endDate);
    const it = ev.iterator();
    for (let n = 0, next; n < MAX_OCCURRENCES && (next = it.next()); n++) {
      if (next.compare(end) >= 0) break;
      const d = ev.getOccurrenceDetails(next);
      add(d.item, d.startDate, d.endDate);
    }
  });
  return out;
}

module.exports = { expand };
