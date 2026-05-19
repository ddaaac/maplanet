// 메이플 플래닛 큐브 데이터를 환산용 카탈로그로 정리
// - 옵션을 stat 카테고리별로 분류 (주스탯/공%/마%/데미지%/보스뎀%/방무%/크뎀%/크리율/총뎀%/HP/MP/기타)
// - 등급별·부위별 가중치 + 레벨 120 수치 표 추출
const fs = require("fs");
const path = require("path");

const SUS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "suspicious_cube.json"), "utf8"));
const MIR = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "miracle_cube.json"), "utf8"));

const GRADE = { 0: "노멀", 1: "레어", 2: "에픽", 3: "유니크", 4: "?(grade4)" };
const OPT_TYPE = {
  0: "전부",
  10: "무기",
  11: "무기X",
  20: "한벌/하의/상의",
  40: "악세6",
  51: "모자",
  52: "한벌/상의",
  53: "한벌/하의",
  54: "장갑",
  55: "신발",
};

// 환산 핵심 옵션 카테고리
function classify(text, levelObj) {
  const lv120 = levelObj && levelObj["12"] ? levelObj["12"] : levelObj && levelObj["20"];
  const keys = lv120 ? Object.keys(lv120) : [];
  const k = keys[0] || "";
  // text 우선 매칭 (한 옵션이 여러 stat 키를 가질 수도 있음)
  if (/올스탯/.test(text)) return "올스탯";
  if (/STR\s*:\s*\+/.test(text)) return "STR";
  if (/DEX\s*:\s*\+/.test(text)) return "DEX";
  if (/INT\s*:\s*\+/.test(text)) return "INT";
  if (/LUK\s*:\s*\+/.test(text)) return "LUK";
  if (/HP\s*:\s*\+/.test(text)) return "HP";
  if (/MP\s*:\s*\+/.test(text)) return "MP";
  if (/공격력\s*:\s*\+/.test(text) && /\+#incPAD\s*$/.test(text)) return "공격력+";
  if (/마력\s*:\s*\+/.test(text) && /\+#incMAD\s*$/.test(text)) return "마력+";
  if (/공격력\s*:\s*\+#incPADr\s*%/.test(text)) return "공격력%";
  if (/마력\s*:\s*\+#incMADr\s*%/.test(text)) return "마력%";
  if (/올스탯.*%/.test(text)) return "올스탯%";
  if (/STR\s*:\s*\+#incSTRr\s*%/.test(text)) return "STR%";
  if (/DEX\s*:\s*\+#incDEXr\s*%/.test(text)) return "DEX%";
  if (/INT\s*:\s*\+#incINTr\s*%/.test(text)) return "INT%";
  if (/LUK\s*:\s*\+#incLUKr\s*%/.test(text)) return "LUK%";
  if (/HP\s*:\s*\+#incMHPr\s*%/.test(text)) return "HP%";
  if (/MP\s*:\s*\+#incMMPr\s*%/.test(text)) return "MP%";
  if (/방어율.*무시|몬스터의?\s*방어율|ignoreTargetDEF/.test(text)) return "방무%";
  if (/보스\s*몬스터.*데미지|보스\s*공격\s*시.*데미지/.test(text)) return "보스뎀%";
  if (/크리티컬\s*확률|크리티컬\s*率|크리티컬률|incCr%/.test(text)) return "크리율%";
  if (/크리티컬\s*(최소|최대)?\s*데미지|incCriticaldamage/.test(text)) return "크뎀%";
  if (/총\s*데미지|최종\s*데미지|데미지\s*\+#/.test(text) && /%/.test(text)) return "총뎀%";
  if (/스킬\s*재사용|쿨타임/.test(text)) return "쿨타임감소";
  if (/이동속도/.test(text)) return "이동속도";
  if (/점프력/.test(text)) return "점프력";
  if (/메소|드랍/.test(text)) return "메획/아획";
  if (/경험치/.test(text)) return "경험치";
  if (/방어력/.test(text)) return "방어력";
  if (/MP\s*소모/.test(text)) return "MP소모감소";
  if (/HP.*회복|MP.*회복/.test(text)) return "회복";
  if (/일정\s*확률|확률로/.test(text)) return "확률발동";
  if (/피격/.test(text)) return "피격";
  return "기타(" + (k || "?") + ")";
}

function tier(grade) {
  return GRADE[grade] || "?" + grade;
}

function summarize(pool, label) {
  console.log(`\n=== ${label} (총 ${pool.length}개 옵션) ===`);
  // 카테고리별 등급별 카운트
  const matrix = {}; // cat → grade → count
  for (const opt of pool) {
    const cat = classify(opt.text, opt.level);
    matrix[cat] = matrix[cat] || {};
    matrix[cat][opt.grade] = (matrix[cat][opt.grade] || 0) + 1;
  }
  const allGrades = [0, 1, 2, 3, 4];
  console.log(
    "카테고리".padEnd(16),
    allGrades.map((g) => tier(g).padEnd(8)).join("")
  );
  for (const [cat, by] of Object.entries(matrix).sort()) {
    console.log(
      cat.padEnd(16),
      allGrades.map((g) => String(by[g] || "").padEnd(8)).join("")
    );
  }
}

summarize(SUS, "수상한 큐브");
summarize(MIR, "미라클 큐브");

// 환산 핵심 옵션의 등급별 수치 (레벨 120 / lvIdx=12 기준) 정리해서 별도 JSON 으로 저장
function pickKey(text) {
  const m = text.match(/#(inc[A-Za-z]+)/);
  return m ? m[1] : null;
}

function valueAtLevel(opt, lvIdx) {
  const lv = opt.level && opt.level[String(lvIdx)];
  if (!lv) return null;
  const key = pickKey(opt.text) || Object.keys(lv)[0];
  return lv[key];
}

const CORE_CATS = [
  "공격력%",
  "마력%",
  "보스뎀%",
  "방무%",
  "크뎀%",
  "크리율%",
  "총뎀%",
  "STR",
  "DEX",
  "INT",
  "LUK",
  "올스탯",
  "올스탯%",
  "공격력+",
  "마력+",
  "HP",
  "MP",
];

function buildCatalog(pool) {
  const out = {};
  for (const opt of pool) {
    const cat = classify(opt.text, opt.level);
    if (!CORE_CATS.includes(cat)) continue;
    out[cat] = out[cat] || [];
    out[cat].push({
      id: opt.id,
      grade: opt.grade,
      gradeName: tier(opt.grade),
      weight: opt.weight,
      optionType: opt.optionType,
      optionTypeName: OPT_TYPE[opt.optionType] || String(opt.optionType),
      reqLevel: opt.reqLevel,
      text: opt.text,
      lv120: valueAtLevel(opt, 12),
      lv200: valueAtLevel(opt, 20),
    });
  }
  // 카테고리 안에서 등급 → weight 내림차순
  for (const cat of Object.keys(out)) {
    out[cat].sort((a, b) => a.grade - b.grade || b.weight - a.weight);
  }
  return out;
}

const susCat = buildCatalog(SUS);
const mirCat = buildCatalog(MIR);
fs.writeFileSync(
  path.join(__dirname, "..", "data", "cube_catalog.json"),
  JSON.stringify({ suspicious: susCat, miracle: mirCat }, null, 2)
);
console.log("\n→ data/cube_catalog.json 저장");

// 핵심 옵션 등급별 최댓값 (레벨 120) 표
console.log("\n\n=== 환산 핵심 옵션의 레벨 120 수치 (수상한 / 미라클) ===");
console.log("카테고리".padEnd(10), "등급".padEnd(6), "수상한 max".padEnd(11), "미라클 max".padEnd(11), "수상한 cnt", "미라클 cnt");
for (const cat of CORE_CATS) {
  for (const g of [0, 1, 2, 3]) {
    const sus = (susCat[cat] || []).filter((o) => o.grade === g);
    const mir = (mirCat[cat] || []).filter((o) => o.grade === g);
    if (!sus.length && !mir.length) continue;
    const sMax = Math.max(...sus.map((o) => o.lv120 ?? 0), 0) || "-";
    const mMax = Math.max(...mir.map((o) => o.lv120 ?? 0), 0) || "-";
    console.log(
      cat.padEnd(10),
      tier(g).padEnd(6),
      String(sMax).padEnd(11),
      String(mMax).padEnd(11),
      String(sus.length).padEnd(10),
      String(mir.length)
    );
  }
}
