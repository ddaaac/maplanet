// skills.js 를 실행해서 전역으로 노출된 스킬 데이터 객체들을 모두 JSON 으로 덤프
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = "/Users/corby/Desktop/메이플랜드 N방컷 확률 계산기_files/skills.js";
const OUT_DIR = path.join(__dirname, "..", "data");

// 전역으로 등록되도록 trailing snippet 으로 globalThis 에 모든 식별자를 모아 노출
// 파일을 일단 실행한 뒤 vm context 의 키를 읽으면, const 는 안 잡히므로
// 한 번 실행해서 const 식별자 목록(난독화 + clean) 을 추출 → 해당 식별자들을 globalThis 에 매핑하는 코드를 덧붙여 재실행
const code = fs.readFileSync(SRC, "utf8");

// const 선언 식별자 추출 (clean 만 — 난독화된 _0x... 는 헬퍼라 제외)
const declRe = /(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
const cleanNames = new Set();
let m;
while ((m = declRe.exec(code)) !== null) {
  if (!m[1].startsWith("_0x")) cleanNames.add(m[1]);
}
console.log("clean 식별자:", [...cleanNames].join(", "));

const exposeSnippet =
  "\n;globalThis.__exports = {" +
  [...cleanNames].map((n) => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(", ") +
  "};";

const ctx = {};
vm.createContext(ctx);
vm.runInContext(code + exposeSnippet, ctx, { filename: "skills.js" });

const out = ctx.__exports;
fs.writeFileSync(path.join(OUT_DIR, "mapleland_skills.json"), JSON.stringify(out, null, 2));

console.log("\n키별 사이즈:");
for (const [k, v] of Object.entries(out)) {
  const s = JSON.stringify(v);
  console.log(`  ${k}: ${s ? s.length : 0} bytes`);
}
console.log("\n샘플:");
for (const [k, v] of Object.entries(out)) {
  console.log(`\n--- ${k} ---`);
  console.log(JSON.stringify(v, null, 2).slice(0, 800));
}
