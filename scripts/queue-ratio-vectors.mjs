// The fast-pass ratio, checked against the spec's own expected sequences.
//
// Mirrors public.queue_next_lane and the counter updates in
// supabase/migrations/20260817160000_fastpass_queue.sql. The SQL is what
// runs; this exists so a change to the rule can be re-checked in a second
// without a database. If you change one, change both — a divergence here is
// a bug in whichever copy you did not mean to change.
//
//   node scripts/queue-ratio-vectors.mjs
//
// Note on the 8/8/8 case: the spec lists 20 dispatches for 24 requests. The
// listed 20 are exact; the trailing "F F F F" is the free lane draining
// once pro and go are empty, which the spec simply stops short of.
const nextLane = (psg, gsf, p, g, f) =>
  p && !((psg >= 2 && g) || (!g && f && psg >= 2 && gsf >= 2)) ? 'pro'
  : g && !(gsf >= 2 && f) ? 'go'
  : f ? 'free'
  : g ? 'go'
  : p ? 'pro'
  : null;

function run(nPro, nGo, nFree) {
  let psg = 0, gsf = 0, pi = 0, gi = 0, fi = 0, out = '';
  for (;;) {
    const lane = nextLane(psg, gsf, pi < nPro, gi < nGo, fi < nFree);
    if (!lane) break;
    if (lane === 'pro')  { pi++; psg++; if (gi >= nGo) gsf++; out += 'P '; }
    else if (lane === 'go') { gi++; psg = 0; gsf++; out += 'G '; }
    else { fi++; psg = 0; gsf = 0; out += 'F '; }
  }
  return out.trim();
}

const cases = [
  ['all lanes full (8/8/8)', [8,8,8], 'P P G P P G P P F P P G G F G G F G G F'],
  ['pro only (5/0/0)',       [5,0,0], 'P P P P P'],
  ['pro empties (3/3/0)',    [3,3,0], 'P P G P G G'],
  ['pro+go, no free (6/3/0)',[6,3,0], 'P P G P P G P P G'],
  ['pro+free, no go (6/0/3)',[6,0,3], 'P P F P P F P P F'],
  ['go+free, no pro (0/6/3)',[0,6,3], 'G G F G G F G G F'],
];
let bad = 0;
for (const [name, args, want] of cases) {
  const got = run(...args);
  const ok = got === want || got.startsWith(want + ' ');
  if (!ok) bad++;
  const exact = got === want;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok && !exact ? `  (spec lists first ${want.split(' ').length}; tail: ${got.slice(want.length).trim()})` : ''}`);
  if (!ok) console.log(`      want ${want}\n      got  ${got}`);
}
console.log(bad ? `\n${bad} FAILED` : '\nall 6 vectors reproduce');
