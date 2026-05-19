# 메이플 플래닛 환산기 / 데미지 계산기

> 두 갈래 작업 진행 중. 나중에 합칠 예정.

## 폴더 구성

### `기존/`
환산 주스탯 사이트 (maplescouter 의 메플플 버전) 초기 작업.
- `web/index.html` — Vue 기반 환산 calculator (구버전)
- `scripts/` — 메랜 DB 추출 PoC (큐브/장비/몹/스킬)
- `data/` — 추출된 JSON 자료들
- `reference/cube_page.html` — 큐브 카탈로그 reference
- `README.md` — 환산기 기획 / 인수인계 문서

### `현재/`
마법사 데미지 1킬 계산기 (단순 단일 파일).
- `maryeok.html` — Tailwind CDN + 인라인 JS 단일 페이지
- `README.md` — 이번 세션 작업 노트 (공식, 출처, 데이터 소스, TODO)

## 합치는 방향

나중에 `현재/` 의 데미지 계산을 `기존/` 환산 데이터 흐름에 끌어다 쓸 예정.
- `기존/data/*.json` (장비/몹/스킬) → `현재/maryeok.html` 의 dropdown 데이터 소스로 연결
- `현재/maryeok.html` UI 가 더 깔끔하니 이쪽 HTML 베이스로 환산 기능 추가

## 실행

```bash
# 현재 calc 띄우기
open 현재/maryeok.html

# 기존 환산기 띄우기
open 기존/web/index.html
```
