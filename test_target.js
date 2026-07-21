const s = { seasonTarget: 0 };
const rawTarget = Number(s.seasonTarget ?? 0);
console.log("seasonTarget:", rawTarget > 0 ? rawTarget : 1_000_000);
