# rocketchat-foss

Rocket.Chat 을 **라이선스 코드(`ee/`, `apps/meteor/ee/`) 없이** 소스에서 빌드한 컨테이너 이미지.
인터넷이 없는 내부망(에어갭)에서 라이선스 없이 운영하기 위한 것이다.

```
ghcr.io/jonghokim27/rocketchat-foss:<Rocket.Chat 판>     # 시험을 통과한 판
ghcr.io/jonghokim27/rocketchat-foss:<판>-build.<번호>   # 빌드마다 남는 후보
```

이 프로젝트는 Rocket.Chat Technologies Corp. 와 관계없는 비공식 빌드다.

## 왜 필요한가

공식 이미지는 라이선스 코드를 포함한다. 그래서 에어갭 환경에서는 Starter(50명 이하) 이상의
라이선스가 필요하고, 라이선스가 없으면 작업공간이 읽기 전용으로 제한된다(라이선스 코드의
`AirGappedRestriction`). Rocket.Chat 은 그 대안으로 「GitHub 소스에서 FOSS 판을 직접 빌드」하라고
안내하고, 그 절차로 `yarn fossify`(라이선스 디렉터리 삭제)를 둔다.

그러나 8.9.0 기준 `fossify` 만으로는 이미지가 기동하지 않는다. MIT 코드 38개 파일이 지워진
라이선스 패키지를 import 하고, 상대 경로로 라이선스 파일을 import 하는 곳도 13곳 남아 있다.
빌드는 경고만 내고 통과하며, 기동할 때 `Cannot find module` 로 죽는다. 이 레포가 그 틈을 메운다.

## 하는 일

`scripts/apply-foss.sh` 가 깨끗한 upstream checkout 에 다음을 적용한다.

1. `fossify` 와 같은 삭제 — `ee/`, `apps/meteor/ee/`, 라이선스 `startRocketChat.ts`.
2. `overlay/` 복사 — 모두 이 레포에서 새로 쓴 MIT 코드다. 라이선스 코드를 복사하거나 고치지 않는다.
   | 자리 | 내용 |
   |---|---|
   | `packages/foss-license` (`@rocket.chat/license`) | 라이선스 없음: 프리미엄 모듈은 늘 꺼짐, 한도·에어갭 제한 없음 |
   | `packages/foss-presence` (`@rocket.chat/presence`) | 접속 상태 서비스. MIT `IPresence` 계약대로 새로 구현 |
   | `packages/foss-media-calls` | 미디어 통화(VoIP) 없음 — 통화 요청은 거절 |
   | `packages/foss-federation-matrix` | Matrix 연합 없음 — MIT 코드가 부르는 순수 함수 둘만 |
   | `packages/foss-omnichannel-services` | 옴니채널 큐 작업자·PDF 대화 기록 없음 — 기록만 남기는 빈 서비스 |
   | `apps/meteor/startRocketChat.ts`, `server/foss/startup/presence.ts` | DDP 접속을 presence 에 연결 |
   | `apps/meteor/server/foss/**`, `lib/foss/**` | 상대 경로로 import 되던 라이선스 파일 자리(앱 시작·라이선스 미들웨어·큐 위치 통지·상용구 치환·앱 i18n 키·파일 형식) |
3. 그 상대 경로 import 를 `…/ee/server/…` → `…/server/foss/…`, `…/ee/lib/…` → `…/lib/foss/…` 로 바꾼다.
4. `scripts/verify-foss.cjs` 로 MIT 코드가 라이선스 코드에 닿는 곳이 남지 않았는지, 바꾼 import 가
   전부 실제 파일로 풀리는지 확인한다. upstream 이 바뀌어 가정이 깨지면 여기서 멈춘다.

빌드 절차는 upstream CI(`.github/actions/meteor-build`, `build-docker`)와 같고, 이미지는 upstream
`apps/meteor/.docker/Dockerfile.alpine` 의 `release-standard` 단계다(linux/amd64). 거기에 보안 패치만 더한다.

| 패치 | 이유 |
|---|---|
| dompurify 3.4.17, proxy-addr 2.0.8 (루트 `resolutions`, Meteor `webapp` 사본 교체) | Critical CVE. upstream `develop` 과 같은 판 |
| `programs/server` 의 npm `overrides` 로 tar 7.5.21 | 이미지 빌드가 까는 node-gyp 10·cacache 18 의 tar 6. upstream 도 tar 7 로 강제 |
| 실행 단계에서 npm·npx 제거 | 베이스 이미지 npm 의 tar 7.5.11. 서버는 `node main.js` 만 쓴다 |

`scripts/check-image-deps.sh` 가 빌드된 이미지 안에 옛 판이 남았으면 빌드를 실패시킨다.

판을 고정해 쓰려면 움직이는 `:<판>` 대신 `:<판>-build.<번호>` 를 쓴다.

## 빠지는 기능

라이선스 코드에 있던 것은 전부 없다. 대표적으로 Apps-Engine(마켓플레이스·사설 앱), 읽음 확인,
감사, 엔터프라이즈 LDAP 동기화, 옴니채널 고급 기능(우선순위·SLA·상용구·큐 위치·PDF 대화 기록),
미디어 통화, Matrix 연합, ABAC, 마이크로서비스 배포, 엔게이지먼트 대시보드가 빠진다.
채팅·채널·DM·스레드·토론·파일·검색·알림·LDAP/SAML/OAuth 로그인·기본 옴니채널 같은 MIT 기능은 남는다.

접속 상태(presence)는 upstream 에서도 라이선스 코드였기 때문에 이 레포가 새로 구현했다.
단일 인스턴스 기준이며, 여러 인스턴스로 띄우면 연결 정리는 2분마다 도는 정리 작업에 의존한다.

## 빌드와 시험

`build` 워크플로(수동 실행 또는 `main` push)가 다음을 한 번에 한다.

1. `UPSTREAM_VERSION`(또는 입력값) 태그의 Rocket.Chat 을 받아 overlay 를 적용하고 빌드
2. `:<판>-build.<번호>` 로 push
3. `smoke` 워크플로: MongoDB 8.0 replica set + 이 이미지를 띄우고 시험
   - REST: 로그인, 사용자·채널 생성, 메시지 쓰기·읽기, 파일 올리기·내려받기
   - DDP: resume 로그인 뒤 접속 상태 online → away → 지정 상태(busy) → 접속 종료 시 offline
   - 브라우저(Chromium): 로그인, 채널 열기, 메시지 보내기, 잡히지 않은 예외 0
   - 서버 로그에 `Cannot find module` 0
4. 통과하면 `:<판>` 태그를 붙인다

판을 올릴 때는 `UPSTREAM_VERSION` 을 바꾸고 push 한다. 엔진 판(MongoDB·Node)은 그 판의 릴리스
노트 「Engine versions」를 따른다.

## 라이선스

이 레포의 코드(`overlay/`, `scripts/`, 워크플로)는 MIT 다. 이미지에 들어가는 것은 upstream 의 MIT
코드와 이 overlay 뿐이다. upstream LICENSE 는 `ee/` 와 `apps/meteor/ee/` 만 Enterprise 라이선스로
두고 나머지를 MIT 로 둔다.
