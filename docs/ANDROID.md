# Android 패키징

Capacitor 8 프로젝트는 `apps/web/android`에 있습니다. 앱 ID `com.gyeol.music`은 개발용 제안이며 공개 전 소유 도메인과 브랜드를 확인해 확정해야 합니다.

## 준비

- Node.js 24, JDK 21, Android SDK platform 36, build-tools 36.0.0, platform-tools
- `ANDROID_HOME`은 SDK 경로, `GRADLE_USER_HOME`은 쓰기 가능한 캐시 경로로 설정
- wrapper는 Gradle 8.14.3 bin과 공식 SHA-256을 고정함. 인증서·체크섬 검증을 끄지 않는다.
- 현재 클라우드의 설치 위치는 `/workspace/.cache/android`, Gradle 캐시는 `/workspace/.cache/gradle`이다. 다른 머신에서는 경로를 맞춘다.

```bash
export JAVA_HOME=/workspace/.cache/jdk21
export ANDROID_HOME=/workspace/.cache/android
export ANDROID_USER_HOME=/workspace/.cache/android-user
export GRADLE_USER_HOME=/workspace/.cache/gradle
export NEXT_PUBLIC_API_URL=https://YOUR_API_HOST/v1
npm run android:sync
cd apps/web/android
./gradlew --no-daemon --max-workers=2 :app:bundleRelease
```

`YOUR_API_HOST`는 실제 배포한 HTTPS API 주소로 바꿔야 한다. 주소는 Next.js 빌드 시 포함되므로 나중에 환경변수만 바꾸면 앱이 갱신되지 않는다. API 주소 변경 시 빌드·sync·AAB 생성을 다시 한다. 로컬 검증용 localhost가 들어간 AAB를 사용자에게 배포하지 않는다.

출력 위치: `apps/web/android/app/build/outputs/bundle/release/app-release.aab`. 기본 release는 **서명되지 않은 빌드 검증용**이다. 키 생성·서명·업로드는 사용자 승인 후 별도로 진행한다. 서명키와 비밀번호는 저장소에 넣지 않는다.

## 인증과 네트워크

- 웹: 메모리 access token, HttpOnly refresh cookie, Origin 검사.
- Android: `/v1/auth/native/*` 경로, 메모리 access token, `@aparajita/capacitor-secure-storage`의 Android Keystore 기반 refresh token 저장.
- WebView origin은 `https://localhost`이며 API가 이 origin과 설정한 웹 origin을 허용한다. 앱의 로컬 origin과 외부 API 주소를 혼동하지 않는다.
- native 모드가 아닌 브라우저에서는 보안 저장소의 웹 fallback을 토큰 저장에 사용하지 않는다.
- 서버측 native token 발급·갱신·폐기와 실제 Android 저장소·앱 재시작 동작은 별도 검사다. 빌드 성공만으로 기기 동작이 검증되지 않는다.

## 기기·스토어 검증

실제 기기 또는 에뮬레이터에서 검색·추천·가입·플레이리스트·앱 재시작 후 로그인·로그아웃·뒤로가기·키보드·네트워크 단절을 확인한다. cleartext 허용이나 TLS 검증 해제로 HTTPS 실패를 우회하지 않는다.

공개 전 target SDK의 최신 Play 정책, 최소 기능·콘텐츠 정책, 테스트 요구사항, 개인정보와 데이터 보안 양식, 계정 삭제 URL/앱 경로, 권리·출처 표시, 접근성·스토어 스크린샷을 검토한다. 현재 빌드 번호나 정책 링크는 심사 통과 보장이 아니다.

## 현재 빌드 환경의 보정

기본 머신에는 JRE만 있어 검증된 공식 Temurin 21 JDK 이미지를 내려받고 JDK를 `/workspace/.cache/jdk21`에 추출했다. 이미지 프로세스는 실행하지 않았다. 새 JDK에 환경 프록시의 CA가 없어 발생한 PKIX 오류는 Gradle이 `/etc/ssl/certs/java/cacerts`를 사용하도록 설정해 해결했다. TLS 검증은 유지했다. 이 경로의 JDK·SDK·캐시가 없는 머신에는 공식 도구 설치가 별도로 필요하다.

`npm run android:release`는 공개 HTTPS API 주소가 없거나 localhost이면 중단한다. 현재 만들어진 AAB는 localhost 개발 API를 포함한 컴파일 검증용이며 배포하거나 정상 기기 동작이 확인된 앱으로 취급하지 않는다. 실제 API 주소를 지정하고 재빌드·기기 검증·서명해야 한다.
