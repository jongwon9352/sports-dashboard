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

## Primary

### Daejeon Purple

`#6B3FA0`

주요 브랜드 컬러

사용처

* Header
* Sidebar
* Primary CTA
* Active Navigation
* KPI Highlight

### Daejeon Purple Dark

`#4E2A78`

Hover / Active 상태

### Daejeon Purple Light

`#E8E0F4`

선택 상태
배경 강조

---

## Secondary

### Hana Green

`#00A651`

사용처

* Positive KPI
* Success State
* Recovery Status
* Performance Improvement

### Hana Green Light

`#E5F6ED`

배경 강조

---

## Data Visualization

### High Load

`#E53935`

### Moderate Load

`#FB8C00`

### Optimal Load

`#43A047`

### Recovery

`#1E88E5`

### Neutral

`#607D8B`

---

## Surface

### Background

`#F7F8FA`

### Surface

`#FFFFFF`

### Surface Secondary

`#F3F5F7`

---

## Text

### Primary Text

`#1E1E1E`

### Secondary Text

`#5F6368`

### Disabled Text

`#9AA0A6`

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
Daejeon Purple

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
16px

Padding
24px

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

