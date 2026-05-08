# Scenario Asset Library Plan

## 1. 목적

시나리오 수정 화면에서 장면 이미지와 VTT 맵 이미지를 안정적으로 업로드, 재사용, 적용할 수 있는 구조를 정의한다.

현재는 다음 두 경로가 분리되어 있다.

- `ScenarioNode.imageUrl`: 노드 장면 이미지. 업로드 시 백엔드가 R2에 저장하고 URL을 node 필드에 저장한다.
- `VttMapStateDto.imageUrl`: 맵 이미지. 에디터에서 URL 문자열을 직접 입력해 저장한다.

이 구조는 장면 이미지는 안정적이지만 맵 이미지는 외부 URL의 CORS 상태에 의존한다. 따라서 “맵 이미지 업로드 -> 백엔드 -> R2 저장 -> 재사용 가능한 자산 목록 -> 맵 적용” 흐름으로 정리해야 한다.

## 2. 현재 문제

### 2.1 맵 URL 입력은 성공 조건이 불명확하다

- 현재 맵 이미지 입력란은 아무 문자열이나 `vttMap.imageUrl`로 저장한다.
- 브라우저 렌더링은 `Image.crossOrigin = "anonymous"`로 이미지를 로드한다.
- 따라서 외부 이미지 서버가 CORS를 허용하지 않으면 URL이 살아 있어도 맵에 적용되지 않는다.
- 사용자 입장에서는 “URL이 틀린 것인지, 서버가 막는 것인지, 우리 시스템이 막는 것인지” 구분하기 어렵다.

### 2.2 재사용 가능한 자산 개념이 없다

- 같은 시나리오 안에서 여러 노드가 같은 맵을 써도 매번 다시 업로드하거나 URL을 따로 붙여넣어야 한다.
- 파일명만으로는 맵을 식별하기 어려워 URL 기반 UX가 빠르게 한계에 부딪힌다.
- 장면 이미지와 맵 이미지가 서로 다른 저장 흐름을 타고 있어 운영 규칙도 일관되지 않다.

### 2.3 런타임과 에디터 책임이 섞여 있다

- 플레이 런타임은 결국 공개 접근 가능한 이미지 URL만 알면 된다.
- 반면 에디터는 업로드, 목록, 검색, 재사용, 삭제, 썸네일 확인이 필요하다.
- 지금은 이 두 층이 `imageUrl` 하나에 바로 겹쳐져 있다.

## 3. 목표

### 3.1 핵심 목표

- 시나리오 단위의 재사용 가능한 자산 라이브러리를 도입한다.
- 맵/장면/토큰 이미지를 공통 모델로 저장하되, MVP에서는 맵과 장면 이미지부터 지원한다.
- 업로드된 파일은 백엔드가 R2에 저장하고, DB에는 자산 메타데이터를 저장한다.
- 플레이 런타임에는 계속 `imageUrl`만 노출한다.

### 3.2 비목표

- 지금 단계에서 범용 미디어 CMS를 만들지 않는다.
- 플레이 런타임이 자산 id를 직접 해석하게 만들지 않는다.
- 편집 가능한 이미지 변환, 크롭, 버전 관리까지는 MVP 범위에 넣지 않는다.

## 4. 권장 구조

### 4.1 원칙

- 업로드와 적용을 분리한다.
- 자산 목록과 런타임 맵 상태를 분리한다.
- 런타임 VTT 상태에는 계속 public URL만 남긴다.

### 4.2 권장 데이터 흐름

1. GM이 시나리오 에디터에서 맵 이미지를 업로드한다.
2. 백엔드가 파일을 검증한 뒤 R2에 저장한다.
3. 백엔드가 `ScenarioAsset` 레코드를 생성한다.
4. 프론트는 이 자산을 “맵 라이브러리” 목록에 추가한다.
5. GM이 특정 자산의 `적용`을 누르면 현재 노드의 `vttMap.imageUrl`에 해당 자산의 `publicUrl`을 넣는다.
6. 플레이 런타임은 기존처럼 `vttMap.imageUrl`만 읽어 맵을 렌더링한다.

## 5. 도메인 모델 제안

### 5.1 새 엔티티

```ts
type ScenarioAsset = {
  id: string;
  scenarioId: string;
  kind: "map" | "scene" | "token";
  fileName: string;
  contentType: string;
  storageKey: string;
  publicUrl: string;
  width?: number | null;
  height?: number | null;
  fileSizeBytes: number;
  uploadedByUserId: string;
  createdAt: string;
  updatedAt: string;
};
```

### 5.2 스코프

- 자산 소유 범위는 우선 `scenarioId` 기준으로 둔다.
- 이유:
  - 현재 편집 UX가 시나리오 중심이다.
  - 맵 재사용 수요도 우선은 같은 시나리오 안에서 가장 크다.
  - 사용자 전역 자산함까지 바로 열면 검색/권한/정리 비용이 커진다.

### 5.3 기존 필드와의 관계

- `ScenarioNode.imageUrl`는 장면 이미지의 “현재 선택된 결과 URL”로 유지한다.
- `VttMapStateDto.imageUrl`도 맵 이미지의 “현재 선택된 결과 URL”로 유지한다.
- 즉 `ScenarioAsset`은 에디터 자산 목록의 source of truth이고, 노드/맵 상태는 선택 결과를 캐시한 projection이다.

## 6. Prisma 스키마 초안

```prisma
enum ScenarioAssetKind {
  MAP
  SCENE
  TOKEN
}

model ScenarioAsset {
  id               String            @id @default(cuid())
  scenarioId       String
  kind             ScenarioAssetKind
  fileName         String
  contentType      String
  storageKey       String            @unique
  publicUrl        String
  width            Int?
  height           Int?
  fileSizeBytes    Int
  uploadedByUserId String
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  scenario         Scenario          @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  uploadedBy       User              @relation(fields: [uploadedByUserId], references: [id], onDelete: Cascade)

  @@index([scenarioId, kind, createdAt])
}
```

### 6.1 기존 모델 변경

```prisma
model Scenario {
  ...
  assets ScenarioAsset[]
}
```

### 6.2 왜 node에 assetId를 바로 넣지 않는가

- 플레이 런타임은 URL만 있으면 충분하다.
- 이미 `ScenarioNode.imageUrl`와 `vttMap.imageUrl` 흐름이 있다.
- 초기에는 asset id 참조까지 강제하지 않고, URL projection 유지가 마이그레이션 비용이 더 낮다.

향후 필요하면 아래 필드를 추가할 수 있다.

- `ScenarioNode.imageAssetId`
- `ScenarioNodeMapAssetRef`

하지만 MVP에서는 필수로 보지 않는다.

## 7. API 제안

### 7.1 업로드

`POST /api/v1/scenarios/:id/assets`

요청:

```ts
type UploadScenarioAssetDto = {
  kind: "MAP" | "SCENE" | "TOKEN";
  fileName: string;
  contentType: string;
  dataBase64: string;
};
```

응답:

```ts
type ScenarioAssetResponseDto = {
  id: string;
  scenarioId: string;
  kind: "MAP" | "SCENE" | "TOKEN";
  fileName: string;
  contentType: string;
  publicUrl: string;
  width?: number | null;
  height?: number | null;
  fileSizeBytes: number;
  createdAt: string;
  updatedAt: string;
};
```

### 7.2 목록 조회

`GET /api/v1/scenarios/:id/assets?kind=MAP`

응답:

```ts
type ListScenarioAssetsResponseDto = {
  items: ScenarioAssetResponseDto[];
};
```

정렬:

- 기본은 `createdAt desc`
- MVP에서는 페이지네이션 없이 최근 N개까지 허용 가능

### 7.3 삭제

`DELETE /api/v1/scenarios/:id/assets/:assetId`

정책:

- 자산 삭제는 soft delete보다 hard delete로 시작해도 된다.
- 단, 현재 어떤 노드나 맵이 쓰고 있는 자산인지 즉시 추적하지 않으므로 MVP에서는 아래 중 하나를 택한다.

권장 정책:

- MVP 1차: 삭제는 지원하지 않음
- MVP 2차: “라이브러리에서 제거” 전 confirm modal 제공

### 7.4 기존 업로드 엔드포인트와의 관계

현재의 `POST /scenarios/:id/nodes/:nodeId/image`는 아래 둘 중 하나로 정리한다.

1. 내부적으로 `ScenarioAsset(kind=SCENE)`를 생성한 뒤 `node.imageUrl`을 갱신하도록 변경
2. 점진 이행 기간 동안 유지하되, 신규 프론트는 `POST /assets`를 우선 사용

권장안은 1번이다. 장면 이미지와 맵 이미지가 같은 업로드 파이프라인을 타게 된다.

## 8. 프론트 UX 제안

### 8.1 맵 이미지는 몬스터처럼 `select`가 아니라 썸네일 라이브러리로 간다

몬스터는 이름과 CR만으로 고를 수 있지만, 맵은 파일명만으로 식별하기 어렵다. 따라서 맵 자산은 카드형 UI가 맞다.

권장 구성:

- `맵 업로드` 버튼
- `라이브러리 열기` 버튼
- 최근 업로드 맵 썸네일 4~8개
- 각 카드에 `적용`, `복사 URL`, `선택됨` 상태 표시

### 8.2 노드 상세 화면 내 배치

현재 `Default map` 패널 안에서 아래 순서로 배치한다.

1. `맵 업로드`
2. `라이브러리에서 선택`
3. 선택된 맵 미리보기
4. 기존 VTT 툴바

### 8.3 URL 직접 입력은 고급 옵션으로 내린다

외부 URL 직접 입력은 완전히 없애지 않아도 되지만 기본 UX에서는 비권장으로 바꾼다.

권장:

- 기본 버튼: `맵 업로드`
- 보조 버튼: `외부 URL 직접 입력`
- 헬퍼 문구: “외부 URL은 공개 접근과 CORS 허용이 필요합니다.”

### 8.4 장면 이미지도 같은 자산 선택 흐름으로 맞춘다

현재 노드 상단의 `Scene image` 영역도 장기적으로는 같은 라이브러리를 공유한다.

- `kind=SCENE` 자산만 필터
- 업로드 후 즉시 현재 노드에 적용
- 같은 시나리오의 다른 노드 이미지도 재사용 가능

## 9. 백엔드 처리 규칙

### 9.1 업로드 검증

- 허용 MIME:
  - `image/png`
  - `image/jpeg`
  - `image/webp`
  - `image/gif`
- 최대 크기:
  - 맵: 10MB 정도로 상향 검토 가능
  - 장면 이미지: 5MB 유지 가능

### 9.2 저장 경로

권장 R2 key:

```text
scenarios/{scenarioId}/assets/{kind}/{assetId-or-uuid}.{ext}
```

예시:

```text
scenarios/scenario_abc/assets/map/01jx...png
```

이렇게 두면 기존 `nodes/{nodeId}` 경로보다 재사용 자산이라는 의미가 더 명확해진다.

### 9.3 썸네일

MVP에서는 원본 public URL만 저장해도 충분하다.
추후 성능 문제가 생기면 썸네일 variant를 추가한다.

## 10. 점진적 구현 순서

### 10.1 1단계: 백엔드 자산 모델 추가

- Prisma에 `ScenarioAsset` 추가
- DTO 추가
- `POST /scenarios/:id/assets`
- `GET /scenarios/:id/assets`

완료 조건:

- 맵/장면 업로드가 모두 R2 + DB 기록을 남긴다.

### 10.2 2단계: 맵 패널 프론트 전환

- `맵 업로드` 버튼 추가
- 업로드 성공 시 현재 노드 `vttMap.imageUrl` 자동 적용
- 최근 업로드 맵 목록 렌더링

완료 조건:

- 외부 URL 붙여넣기 없이 맵 적용 가능
- 같은 맵을 같은 시나리오의 여러 노드에 다시 적용 가능

### 10.3 3단계: 장면 이미지 업로드 경로 통합

- 기존 `node image` 업로드를 자산 기반 흐름으로 내부 통합
- `kind=SCENE` 목록 제공

완료 조건:

- 장면 이미지와 맵 이미지가 같은 자산 저장 파이프라인을 사용

### 10.4 4단계: 선택적 정리

- 외부 URL 입력 UI를 숨기거나 보조 옵션으로 이동
- 삭제/이름 변경/정렬/검색 추가

## 11. MVP 권장 결정

### 11.1 지금 바로 채택할 결정

- 자산 스코프는 `scenario` 단위
- 맵 목록 UI는 썸네일 카드형
- 런타임은 계속 `imageUrl`만 사용
- 업로드 API는 공통 `/assets`
- 장면 이미지 업로드도 같은 파이프라인으로 수렴

### 11.2 나중으로 미뤄도 되는 것

- 자산 전역 라이브러리
- 자산 폴더/태그
- 삭제 정책 고도화
- asset id 기반 참조 정규화
- 이미지 변환 파이프라인

## 12. 수용 기준

- GM이 외부 이미지 URL의 CORS 상태를 몰라도 맵 이미지를 정상 적용할 수 있어야 한다.
- 같은 시나리오 안에서 한 번 업로드한 맵을 다른 노드에 다시 적용할 수 있어야 한다.
- 플레이 런타임과 세션 API는 기존처럼 `vttMap.imageUrl`만으로 동작해야 한다.
- 맵 자산 UI는 파일명 중심 `select`가 아니라 썸네일 기반 선택 흐름이어야 한다.
- 장면 이미지 업로드와 맵 이미지 업로드는 최종적으로 같은 저장 정책을 따라야 한다.
