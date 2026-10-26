# 결 · GYEOL

좋아하는 한 곡에서 새로운 취향으로. 노래의 장르·분위기와 추천 이유를 확인하고 나만의 플레이리스트에 저장하는 음악 발견 앱입니다.

Next.js 16 / React 19 · NestJS 12 · TypeScript · MySQL 8.4 · Prisma 6 · Capacitor 8.

**기본 실행은 실제 곡을 검색하는 `live` 모드입니다.** Apple 검색과 MusicBrainz의 일부 곡 단위 장르 연결을 확인했고 대표곡 14개를 준비했습니다. 장르·분위기 정보의 범위는 곡마다 다르며, 근거가 부족하면 임의로 분류하지 않습니다. 별도 `demo` 모드는 가상 곡 16개로 전체 흐름을 체험·테스트합니다. 실제 음원 재생 기능은 없습니다.

## 시작하기

Node.js 24와 npm, Docker Compose가 필요합니다. 작업 전에 [AGENTS.md](AGENTS.md), [작업 기록](WORK_LOG.md)을 읽으세요. 현재 체크아웃을 사용하며 요청 없이 worktree를 만들지 않습니다.

저장소 루트에서 실행합니다.

```bash
npm ci
node scripts/init-env.mjs
docker compose up -d --wait mysql
npm run db:generate
npm run db:migrate
npm run catalog:sync
```

두 터미널에서 API와 웹을 실행합니다.

```bash
npm run dev:api
npm run dev:web
```

웹은 3000, API는 4000 포트입니다. API의 `/v1/health/ready`가 DB 연결을 확인하며, 개발용 API 문서는 `/docs`에 있습니다. Next.js 정적 내보내기 결과를 확인하려면 `npm run build` 후 `node scripts/serve-web.mjs`를 사용합니다. 이 정적 서버는 로컬 개발·테스트용입니다.

`init-env`는 무작위 로컬 자격증명을 생성하고 기존 `.env`를 보존합니다. 자격증명·서명키를 커밋하지 마세요. 컨테이너가 이미 초기화된 상태에서 `.env`의 DB 암호만 바꾸면 접속되지 않습니다. 데이터가 있는 볼륨을 임의로 삭제하지 말고 DB의 암호도 함께 안전하게 변경하세요.

기존 MySQL이 3306 포트를 사용 중이면 `.env`에 `MYSQL_PORT=3307`을 추가하고 `DATABASE_URL`의 포트도 `3307`로 변경한 뒤 컨테이너를 시작하세요. 컨테이너 내부 포트는 3306을 유지합니다.

## 기능

- 곡명·아티스트·장르 검색, 분위기 필터, 곡 상세
- 곡 카드·상세에서 제목 복사, 검색창이나 다른 앱에 붙여넣기. 자동 복사 실패 시 직접 복사할 제목 선택창 제공
- 곡·앨범·아티스트·검수 태그의 근거 범위 구분, 정보 부족 안내
- 장르/분위기 Jaccard 유사도와 추천 이유, 추천곡으로 플레이리스트 일괄 생성
- 이메일 가입·로그인, 회전하는 refresh session, 로그아웃 시 세션 폐기
- 사용자별 플레이리스트 생성·조회·이름 수정·삭제, 곡 추가·제거·순서 편집
- 트랜잭션·중복 제한·낙관적 버전 검사로 동시 편집 충돌 처리
- 모바일·데스크톱 레이아웃, 키보드 포커스, 다이얼로그, 오류·빈 결과 처리

플레이리스트 이름과 곡은 MySQL에 저장합니다. 브라우저 저장소를 DB 대신 사용하지 않습니다. 웹 refresh token은 HttpOnly 쿠키, Android는 Keystore 기반 보안 저장소를 사용하도록 분리했습니다. Android 보안 저장소의 실제 기기 동작은 별도 검증이 필요합니다.

## 테스트

실제 MySQL 컨테이너가 실행 중이어야 합니다. 통합·브라우저 테스트는 실행마다 무작위 `gyeol_*_test` 데이터베이스를 만들고 종료 시 그 DB만 제거합니다. 개발 DB를 초기화하지 않습니다. 강제 종료로 남은 테스트 DB는 이름과 사용 여부를 확인한 후 정리하세요.

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run test:live
```

E2E 실행 전 개발용 3000/4000 포트의 서버를 종료하세요. 테스트는 서버를 직접 실행하며 기존 서버를 재사용하지 않습니다. 환경에 Chromium이 없으면 `npx playwright install chromium`을 실행하거나 `CHROMIUM_PATH`를 지정합니다. 테스트 중 같은 정적 출력 디렉터리를 다시 빌드하지 마세요.

단위 테스트, DB/API 통합 테스트, 실제 브라우저 E2E는 목적이 다릅니다. 외부 장애 UI를 위한 E2E 응답 fixture는 실제 공급자 연결 검증이 아닙니다. 결과와 알려진 제약은 [검증 기록](docs/VALIDATION.md)에 정리합니다.

`test:live`는 실제 외부 서비스를 사용하는 별도 smoke test이므로 네트워크나 공급자 장애로 실패할 수 있습니다. CI의 재현 가능한 전체 검사는 `npm run check`이며, live 결과는 별도로 기록합니다.

## 실제 곡과 체험 모드

1. 기본 `.env`는 `CATALOG_MODE=live`, `APPLE_COUNTRY=US`입니다. KR 시장은 대표 검색에서 0곡을 반환했고 US 시장은 아이유와 해외 곡을 반환했습니다. 공급자 시장은 UI 언어와 별개입니다.
2. 서버가 환경의 HTTPS 프록시를 사용합니다. 일반 HTTP 도구의 403과 달리 앱 경로에서는 실제 연결을 확인했습니다. 새 환경에서는 `itunes.apple.com`, `musicbrainz.org` 접근을 검사하세요. 저장된 환경 초안은 게시·적용과 별개입니다.
3. `npm run catalog:sync`는 대표곡 메타데이터를 갱신합니다. 사용자 플레이리스트를 삭제하지 않습니다. 외부 요청에는 호출 간격·60초 캐시·대기 상한을 적용합니다.
4. Apple 분류는 확정 장르로 쓰지 않습니다. MusicBrainz에서 곡명·아티스트·길이가 유일하게 일치할 때 곡 태그를 연결합니다. 실제 곡의 분위기 태그는 아직 확보하지 않았고 임의 생성하지 않습니다.
5. 오프라인 체험은 `.env`에 `CATALOG_MODE=demo`를 설정하고 `npm run db:seed` 후 API를 재시작합니다. 화면에 가상 곡 표시가 나오며 실제 곡과 섞지 않습니다.

추천 후보는 현재 모드의 저장된 카탈로그에 한정됩니다. live 모드에서 후보가 적거나 곡 단위 태그가 없으면 추천이 비어 있을 수 있습니다. 세부 장르·분위기 전반의 커버리지를 보장하지 않습니다. 실제 수집 정책·저장 기간은 공급자 조건 확인 후 확정해야 합니다.

검색 카드와 곡 상세에는 Apple API가 반환한 앨범 커버와 해당 곡의 iTunes Store 링크·공식 배지를 함께 표시합니다. 이미지 파일은 서버에 복사하지 않고 브라우저가 공급자 URL에서 직접 불러옵니다. DB에는 URL·출처·갱신 기한을 보관하며, 현재 로컬 정책은 메타데이터 갱신 후 24시간입니다. 갱신 기한이 지났거나 커버가 없거나 로딩에 실패한 경우 자체 CSS 커버를 사용합니다. 기존 곡은 다시 검색하거나 `catalog:sync`를 실행하면 갱신됩니다. 배지 없는 장식용 영역·추천·라이브러리는 자체 그래픽을 유지합니다. 이 구현이 공개·상업 사용에 필요한 모든 권리 확인을 완료했다는 의미는 아닙니다. [Apple API 조건](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/), [스토어 배지 지침](https://marketing.services.apple/itunes-identity-guidelines).

MusicBrainz의 장르 연결·태그는 supplementary data로 **CC BY-NC-SA 3.0** 조건을 따릅니다. 곡 상세에 출처와 라이선스 링크를 표시하며, 공개·상업 출시 전에는 필요한 데이터 이용 허가를 해결해야 합니다. [공식 라이선스](https://musicbrainz.org/doc/About/Data_License), [데이터 구분](https://musicbrainz.org/doc/MusicBrainz_Database).

## DB 변경

Prisma는 공식 JavaScript 엔진 + MySQL 호환 MariaDB 드라이버 어댑터를 사용합니다. 네이티브 엔진 다운로드 차단과 MySQL WASM migration diff 오류 때문에, `db:migrate`는 검토한 버전별 SQL을 mysql2로 적용합니다. 실행 잠금·SQL 체크섬·완료 이력을 `_gyeol_migrations`에 저장하며 파일 변경이나 미완료 마이그레이션을 자동으로 무시하지 않습니다.

스키마를 바꿀 때 `schema.prisma`와 새 SQL 마이그레이션을 함께 작성하고 독립 MySQL 테스트 DB에서 검증하세요. 이미 적용한 SQL은 수정하지 않습니다. 현재 기록은 Prisma의 `_prisma_migrations`와 다르므로 `prisma migrate deploy/dev`로 섞어 실행하지 마세요. Prisma JS migration config는 클라이언트 생성용이며 MySQL diff/deploy가 검증됐다는 뜻이 아닙니다.

## Android

[Android 실행·빌드 안내](docs/ANDROID.md)를 따르세요. 브라우저에서 검증된 정적 UI를 Capacitor가 포함합니다. 실제 기기용 빌드에는 접근 가능한 **HTTPS API** 주소가 필요하며, PC의 localhost를 그대로 사용할 수 없습니다.

플레이스토어 공개에는 서명·Play Console·개인정보처리방침·이메일 인증/계정 복구·계정 삭제·이미지/음악 권리와 스토어 요구사항 검토가 남아 있습니다. 웹 MVP나 AAB 생성은 출시 완료를 의미하지 않습니다.

## 문서와 변경 관리

[계획](docs/PLAN.md) · [아키텍처](docs/ARCHITECTURE.md) · [ERD](docs/ERD.md) · [디자인](docs/DESIGN_REFERENCES.md) · [누적 작업 기록](WORK_LOG.md)

매 작업에서 관련 부분 테스트를 수행하고 전체 로직 변경 후 전체 테스트를 실행합니다. **사용자 확인 없이 커밋·푸시·배포하지 않습니다.**
