// 메이플 플래닛 환산 주스탯 PoC
// 입력: 표기 스탯 (스탯창 그대로 옮긴 값) + 잠재 합산 % + 보스 정보
// 출력: 환산 주스탯, 보스 단타 데미지 추정
// 사용: node scripts/calc_hwansan.js [--mage|--warrior|--archer|--thief]

// ─── 직업 카탈로그 ──────────────────────────────────────────────
// 메랜 = 4직업군 12직업 (해적/시그너스/아란 미출시)
// 메플플도 같다고 가정
const JOBS = {
  // 전사
  히어로: { branch: "전사", main: "STR", sub: "DEX", attackType: "physical", weapons: ["한손검", "두손검"] },
  팔라딘: { branch: "전사", main: "STR", sub: "DEX", attackType: "physical", weapons: ["한손검", "한손둔기", "두손검", "두손둔기"] },
  다크나이트: { branch: "전사", main: "STR", sub: "DEX", attackType: "physical", weapons: ["창", "폴암"] },
  // 마법사
  "아크메이지(불,독)": { branch: "마법사", main: "INT", sub: "LUK", attackType: "magic", weapons: ["완드", "스태프"] },
  "아크메이지(썬,콜)": { branch: "마법사", main: "INT", sub: "LUK", attackType: "magic", weapons: ["완드", "스태프"] },
  비숍: { branch: "마법사", main: "INT", sub: "LUK", attackType: "magic", weapons: ["완드", "스태프"] },
  // 궁수
  보우마스터: { branch: "궁수", main: "DEX", sub: "STR", attackType: "physical", weapons: ["활"] },
  신궁: { branch: "궁수", main: "DEX", sub: "STR", attackType: "physical", weapons: ["석궁"] },
  // 도적
  나이트로드: { branch: "도적", main: "LUK", sub: "DEX", attackType: "physical", weapons: ["표창"] },
  섀도어: { branch: "도적", main: "LUK", sub: "DEX_STR", attackType: "physical", weapons: ["단검"] },
};

// 무기상수 (구 메이플 표준 — 메플플 검증값으로 수정 필요)
const WEAPON_CONSTANT = {
  한손검: { max: 4.0, min: 1.2 },
  한손둔기: { max: 4.4, min: 3.2 },
  두손검: { max: 4.6, min: 3.2 },
  두손둔기: { max: 4.8, min: 3.4 },
  창: { max: 3.0, min: 1.0 },
  폴암: { max: 3.0, min: 1.0 },
  활: { max: 3.4, min: 1.2 },
  석궁: { max: 3.6, min: 1.2 },
  단검: { max: 3.6, min: 1.3 },
  표창: { max: 3.6, min: 1.3 },
  완드: { max: 1.0, min: 1.0 }, // 마법은 무기상수 무관
  스태프: { max: 1.0, min: 1.0 },
};

// ─── 입력 스키마 ───────────────────────────────────────────────
function inputExample() {
  return {
    // [필수] 직업/레벨/무기
    job: "아크메이지(썬,콜)",
    level: 114,
    weapon: "스태프",

    // [필수] 표기 스탯 — 스탯창 그대로 옮김 (이미 패시브/장비/잠재 반영됨)
    str: 4,
    dex: 17,
    int: 1152,
    luk: 104,
    weaponAttackMin: 13,
    weaponAttackMax: 25,
    magicAttack: 1493, // 마법사만 의미

    // [잠재 합산 %] 모든 부위/3줄 합산 — Image #1 처럼 슬롯별 받을 거면 별도로 입력 후 합산
    pot: {
      mainStatPct: 0, // 주스탯 % (마법사면 INT%, 전사면 STR% 등)
      attackPct: 0, // 공격력 %
      magicAttackPct: 0, // 마력 %
      damagePct: 0, // 데미지 %
      totalDamagePct: 0, // 총 데미지 % (incDAMr — 구 최종뎀)
      bossDamagePct: 0, // 보스 데미지 %
      ignoreDefPct: 0, // 방어율 무시 % (단일 합산값으로 가정)
      critRatePct: 0, // 크리티컬 확률 %
      critDamagePct: 0, // 크리티컬 데미지 % (직업스킬+잠재 합산)
      allStatPct: 0,
    },

    // [타겟]
    target: {
      isBoss: true,
      bossPdd: 30, // 일반 = 0~보스별 자쿰 30, 혼테일 50, 시그너스 80, 스우 90, 세렌 95... (메플플 검증 필요)
    },

    // [스킬]
    skill: {
      damagePct: 350, // 주력기 데미지 % (예: 메테오 350%, 제네시스 600%)
      hits: 1,
    },

    // [마스터리] 직업 스킬에 따라 자동 — 일단 디폴트 (4차 마스터 가정)
    masteryPct: 70, // 마법은 보통 무관 (마법사 마스터리 식 별도)
  };
}

// ─── 환산 식 ───────────────────────────────────────────────────
function critExpect(critRate, critDmg) {
  // 크리 기댓값 = (1.35 + 크뎀%) × 크리율 + (1 - 크리율)
  // 크리율 0~100 입력
  const r = Math.min(100, Math.max(0, critRate)) / 100;
  const d = critDmg / 100;
  return (1.35 + d) * r + (1 - r);
}

function bossDamageMultiplier(bossPdd, ignoreDefPct) {
  // 단일 방무 합산 가정. 줄별 입력시엔 1 - ∏(1 - 방무_i) 로 들어옴
  const pdd = bossPdd / 100;
  const ignore = ignoreDefPct / 100;
  const effective = pdd * (1 - ignore);
  return Math.max(0, 1 - effective);
}

function calcMagicDamage(c) {
  // 마력은 표기값 그대로 사용 (이미 마력% 반영). 단 식에 또 마력% 곱하지 않음.
  const mad = c.magicAttack;
  const int = c.int;
  const skillPct = c.skill.damagePct / 100;

  // 기본 = ((마력²/1000 + 마력)/30 + INT/200) × 스킬%
  const base = (mad * mad / 1000 + mad) / 30 + int / 200;
  let dmg = base * skillPct;

  dmg *= 1 + c.pot.damagePct / 100;
  dmg *= 1 + c.pot.totalDamagePct / 100;
  if (c.target.isBoss) dmg *= 1 + c.pot.bossDamagePct / 100;
  dmg *= critExpect(c.pot.critRatePct, c.pot.critDamagePct);
  if (c.target.isBoss) dmg *= bossDamageMultiplier(c.target.bossPdd, c.pot.ignoreDefPct);

  return dmg;
}

function calcPhysicalDamage(c) {
  const job = JOBS[c.job];
  const wc = WEAPON_CONSTANT[c.weapon] || { max: 1, min: 1 };
  const main = c[job.main.toLowerCase()];
  let sub;
  if (job.sub === "DEX_STR") sub = c.dex + c.str;
  else sub = c[job.sub.toLowerCase()];

  const watt = (c.weaponAttackMin + c.weaponAttackMax) / 2;
  const skillPct = c.skill.damagePct / 100;
  const mastery = c.masteryPct / 100;

  // max = (주 × WCmax + 부) × 표기공 / 100
  // min = (주 × WCmin × 0.9 × 마스터리 + 부) × 표기공 / 100
  const max = (main * wc.max + sub) * watt / 100;
  const min = (main * wc.min * 0.9 * mastery + sub) * watt / 100;
  let dmg = ((max + min) / 2) * skillPct;

  dmg *= 1 + c.pot.damagePct / 100;
  dmg *= 1 + c.pot.totalDamagePct / 100;
  if (c.target.isBoss) dmg *= 1 + c.pot.bossDamagePct / 100;
  dmg *= critExpect(c.pot.critRatePct, c.pot.critDamagePct);
  if (c.target.isBoss) dmg *= bossDamageMultiplier(c.target.bossPdd, c.pot.ignoreDefPct);

  return { avg: dmg, max, min };
}

function calcHwansan(c) {
  // 환산 주스탯: 데미지에서 주스탯 단위로 정규화
  // ∝ (주스탯 + 부스탯/무기상수) × (표기공/마력 × ...) × 곱셈항들
  // 실제 표기는 직업별 단위가 달라지므로 비교용 단일 숫자로만 의미를 가짐
  const job = JOBS[c.job];
  const wc = WEAPON_CONSTANT[c.weapon] || { max: 1, min: 1 };

  if (job.attackType === "magic") {
    // 마법: 환산 INT ≈ INT × 표기마력 × 잠재배수 (마법사 무기상수 1, 부스탯/무기상수 항 작음)
    let h = c.int * c.magicAttack;
    h *= 1 + c.pot.damagePct / 100;
    h *= 1 + c.pot.totalDamagePct / 100;
    if (c.target.isBoss) h *= 1 + c.pot.bossDamagePct / 100;
    h *= critExpect(c.pot.critRatePct, c.pot.critDamagePct);
    if (c.target.isBoss) h *= bossDamageMultiplier(c.target.bossPdd, c.pot.ignoreDefPct);
    return h;
  } else {
    const main = c[job.main.toLowerCase()];
    const sub = job.sub === "DEX_STR" ? c.dex + c.str : c[job.sub.toLowerCase()];
    const watt = (c.weaponAttackMin + c.weaponAttackMax) / 2;
    let h = (main + sub / wc.max) * watt;
    h *= 1 + c.pot.damagePct / 100;
    h *= 1 + c.pot.totalDamagePct / 100;
    if (c.target.isBoss) h *= 1 + c.pot.bossDamagePct / 100;
    h *= critExpect(c.pot.critRatePct, c.pot.critDamagePct);
    if (c.target.isBoss) h *= bossDamageMultiplier(c.target.bossPdd, c.pot.ignoreDefPct);
    h *= c.masteryPct / 100; // 안정성 보정 — 정확하진 않음, 추후 정밀화
    return h;
  }
}

function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(0);
}

function report(c, label = "현재") {
  const job = JOBS[c.job];
  if (!job) {
    console.log(`알 수 없는 직업: ${c.job} → 사용 가능: ${Object.keys(JOBS).join(", ")}`);
    return;
  }
  console.log(`\n=== ${label}: ${c.job} Lv${c.level} (${job.attackType}) ===`);
  console.log(`주스탯(${job.main})=${c[job.main.toLowerCase()]}  부(${job.sub})=${typeof c[job.sub.toLowerCase()] === "number" ? c[job.sub.toLowerCase()] : c.dex + c.str}`);
  if (job.attackType === "magic") {
    console.log(`표기 마력=${c.magicAttack}`);
  } else {
    console.log(`표기 공격력=${c.weaponAttackMin}~${c.weaponAttackMax} (avg ${(c.weaponAttackMin + c.weaponAttackMax) / 2})`);
  }
  const p = c.pot;
  console.log(`잠재: 데미지%${p.damagePct}/총뎀%${p.totalDamagePct}/보스뎀%${p.bossDamagePct}/방무%${p.ignoreDefPct}/크리율%${p.critRatePct}/크뎀%${p.critDamagePct}`);
  console.log(`타겟: ${c.target.isBoss ? `보스 PDD ${c.target.bossPdd}%` : "일반"}`);

  const h = calcHwansan(c);
  let d;
  if (job.attackType === "magic") {
    d = calcMagicDamage(c);
    console.log(`\n환산 ${job.main}: ${fmt(h)}`);
    console.log(`주력기 단타 (${c.skill.damagePct}%): ${fmt(d)}`);
  } else {
    d = calcPhysicalDamage(c);
    console.log(`\n환산 ${job.main}: ${fmt(h)}`);
    console.log(`주력기 단타 평균: ${fmt(d.avg)} (max ${fmt(d.max * c.skill.damagePct / 100)}, min ${fmt(d.min * c.skill.damagePct / 100)})`);
  }
  return { hwansan: h, damage: typeof d === "number" ? d : d.avg };
}

// ─── 비교 모드 (A → B 슬롯 교체) ─────────────────────────────────
function compare(base, slotA, slotB) {
  // base = 표기 스탯 일괄 입력. slotA/B = { 깡INT, 깡공격력, 잠재INT%, 잠재마%, ... }
  // 가정: base 의 표기 스탯에서 slotA 기여를 빼고 slotB 기여를 더함
  const c1 = JSON.parse(JSON.stringify(base));
  const c2 = JSON.parse(JSON.stringify(base));

  // slotA 의 기여를 빼고 slotB 더하기 — 깡스탯
  function applySlot(c, slot, sign) {
    c.int += sign * (slot.int || 0);
    c.str += sign * (slot.str || 0);
    c.dex += sign * (slot.dex || 0);
    c.luk += sign * (slot.luk || 0);
    c.magicAttack += sign * (slot.magicAttack || 0);
    c.weaponAttackMin += sign * (slot.attack || 0);
    c.weaponAttackMax += sign * (slot.attack || 0);
    // 잠재 % — 단순 합/감산 (slot 잠재 기여만큼 pot 에서 가감)
    for (const k of Object.keys(c.pot)) {
      c.pot[k] += sign * (slot.pot?.[k] || 0);
    }
  }

  applySlot(c1, slotA, 0); // base = 현재 (slotA 이미 포함됨)
  applySlot(c2, slotA, -1); // 빼고
  applySlot(c2, slotB, +1); // slotB 더함

  const r1 = report(c1, "A 현재");
  const r2 = report(c2, "B 대안");
  console.log("\n────── 차이 ──────");
  console.log(`△환산 = ${fmt(r2.hwansan - r1.hwansan)}  (${(((r2.hwansan / r1.hwansan) - 1) * 100).toFixed(2)}%)`);
  console.log(`△데미지 = ${fmt(r2.damage - r1.damage)}  (${(((r2.damage / r1.damage) - 1) * 100).toFixed(2)}%)`);
}

// ─── 슬롯 입력 모드 ────────────────────────────────────────────
// 메플플 장비 슬롯 = 잠재 박는 12~13 + 캐시 (반지/훈장)
const SLOT_LIST = [
  "무기",
  "방패",
  "모자",
  "한벌옷", // 또는 상의/하의 — 사용자가 한벌옷 false 면 상의/하의 슬롯이 활성
  "상의",
  "하의",
  "장갑",
  "신발",
  "망토",
  "펜던트",
  "벨트",
  "귀고리",
  "얼굴장식",
  "눈장식",
];

function emptySlot() {
  return {
    name: "",
    flat: { str: 0, dex: 0, int: 0, luk: 0, attack: 0, magicAttack: 0 },
    pot: {
      // 잠재 3줄 합산 % — 실제 UI 에선 줄별 입력 후 합산
      mainStatPct: 0,
      attackPct: 0,
      magicAttackPct: 0,
      damagePct: 0,
      totalDamagePct: 0,
      bossDamagePct: 0,
      ignoreDefPct: 0,
      critRatePct: 0,
      critDamagePct: 0,
      allStatPct: 0,
    },
  };
}

function buildFromSlots(charBase, slots, ringCount = 0, medal = null) {
  // charBase = { job, level, weapon, baseAP: {str,dex,int,luk}, masteryPct, skill, target }
  // slots = { 무기: slot, 모자: slot, ... }
  // 결과: 표기 스탯 + 잠재 합산값을 가진 c (calcHwansan 입력)
  const c = {
    job: charBase.job,
    level: charBase.level,
    weapon: charBase.weapon,
    str: charBase.baseAP.str,
    dex: charBase.baseAP.dex,
    int: charBase.baseAP.int,
    luk: charBase.baseAP.luk,
    weaponAttackMin: 0,
    weaponAttackMax: 0,
    magicAttack: charBase.baseAP.int, // 식 (장비마력 + INT) × ... 의 INT 기여
    pot: {
      mainStatPct: 0,
      attackPct: 0,
      magicAttackPct: 0,
      damagePct: 0,
      totalDamagePct: 0,
      bossDamagePct: 0,
      ignoreDefPct: 0,
      critRatePct: 0,
      critDamagePct: 0,
      allStatPct: 0,
    },
    target: charBase.target,
    skill: charBase.skill,
    masteryPct: charBase.masteryPct ?? 70,
  };

  // 슬롯 깡스탯 + 잠재 합산
  for (const [slotName, slot] of Object.entries(slots)) {
    if (!slot) continue;
    c.str += slot.flat.str || 0;
    c.dex += slot.flat.dex || 0;
    c.int += slot.flat.int || 0;
    c.luk += slot.flat.luk || 0;
    c.weaponAttackMin += slot.flat.attack || 0;
    c.weaponAttackMax += slot.flat.attack || 0;
    c.magicAttack += slot.flat.magicAttack || 0;
    for (const k of Object.keys(c.pot)) {
      c.pot[k] += slot.pot?.[k] || 0;
    }
  }

  // 캐시 반지: 올스탯 + 반지수
  c.str += ringCount;
  c.dex += ringCount;
  c.int += ringCount;
  c.luk += ringCount;

  // 훈장 깡스탯 (있으면)
  if (medal) {
    c.str += medal.str || 0;
    c.dex += medal.dex || 0;
    c.int += medal.int || 0;
    c.luk += medal.luk || 0;
    c.weaponAttackMin += medal.attack || 0;
    c.weaponAttackMax += medal.attack || 0;
    c.magicAttack += medal.magicAttack || 0;
  }

  // 잠재 주스탯%/올스탯% → 표기 스탯에 반영 (곱연산)
  const mainKey = JOBS[c.job].main.toLowerCase();
  const mainPct = (c.pot.mainStatPct + c.pot.allStatPct) / 100;
  c[mainKey] = Math.floor(c[mainKey] * (1 + mainPct));
  // 부스탯도 올스탯%만 적용
  const subKey = JOBS[c.job].sub.toLowerCase();
  if (subKey !== "dex_str") {
    c[subKey] = Math.floor(c[subKey] * (1 + c.pot.allStatPct / 100));
  }

  // 잠재 공%/마력% → 표기에 반영 (곱연산)
  const attackPct = c.pot.attackPct / 100;
  const madPct = c.pot.magicAttackPct / 100;
  c.weaponAttackMax = Math.floor(c.weaponAttackMax * (1 + attackPct));
  c.weaponAttackMin = Math.floor(c.weaponAttackMin * (1 + attackPct));
  c.magicAttack = Math.floor(c.magicAttack * (1 + madPct));

  // 위에서 적용한 잠재는 표기에 박혔으니 환산식 입력에서 0 으로 (이중 적용 방지)
  c.pot.mainStatPct = 0;
  c.pot.attackPct = 0;
  c.pot.magicAttackPct = 0;
  c.pot.allStatPct = 0;

  return c;
}

// ─── main ───────────────────────────────────────────────────────
if (require.main === module) {
  const c = inputExample();
  console.log("📌 사진의 메이지(썬,콜) Lv114 캐릭터 (잠재 0% 가정)");
  report(c);

  console.log("\n\n📌 같은 캐릭이 무기 잠재로 마력 30% (유니크 1줄+에픽 1줄+레어 1줄 가정) 추가했을 때");
  const c2 = JSON.parse(JSON.stringify(c));
  c2.pot.magicAttackPct = 0; // 마력%는 표기 마력에 이미 반영됨 — 이 PoC 에선 표기에서 받음
  c2.pot.damagePct = 18; // 마갤검증: 마력% = 데미지% 곱연산 → 마력%를 데미지%처럼 적용
  report(c2, "잠재 추가 후");

  console.log("\n\n📌 슬롯 교체 시뮬: 무기 A → 무기 B");
  compare(
    c,
    { magicAttack: 30, pot: { magicAttackPct: 9 } }, // A: 깡마력 30, 마력% 잠재 9% 1줄
    { magicAttack: 25, pot: { magicAttackPct: 0, damagePct: 9, totalDamagePct: 9 } } // B: 깡마력 25, 데미지%9 + 총뎀%9
  );

  console.log("\n\n📌 슬롯 입력 모드 — 9~10슬롯 풀입력으로 표기 스탯 자동 산출");
  // 가상의 메이지(썬,콜) Lv114 풀세팅
  const charBase = {
    job: "아크메이지(썬,콜)",
    level: 114,
    weapon: "스태프",
    baseAP: { str: 4, dex: 4, int: 526, luk: 61 }, // 캐릭터 AP 분배 (스탯창 좌측 base)
    masteryPct: 70,
    skill: { damagePct: 350, hits: 1 },
    target: { isBoss: true, bossPdd: 30 },
  };
  const slots = {
    무기: { name: "엘리시온 완드", flat: { magicAttack: 90, int: 5 }, pot: { magicAttackPct: 9, damagePct: 9, totalDamagePct: 9 } },
    방패: { name: "마법사 방패", flat: { int: 5, magicAttack: 25 }, pot: { magicAttackPct: 6 } },
    모자: { name: "조정의 모자", flat: { int: 12, luk: 3 }, pot: { mainStatPct: 6 } },
    한벌옷: { name: "고대 흑법사 로브", flat: { int: 18, luk: 6 }, pot: { mainStatPct: 9 } },
    장갑: { name: "악마사냥꾼 장갑", flat: { int: 5, magicAttack: 5 }, pot: { mainStatPct: 6 } },
    신발: { name: "고대 흑법사 부츠", flat: { int: 8, luk: 4 }, pot: { mainStatPct: 6 } },
    망토: { name: "흑심의 망토", flat: { int: 5, magicAttack: 4 }, pot: { mainStatPct: 6 } },
    펜던트: { name: "엔젤릭 블레싱", flat: { int: 7, luk: 7 }, pot: { mainStatPct: 6 } },
    벨트: { name: "엔라이튼 벨트", flat: { int: 4 }, pot: {} },
    귀고리: { name: "엘레강스 이어링", flat: { int: 7 }, pot: { mainStatPct: 6 } },
    얼굴장식: { name: "마스크피쉬", flat: { int: 4, luk: 4 }, pot: {} },
    눈장식: { name: "큰 마법안경", flat: { int: 6 }, pot: {} },
  };
  const ringCount = 4; // 캐시 반지 4개 → 올스탯 +4
  const medal = { int: 5, magicAttack: 5 }; // 훈장 (예시)

  const cFromSlots = buildFromSlots(charBase, slots, ringCount, medal);
  console.log(`\n슬롯 합산 결과: INT=${cFromSlots.int}, LUK=${cFromSlots.luk}, 표기마력=${cFromSlots.magicAttack}`);
  console.log(`잠재 합산: 데미지%${cFromSlots.pot.damagePct}, 총뎀%${cFromSlots.pot.totalDamagePct}, 보스뎀%${cFromSlots.pot.bossDamagePct}, 크리율%${cFromSlots.pot.critRatePct}`);
  report(cFromSlots, "슬롯 입력으로 산출된 캐릭");

  console.log("\n\n📌 슬롯 모드에서 무기 교체 시뮬");
  const slotsB = JSON.parse(JSON.stringify(slots));
  slotsB.무기 = { name: "제네시스 완드", flat: { magicAttack: 100, int: 8 }, pot: { magicAttackPct: 9, damagePct: 9, totalDamagePct: 9 } };
  const cB = buildFromSlots(charBase, slotsB, ringCount, medal);
  const r1 = report(cFromSlots, "엘리시온 완드");
  const r2 = report(cB, "제네시스 완드");
  console.log("\n────── 무기 교체 차이 ──────");
  console.log(`△환산 = ${fmt(r2.hwansan - r1.hwansan)}  (${(((r2.hwansan / r1.hwansan) - 1) * 100).toFixed(2)}%)`);
  console.log(`△데미지 = ${fmt(r2.damage - r1.damage)}  (${(((r2.damage / r1.damage) - 1) * 100).toFixed(2)}%)`);
}

module.exports = { calcHwansan, calcMagicDamage, calcPhysicalDamage, JOBS, WEAPON_CONSTANT };
