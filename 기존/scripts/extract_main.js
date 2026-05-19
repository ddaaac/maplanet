// main.js 를 jQuery/document 를 stub 한 채 실행해서 전역 데이터(districtName, ONE_HANDED_SWORD 등) 추출
// 함수 선언은 실행되어도 부작용 없으니 안전. DOM 접근 코드만 stub 으로 흡수.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = "/Users/corby/Desktop/메이플랜드 N방컷 확률 계산기_files/main.js";
const OUT_DIR = path.join(__dirname, "..", "data");
const code = fs.readFileSync(SRC, "utf8");

const declRe = /(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
const cleanNames = new Set();
let m;
while ((m = declRe.exec(code)) !== null) {
  if (!m[1].startsWith("_0x")) cleanNames.add(m[1]);
}
console.log("clean 식별자:", [...cleanNames].join(", "));

// jQuery / document / window stub
function makeJQueryStub() {
  const jq = function () {
    return new Proxy(
      {},
      {
        get: () => () => jq(),
      }
    );
  };
  return jq;
}

// const NAME = ...  →  globalThis.NAME = ... 로 치환해서 실행이 중간에 죽어도 데이터가 살아남게
const TARGETS = ["ONE_HANDED_SWORD", "districtName"];
let patched = code;
for (const n of TARGETS) {
  patched = patched.replace(new RegExp(`(?:const|let|var)\\s+${n}\\s*=`, "g"), `globalThis.${n} =`);
}
const exposeSnippet = "";

const docStub = new Proxy(
  {},
  {
    get: () => () =>
      new Proxy(
        {},
        {
          get: () => () => null,
        }
      ),
  }
);

const ctx = {
  $: makeJQueryStub(),
  jQuery: makeJQueryStub(),
  document: docStub,
  window: {},
  console,
  setTimeout: () => {},
  setInterval: () => {},
  localStorage: {
    getItem: () => null,
    setItem: () => {},
  },
  navigator: { userAgent: "" },
};
ctx.window = ctx;
vm.createContext(ctx);

try {
  vm.runInContext(patched + exposeSnippet, ctx, { filename: "main.js" });
} catch (e) {
  console.log("실행 중 에러 (그래도 globalThis 에 박힌 const 는 잡혔을 수 있음):", e.message);
}

const out = {};
for (const n of TARGETS) {
  if (ctx[n] !== undefined) out[n] = ctx[n];
}

// 실행이 중간에 죽어 districtName 등이 잡히지 않았으면, 단일 statement 만 잘라서 평가
function extractSingleDecl(src, name) {
  const reBracket = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*([\\[{])`, "g");
  const reEq = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*`, "g");
  const m = reBracket.exec(src);
  if (!m) return undefined;
  const open = m[1];
  const close = open === "[" ? "]" : "}";
  const start = src.indexOf(open, m.index);
  let depth = 0,
    inStr = false,
    strCh = "",
    i = start;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === strCh) inStr = false;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = true;
      strCh = c;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  return src.slice(start, i);
}

for (const n of TARGETS) {
  if (out[n] !== undefined) continue;
  const expr = extractSingleDecl(code, n);
  if (!expr) continue;
  // 표현식이 _0x... 호출을 포함하면, 의존하는 obf 헬퍼들도 함께 평가해야 함.
  // 가장 안전한 방법: 파일 처음부터 해당 const 끝까지 잘라서 평가
  const reBracket = new RegExp(`(?:const|let|var)\\s+${n}\\s*=\\s*([\\[{])`);
  const startMatch = code.match(reBracket);
  if (!startMatch) continue;
  const startIdx = code.indexOf(startMatch[0]);
  const exprStart = code.indexOf(startMatch[1], startIdx);
  const exprEnd = exprStart + expr.length;
  const prefix = code.slice(0, startIdx);
  const sliced = prefix + `globalThis.${n} = ` + expr + ";";
  const ctx2 = {
    $: makeJQueryStub(),
    jQuery: makeJQueryStub(),
    document: docStub,
    window: {},
    console,
    setTimeout: () => {},
    setInterval: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
    navigator: { userAgent: "" },
  };
  ctx2.window = ctx2;
  vm.createContext(ctx2);
  try {
    vm.runInContext(sliced, ctx2, { filename: "main.js#" + n });
    if (ctx2[n] !== undefined) out[n] = ctx2[n];
  } catch (e) {
    console.log(`  ${n} 단일 추출 실패:`, e.message);
  }
}
console.log("\n키별 사이즈:");
for (const [k, v] of Object.entries(out)) {
  if (v === undefined) {
    console.log(`  ${k}: undefined`);
    continue;
  }
  let s;
  try {
    s = JSON.stringify(v);
  } catch {
    s = "(circular)";
  }
  console.log(`  ${k}: ${typeof v} ${s ? s.length : 0} bytes`);
}

// JSON 으로 저장 가능한 것만 골라 저장
const dumpable = {};
for (const [k, v] of Object.entries(out)) {
  if (v === undefined) continue;
  if (typeof v === "function") continue;
  try {
    JSON.stringify(v);
    dumpable[k] = v;
  } catch {}
}
fs.writeFileSync(path.join(OUT_DIR, "mapleland_main_consts.json"), JSON.stringify(dumpable, null, 2));
console.log(`\n저장 → data/mapleland_main_consts.json (${Object.keys(dumpable).length} 키)`);

console.log("\n샘플:");
for (const [k, v] of Object.entries(dumpable)) {
  console.log(`\n--- ${k} ---`);
  console.log(JSON.stringify(v, null, 2).slice(0, 600));
}
