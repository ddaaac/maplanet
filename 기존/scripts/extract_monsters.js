// 메이플랜드 N방컷 계산기의 monster.js 를 실행해서 monsterlist 배열을 JSON 으로 덤프
// 출처: ~/Desktop/메이플랜드 N방컷 확률 계산기_files/monster.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = "/Users/corby/Desktop/메이플랜드 N방컷 확률 계산기_files/monster.js";
const OUT = path.join(__dirname, "..", "data", "mapleland_monsters.json");

// monsterlist 가 const 로 선언되어 있어 context 의 전역으로 새지 않음 → 끝에 노출 코드 덧붙임
const code = fs.readFileSync(SRC, "utf8") + "\n;globalThis.__monsters = monsterlist;";
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: "monster.js" });
ctx.monsterlist = ctx.__monsters;

if (!Array.isArray(ctx.monsterlist)) {
  throw new Error("monsterlist not found / not an array");
}

const monsters = ctx.monsterlist;
fs.writeFileSync(OUT, JSON.stringify(monsters, null, 2));
console.log(`총 ${monsters.length}마리 → ${OUT}`);

const byDistrict = {};
for (const m of monsters) {
  byDistrict[m.district] = (byDistrict[m.district] || 0) + 1;
}
console.log("\n지역별 분포:");
for (const [k, v] of Object.entries(byDistrict).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

console.log("\n샘플 5개:");
console.log(JSON.stringify(monsters.slice(0, 5), null, 2));
