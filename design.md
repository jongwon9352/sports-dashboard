# Daejeon Hana Citizen Design System v1.0

## Brand Overview

대전하나시티즌은 대한민국 프로축구를 대표하는 시민구단으로서 전문성, 데이터 기반 의사결정, 팬 중심 경험을 핵심 가치로 한다.

본 디자인 시스템은 다음 3가지 서비스 환경을 지원한다.

1. 선수 관리 플랫폼 (GPS/EPTS Dashboard)
2. 코칭 스태프 분석 시스템
3. 팬 서비스 웹사이트 및 모바일 앱

### Brand Personality

* Professional
* Athletic
* Data-driven
* Energetic
* Trustworthy

---

# Colors

색 토큰의 단일 기준은 `src/index.css`의 `@theme` 블록이다. 이 문서는 그 값을 반영한다.
새 색을 쓸 때는 hex를 직접 박지 말고 토큰을 추가한 뒤 참조한다.

## Primary

### Daejeon Wine

`#A42843`

주요 브랜드 컬러 (토큰: `--color-brand`)

사용처

* Sidebar Active Navigation
* Primary CTA / 선택된 탭
* Section Title 앞 막대
* 오늘 날짜 강조

### Daejeon Wine Dark

`#7F1F35`

Hover / Active 상태 (토큰: `--color-brand-dark`)

### Daejeon Wine Light

`#F4E4E8`

선택 상태
배경 강조 (토큰: `--color-brand-light`)

---

## Secondary

### Hana Green

`#008C7E`

토큰: `--color-green`

사용처

* Positive KPI
* Success State
* Recovery Status
* Performance Improvement

### Hana Green Light

`#E0F3F0`

배경 강조 (토큰: `--color-green-light`)

---

## Data Visualization

ACWR 존 색상. 정의 위치는 `src/pages/TeamDashboard.tsx`의 `ZONE_COLOR`이며,
`getAcwrZone()`의 임계값(0.8 / 1.3 / 1.5 / 2.0)과 짝을 이룬다.

### Safe (안전)

`#16A34A`

### Caution (주의)

`#D97706`

과소훈련(ACWR < 0.8)도 주의로 분류한다.

### Danger (위험)

`#DC2626`

### High Danger (고위험)

`#7F1D1D`

### Recovery

`#153E6F`

토큰: `--color-recovery`

### Neutral

`#66717A`

토큰: `--color-neutral`

---

## Maturity (PHV)

생리학적 성숙도 4단(PHV 경과 연수)을 차트에서 구분하는 램프다. 성숙도는 **서열**이므로
범주형 색상환이 아니라 **한 색조의 명도 램프**를 쓴다 — 명도만으로 순서가 읽히기 때문에
색각 이상에서도 서열이 유지된다. 좋고 나쁨이 없는 중립 척도라 blue-grey 무채색 계열이고,
`--color-brand`(선택·CTA) · `--color-green`(긍정) · `--color-recovery`(회복) ·
`--color-load-*`(부하 등급)이 선점한 의미와 겹치지 않는다.

| 단 | 값 | 토큰 | 흰 배경 대비 | 선 모양 |
|---|---|---|---|---|
| Pre-PHV | `#7E8C99` | `--color-phv-pre` | 3.44:1 | 실선 |
| PHV+0~1년 | `#5A6773` | `--color-phv-y01` | 5.80:1 | `4 2` |
| PHV+1~2년 | `#3A4752` | `--color-phv-y12` | 9.53:1 | `2 2` |
| PHV+2년~ | `#1C2630` | `--color-phv-y2p` | 15.34:1 | `6 2 2 2` |

**차트 마크 전용 — 글자에 쓰지 않는다.** 네 단 모두 그래픽 대비(WCAG 1.4.11, 3:1)는 통과하지만
가장 밝은 `--color-phv-pre` 가 본문 대비 3.44:1 로 AA(4.5:1)에 미달한다. 선·점·범례 견본에만 쓰고,
글자는 `--color-text-primary` 나 `--color-neutral` 을 쓴다.

**선 모양을 함께 쓴다.** 같은 색조 4선은 교차 지점에서 구분이 약해지므로 위 표의
`strokeDasharray` 를 중복 인코딩으로 건다. 명도와 선 모양 두 축으로 구분된다.

라벨·구간·색·선 모양의 단일 출처는 `src/lib/maturity.ts` 의 `MATURITY_BANDS` 다 —
값을 다른 곳에 복사하지 않는다. 이 4단은 `players.maturity_status` 3단(Pre/Mid/Post)과
**다른 체계**이고, 3단은 배지(`MaturityBadge`)로 4단은 평문으로 표시해 형태로 구분한다.

사용처
* RPE 모니터링 블록② 부하-RPE 반응 곡선 4선과 그 범례

---

## Surface

### Background

`#F6F8F7`

### Surface

`#FFFFFF`

### Surface Secondary

`#EEF3F1`

---

## Text

### Primary Text

`#101820`

### Secondary Text

`#4F5B63`

### Disabled Text

`#7D8990`

### White Text

`#FFFFFF`

---

# Typography

## Font Family

Primary:
Pretendard

Fallback:
Noto Sans KR

Stack:
Pretendard, Noto Sans KR, sans-serif

---

## Display

### Display XL

48px
700

사용처

* 경기 결과 Hero

### Display LG

36px
700

사용처

* Dashboard Title

### Display MD

28px
600

사용처

* Section Title

---

## Heading

### H1

24px
700

### H2

20px
700

### H3

18px
600

---

## Body

### Body Large

16px
400

### Body Medium

14px
400

### Caption

12px
400

### Micro

11px
400

데이터 라벨 전용이다. 표 머리글, 차트 축·범례, 단위, 백분위 같은
숫자에 붙는 글자만 이 크기를 쓴다. 읽는 문장에는 쓰지 않는다.

**11px 이 화면의 바닥이다.** 더 작은 값은 쓰지 않는다.
A4 인쇄물(`.pr-*`)과 래스터 리포트(Match/Daily/Weekly)는 mm 지면 기준이라
9~10.5px 을 그대로 쓴다 — 이 바닥은 화면에만 적용된다.

---

# Layout

## Grid

Desktop
12 Columns

Tablet
8 Columns

Mobile
4 Columns

---

## Container

Max Width
1440px

Content Width
1280px

---

## Spacing

4px Base System

4
8
12
16
24
32
48
64
96

---

# Elevation

## Level 1

0 1px 3px rgba(0,0,0,0.08)

카드 기본

## Level 2

0 4px 12px rgba(0,0,0,0.12)

Hover

## Level 3

0 8px 24px rgba(0,0,0,0.16)

Modal

---

# Core Components

## Top Navigation

Height
72px

Background
`linear-gradient(90deg, #008C7E 0%, #153E6F 58%, #101820 100%)`

구성

* Logo
* Dashboard
* Squad
* Training
* Match
* Medical
* Reports

---

## KPI Card

Radius
12px (토큰: `--radius-card`)

Padding
20px

구성

* KPI Name
* Current Value
* Previous Value
* Trend Arrow

예시

Total Distance

9.8 km

▲ 8%

---

## Player Card

Radius
20px

포함 정보

* 선수 사진
* 이름
* 포지션
* Availability
* Readiness Score

---

## Training Load Card

포함 데이터

* Total Distance
* HSR
* Sprint Distance
* Accelerations
* Decelerations
* Player Load

---

## Readiness Widget

Score Range

0~100

색상 기준

90~100
Green

70~89
Yellow

0~69
Red

---

## Injury Risk Indicator

Low
Green

Moderate
Orange

High
Red

---

## Match Dashboard

구성

* Match Score
* Team Physical Summary
* Position Group Comparison
* Individual KPI Ranking

---

## Charts

Line Chart

ACWR
Wellness
Readiness

Bar Chart

Position Comparison
Weekly Load

Heatmap

Training Attendance
Wellness Status

Radar Chart

Player Profile

---

# Responsive

## Mobile

<768px

* KPI Card 1열
* 선수 카드 세로 배치
* 하단 탭 네비게이션

## Tablet

768~1024px

* KPI Card 2열

## Desktop

1024px+

* KPI Card 4~6열
* Full Dashboard

---

# Dashboard Theme

## GPS Dashboard

Primary Purple
Secondary Green

핵심 KPI

* Distance
* HSR
* Sprint Distance
* Accelerations
* Decelerations
* Player Load

## Medical Dashboard

Primary Green

핵심 KPI

* Wellness
* Sleep
* Soreness
* Injury Risk
* Availability

## Match Analysis Dashboard

Primary Purple

핵심 KPI

* Match Load
* Position Analysis
* Team Comparison
* Opponent Comparison

