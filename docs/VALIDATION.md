# 검증 기록

2026-10-21 현재 클라우드 인스턴스에서 개발용 MVP를 검증했다. 새 task 복원, 실제 Android 기기 동작, 스토어 출시는 별도다. 과거 실패와 수정 과정은 `WORK_LOG.md`에 보존한다.

## 최종 검사 결과

| 검사                                    | 결과             | 확인한 내용                                                                      |
| --------------------------------------- | ---------------- | -------------------------------------------------------------------------------- |
| `npm ci` / `db:generate`                | 성공             | 잠금 파일 재설치, 공식 Prisma JS client 생성                                     |
| MySQL 마이그레이션·시드 반복            | 성공             | 실제 MySQL 8.4, 핵심 12개 테이블, 적용 체크섬·반복 가능성                        |
| ESLint / TypeScript                     | 통과             | 웹·API·계약 패키지                                                               |
| `npm test`                              | **10 / 10 통과** | 유사도·모드·중복·근거 수준·공급자 경계·시장 식별자                               |
| `test:integration`                      | **19 / 19 통과** | 별도 MySQL DB, 인증·권한·트랜잭션·정렬·충돌·API 재시작·native 세션               |
| 프로덕션 빌드                           | 성공             | 계약·NestJS·Next.js 정적 출력                                                    |
| `test:e2e`                              | **14 / 14 통과** | 데스크톱·모바일 전체 흐름, 출처 중복 회귀, 오류, axe 자동 검사                   |
| `test:live`                             | **4 / 4 통과**   | 실제 국내 검색, 곡 단위 MusicBrainz 태그, 실제 곡 저장, 비어 있지 않은 실제 추천 |
| Android `bundleRelease` / `lintRelease` | 성공             | JDK 21, SDK 36, 최신 정적 자산 포함. lint 오류 0 / 경고 16                       |
| AAB 자산·서명 확인                      | 성공             | 현재 웹 출력 30개 파일과 번들 내용 일치. 서명 없음 확인                          |

최종 테스트 합계는 **47개 통과, 실패 0, 건너뜀 0**이다. 반복 실행 횟수를 더한 숫자가 아니다. axe 검사는 홈·곡 상세의 WCAG A/AA 자동 검사 범위이며 완전한 접근성 인증을 의미하지 않는다. CI 파일은 작성했지만 GitHub Actions에서 실행하지 않았다.

`npm run check` 마지막 실행 기록은 `.runtime/check-last.log`, 실제 API 기록은 `.runtime/live-smoke-final-4.log`에 있다. 테스트 DB는 매 실행 생성 후 해당 DB만 삭제했다.

## 실제 화면·데이터 확인

- 초기 대표곡 14개를 import했고, 검색 결과는 이후 카탈로그에 누적된다. 실제 곡과 가상 체험곡은 API 모드로 분리한다.
- KR 검색 시장의 빈 결과를 진단하여 US 시장을 사용했다. 아이유·Nujabes·Daft Punk의 실제 응답 확인.
- 브라우저에서 실제 아이유 검색 응답을 끝까지 기다려 **20개 실제 곡 카드** 표시 확인. Cirrus 상세에 Nu jazz 등 곡 단위 태그와 실제 추천 1개 확인.
- 실제 화면의 중복 장르 칩 없음, 중복 React key 오류 0, uncaught browser error 0, 390px 모바일 가로 넘침 없음.
- 현재 화면 캡처: `.runtime/screenshots/live-home-desktop.png`, `live-detail-desktop.png`, `live-detail-mobile.png`, `live-search-mobile.png`. 데모 E2E 화면과 구분한다.

## Android 결과

파일: `apps/web/android/app/build/outputs/bundle/release/app-release.aab`

SHA-256: `ad78748b0d41dd98ded490333ffff481facb6cfd1813d1f951796ab464d9be85`

최신 UI 반영 후 Gradle은 207개 작업 중 43개 실행, 164개 캐시 재사용으로 성공했다. lint 경고 16개는 리소스·아이콘·manifest/data-extraction 설정 등이며 보고서에 남아 있다. 경고나 실제 기기 테스트를 비활성화해 성공 처리하지 않았다.

이 번들은 **서명되지 않은 localhost 개발 API용 빌드 검증 산출물**이다. 정상 설치·로그인 유지·기기 동작·Play 심사 통과의 증거가 아니다. 실제 공개 HTTPS API 주소로 재빌드하고 기기 확인 및 서명을 해야 한다.

## 남은 제약과 출시 전 작업

- **실제 곡의 분위기 태그는 아직 확보하지 않았다.** 분위기 추천 로직·UI는 명시적인 가상 태그로 테스트했다. 모든 곡의 세부 장르를 보장하지 않으며 모호한 매칭을 강제로 연결하지 않는다.
- MusicBrainz 장르 연결은 supplementary data(CC BY-NC-SA 3.0). 출처·라이선스 링크를 표시했다. 공개·상업 서비스의 데이터 이용 허가·보관/갱신 정책은 남아 있다.
- Apple 홍보 콘텐츠·스토어 배지 조건 확인 후 앨범 아트 표시는 끄고 자체 그래픽을 사용한다. 별도 사진을 복사하지 않았다. Pretendard 원본 OFL 라이선스 보관.
- Android 실제 기기/에뮬레이터의 네트워크·보안 저장소·인증 유지·뒤로가기 동작.
- 이메일 인증·계정 복구·계정 삭제와 개인정보처리방침, HTTPS 운영 API, 서명·스토어 제출·심사.
- 재사용 환경은 설치·시작 지침과 저장소 정보를 초안에 저장했다. 환경 게시·새 task 복원은 미검증. MySQL의 API 재시작 후 보존을 새 머신 복원 검증으로 확대 해석하지 않는다.
- 위 기능 검증 시점에는 커밋·푸시를 하지 않았다. 이후 사용자 승인에 따른 Git 반영 기록은 `WORK_LOG.md`를 따른다. 운영 배포는 별도다.
