# Tidy Up & Distribute Spacing 기능 구현 명세

## 개요

선택된 여러 오브젝트를 정렬하고 간격을 자동으로 조정하는 두 가지 기능을 구현한다.

- Tidy Up (자동 정렬)
- Distribute Spacing (간격 균등)

---

# 1. Tidy Up (자동 정렬)

## 목적

선택된 여러 오브젝트를 자동으로 정렬하여 보기 좋은 레이아웃으로 배치한다.

사용자가 오브젝트를 아무렇게나 배치했더라도 일정한 방향과 간격으로 정렬한다.

예시

Before

```
□

        □

   □

             □
```

After

```
□   □   □   □
```

또는

```
□
□
□
□
```

---

## 동작 방식

### 1. 선택 개수 확인

- 최소 2개 이상의 오브젝트가 선택되어야 한다.
- 선택 개수가 1개 이하이면 기능을 실행하지 않는다.

---

### 2. 정렬 방향 결정

선택된 오브젝트들의 Bounding Box를 계산한다.

```
width = maxX - minX
height = maxY - minY
```

판단 기준

- width > height
  → 가로(Horizontal) 정렬

- height >= width
  → 세로(Vertical) 정렬

(필요하면 옵션으로 방향을 강제 지정할 수도 있다.)

---

### 3. 정렬 기준

가로 정렬

- Y축은 평균값 또는 첫 번째 오브젝트 기준으로 맞춘다.
- X축으로 순서대로 배치한다.

세로 정렬

- X축은 평균값 또는 첫 번째 오브젝트 기준으로 맞춘다.
- Y축으로 순서대로 배치한다.

---

### 4. 정렬 순서

가로

왼쪽 → 오른쪽

```
sort by x
```

세로

위 → 아래

```
sort by y
```

---

### 5. 간격 계산

기본 간격은 다음과 같이 계산한다.

```
spacing =
(전체 영역 - 모든 오브젝트 크기의 합)
/
(오브젝트 개수 - 1)
```

spacing이 음수가 되면

```
spacing = 0
```

---

### 6. 위치 재계산

가로

```
currentX = minX

for object

object.x = currentX

currentX += object.width + spacing
```

세로

```
currentY = minY

for object

object.y = currentY

currentY += object.height + spacing
```

---

### 결과

모든 오브젝트가

- 일정한 방향
- 일정한 간격
- 일정한 정렬

상태가 된다.

---

# 2. Distribute Spacing (간격 균등)

## 목적

오브젝트의 위치는 최대한 유지하면서

**오브젝트 사이의 간격만 동일하게 만든다.**

예시

Before

```
□          □   □             □
```

After

```
□     □     □     □
```

---

## 특징

이 기능은 정렬이 목적이 아니다.

오브젝트의

- width
- height

는 변경하지 않는다.

간격만 수정한다.

---

## 동작 방식

### 1. 선택 개수 확인

최소 3개의 오브젝트 필요

(2개는 간격을 계산할 수 없음)

---

### 2. 방향 결정

Horizontal

또는

Vertical

사용자가 선택

또는 Bounding Box 기반 자동 판단

---

### 3. 정렬 순서

Horizontal

```
sort by x
```

Vertical

```
sort by y
```

---

### 4. 전체 길이 계산

Horizontal

```
totalWidth =
sum(object.width)
```

```
availableSpace =
(maxRight - minLeft)
```

```
spacing =
(availableSpace - totalWidth)
/
(count - 1)
```

Vertical도 동일한 방식으로 계산

---

### 5. 위치 변경

Horizontal

```
currentX = minLeft

for object

object.x = currentX

currentX += object.width + spacing
```

Vertical

```
currentY = minTop

for object

object.y = currentY

currentY += object.height + spacing
```

---

## 결과

예시

Before

```
□          □      □                  □
```

After

```
□     □     □     □
```

모든 간격이 동일해진다.

---

# UI 요구사항

## Tidy Up 버튼

아이콘

```
✨
```

또는

정렬 아이콘

클릭 시

```
tidyUp(selectedObjects)
```

실행

---

## Distribute Spacing 버튼

Horizontal

```
↔
```

Vertical

```
↕

```

클릭 시

```
distributeHorizontal()
```

또는

```
distributeVertical()
```

실행

---

# 예외 처리

- 선택된 오브젝트가 부족하면 기능 실행 안 함
- 잠긴(Locked) 오브젝트는 제외
- 숨김(Hidden) 오브젝트는 제외
- 그룹 내부 요소는 그룹 단위로 처리하거나, 그룹을 해제하지 않고 Bounding Box 기준으로 계산
- 회전(Rotation)이 적용된 오브젝트는 Axis-Aligned Bounding Box(AABB)를 기준으로 계산
- spacing이 음수이면 0으로 처리
- Undo/Redo를 지원하도록 하나의 작업(Transaction)으로 기록

---

# 성능 요구사항

- 1,000개 이상의 오브젝트도 빠르게 처리
- 정렬은 O(n log n) 이하
- 위치 계산은 O(n)

---

# 최종 목표

## Tidy Up

- 자동으로 보기 좋은 정렬
- 자동 방향 결정
- 자동 간격 계산
- 일정한 배열 생성

## Distribute Spacing

- 기존 순서 유지
- 간격만 동일하게 변경
- Horizontal / Vertical 모두 지원
