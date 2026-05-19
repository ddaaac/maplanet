// mapledb.kr/item.php 의 모든 메이플랜드 장비 카드를 JSON 으로 추출
// 카드 구조: <a level="N" jobs="..." href="search.php?q=ID&t=item">...<h3>이름</h3>...<div>label</div><div>val</div>...</a>
const fs = require("fs");
const path = require("path");

const SRC = "/tmp/mapledb.html";
const OUT = path.join(__dirname, "..", "data", "mapleland_items.json");

const html = fs.readFileSync(SRC, "utf8");

// 각 카드를 통째로 잡아내는 정규식 (탐욕 X, 비탐욕 O)
const cardRe = /<a\s+level="(\d+)"\s+jobs="([^"]*)"\s+class="search-page-add-content-box"\s+href="[^"]*q=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

function unescapeHtml(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");
}

function parseStat(s) {
  // "5 (4-6)" → { val: 5, min: 4, max: 6 }
  // "100"     → { val: 100 }
  // "100%"    → { val: 100, pct: true }
  s = s.trim();
  const range = s.match(/^(\-?\d+)\s*\((\-?\d+)\s*-\s*(\-?\d+)\)$/);
  if (range) return { val: +range[1], min: +range[2], max: +range[3] };
  const pct = s.match(/^(\-?\d+)%$/);
  if (pct) return { val: +pct[1], pct: true };
  const num = s.match(/^(\-?\d+)$/);
  if (num) return { val: +num[1] };
  return { raw: s };
}

const items = [];
let m;
while ((m = cardRe.exec(html)) !== null) {
  const level = +m[1];
  const jobs = m[2];
  const id = +m[3];
  const body = m[4];

  const nameMatch = body.match(/<h3[^>]*>([^<]+)<\/h3>/);
  if (!nameMatch) continue;
  const name = unescapeHtml(nameMatch[1].trim());

  // 스탯: 같은 favorite-item-info-text 안에 <div>label</div><div>value</div>
  const stats = {};
  const statRe = /<div>([^<]+)<\/div>\s*<div>([^<]+)<\/div>/g;
  let sm;
  while ((sm = statRe.exec(body)) !== null) {
    const label = unescapeHtml(sm[1].trim());
    const value = unescapeHtml(sm[2].trim());
    if (label === "LEVEL" || label === "직업") continue;
    stats[label] = parseStat(value);
  }

  items.push({
    id,
    name,
    level,
    jobs,
    stats,
  });
}

console.log(`총 ${items.length}개 아이템 추출됨`);

// 카테고리 분류 — id 의 첫 자리/두 번째 자리 prefix 로 분류
// MapleStory item id 규칙 (대략): 10xxxxx = 모자, 104=얼굴장식, 105=귀고리, 106=한벌옷, 107=상의, 108=하의, 109=신발, 110=장갑, 111=망토, 112=반지, 113=얼굴장식, 114=벨트, 115=팬던트... 13xxxxx = 무기 etc.
// 빅뱅 전 본점 메이플 아이템 ID 룰 (10xxxxx = 장비, 첫 3자리 = 카테고리)
const ID_PREFIX = {
  // 방어구
  100: "모자",
  101: "얼굴장식",
  102: "눈장식",
  103: "귀고리",
  104: "상의",
  105: "한벌옷",
  106: "하의",
  107: "신발",
  108: "장갑",
  109: "망토",
  110: "방패",
  111: "반지",
  112: "팬던트",
  113: "벨트",
  114: "훈장",
  115: "어깨장식",
  // 무기 (13xxxxx ~ 14xxxxx)
  130: "한손검",
  131: "한손도끼",
  132: "한손둔기",
  133: "단검",
  137: "지팡이(완드)", // 137 = 완드
  138: "지팡이(스태프)", // 138 = 스태프
  139: "완드",
  140: "두손검",
  141: "두손도끼",
  142: "두손둔기",
  143: "창",
  144: "폴암",
  145: "활",
  146: "석궁",
  147: "표창",
  148: "너클",
  149: "총",
};

function classify(id) {
  const p3 = Math.floor(id / 10000);
  return ID_PREFIX[p3] || "기타(" + p3 + ")";
}

// 장비만 필터링 (1xxxxxx만, 4xxxxxx/2xxxxxx 는 캐시/소비)
function isEquip(id) {
  return id >= 1000000 && id < 2000000;
}

// 장비만 남기기
const equips = items.filter((it) => isEquip(it.id));
console.log(`장비 (1xxxxxx) ${equips.length}개 / 전체 ${items.length}개`);

const byCat = {};
for (const it of equips) {
  const cat = classify(it.id);
  it.category = cat;
  byCat[cat] = (byCat[cat] || 0) + 1;
}

console.log("\n카테고리별 분포:");
for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

fs.writeFileSync(OUT, JSON.stringify(equips, null, 2));
console.log(`\n저장 → ${OUT} (${(JSON.stringify(equips).length / 1024).toFixed(1)} KB)`);

console.log("\n방어구 모자 샘플 3개:");
const caps = equips.filter((i) => i.category === "모자");
console.log(JSON.stringify(caps.slice(0, 3), null, 2));

console.log("\n무기 (한손검) 샘플 3개:");
const weapons = equips.filter((i) => i.category === "한손검");
console.log(JSON.stringify(weapons.slice(0, 3), null, 2));

console.log("\n마법사 무기 (완드/스태프) 샘플 3개:");
const wands = equips.filter((i) => i.category.includes("완드") || i.category.includes("스태프") || i.category.includes("지팡이"));
console.log(JSON.stringify(wands.slice(0, 3), null, 2));
