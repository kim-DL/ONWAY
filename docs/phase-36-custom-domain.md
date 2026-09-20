# Phase 36 — onnuriway.com 운영 도메인 연결

2026-09-06. 기존 디자인·기능·배포 산출물 및 데이터는 유지하며 새 도메인을 연결한다.

## 프로젝트 및 변경 범위

- Vercel: `daeins-projects/onnuriway`, `prj_UV9Qd3nU6ePtRZkjgGk0YLyau7aN`.
- 운영 배포: `dpl_BpnE4RDqLnttCBhfiqZJxY6bP5YC`, READY. 도메인 연결을 위한 재빌드/재배포 없음.
- `onnuriway.com`을 production에 연결, `www.onnuriway.com`은 apex로 308 리디렉션.
- `onnuriway.vercel.app`은 리디렉션이나 삭제 없이 보존한다. 기존 설치 PWA를 끊지 않는다.
- 호스팅케이알 네임서버 `ns1.hosting.co.kr`~`ns4.hosting.co.kr` 그대로 유지.

## DNS

Vercel의 `domains verify`가 이 프로젝트에 반환한 우선순위 1 레코드다.
`domains inspect`의 구형 일반 IP 안내와 구분한다. 호스팅케이알에 사용자 정의 DNS
레코드는 0개였고, 공용 DNS는 기본 연결 IP `75.2.85.42`, `99.83.196.71` 및
`www → onnuriway.com`을 반환했다. 사용자 추가 승인 후 관리 화면에서 아래 세 레코드를
직접 저장했다. 메일/인증 레코드 삭제나 네임서버 변경은 하지 않았다.

| 유형 | 호스트 | 값 | TTL |
| --- | --- | --- | --- |
| A | @ | 216.198.79.1 | 180초 |
| A | @ | 64.29.17.1 | 180초 |
| CNAME | www | ee4db8abff11f1db.vercel-dns-017.com | 180초 |

관리 화면 저장 완료 및 세 레코드 표시 확인. ns1, 1.1.1.1, 8.8.8.8에서 새 A/CNAME
응답 확인. 단, 아래처럼 일부 권한 DNS가 구 레코드를 반환하므로 전체 전파 완료는 아니다.
CAA 조회는 ENODATA로 발급 제한 없음.

## Firebase / 지도

- Firebase 프로젝트 `onnuriway`의 Authentication authorizedDomains에 `onnuriway.com` 추가.
- 실제 웹앱에 연결된 reCAPTCHA Enterprise App Check 키 allowedDomains에 동일 apex 추가.
- 저장 직전 재조회, 합집합, 해당 필드만 updateMask PATCH, 이후 독립 GET 검증을 수행했다.
- 기존 `onnuriway.firebaseapp.com`, `onnuriway.vercel.app`, `onnuriway.web.app` 보존.
  도메인 검사 활성 및 다른 Auth/App Check 보안 구성 유지 확인.
- Firebase API 키에 특정 HTTP referrer 허용 목록은 없어 이전에 필요한 수정 없음.
  기존 API 대상 제한은 유지한다. 키 회전·권한 완화 없음.
- Firebase `authDomain`은 `onnuriway.firebaseapp.com` 유지. Vercel 도메인으로 바꾸지 않는다.
- 카카오 앱 `1555434` 급식길의 기존 Default JS Key에서 JavaScript SDK 도메인에
  `https://onnuriway.com` 추가. 기존 `https://onnuriway.vercel.app` 유지.
  저장 후 화면 재진입해 두 도메인 확인. REST 키/제품 설정/카카오 로그인 설정 변경 없음.
- www는 apex로만 리디렉션하므로 별도 앱 인증 도메인으로 등록하지 않는다.

진단 도구: `scripts/audit-custom-domain-readonly.mjs` (GET-only),
`scripts/register-production-domain.mjs` (기본 dry-run, 명시적 `--apply`로 정해진 apex만 추가).
토큰·키·전체 응답·사용자 데이터는 출력하거나 파일에 저장하지 않는다.

## PWA 및 이전 안내

manifest의 id/start_url/scope와 SW 경로는 모두 상대 `/`이므로 도메인용 코드 수정 불필요.
same-origin 캐시 원칙 및 private Firebase/Kakao 요청 캐시 제외 규칙 유지.
새 origin에서는 재로그인과 캐시 재생성이 정상이다. 서버의 학교·거래처·방문 기록은
그대로 유지되지만 최근 검색·기기 내 설정은 자동 이전되지 않는다.
기존 설치본은 새 도메인으로 자동 변경되지 않으므로 새 도메인에서 설치·로그인 확인 후
이전 설치본을 정리하도록 안내한다.

로컬 회귀: PWA 17개, 브랜드/최근 기록 29개 테스트 통과. PWA 빌드/아이콘 검증 통과.
이 검증은 실제 새 origin의 인증서·로그인·지도·설치 검증을 대체하지 않는다.

## 사용자 직접 확인이 필요한 별도 항목

호스팅케이알 기존 등록정보 인증 화면에 `onnuriway.com`, 인증여부 N,
정지 예정일 **2026-09-22**가 표시되어 사용자에게 알렸다.
소유자 이메일의 등록정보 인증은 DNS/SSL과 별개이며 대신 인증하거나 연락처를 바꾸지 않았다.

## 실접속 검증

2026-09-06 22:33 KST 현재:

- Vercel 프로젝트 재조회: apex와 www 소유 검증 true, production 연결 및 www→apex 308
  설정 유지. 이 소유 검증 상태와 실제 DNS/HTTPS 성공은 별개다.
- HostingKR 관리 화면에는 세 레코드가 정상 저장되어 있으나 권한 DNS 간 불일치 확인:

  | 서버 | 실제 IP | A / www CNAME 응답 |
  | --- | --- | --- |
  | ns1.hosting.co.kr | 121.254.170.11 | 새 Vercel 두 A / 새 Vercel CNAME |
  | ns3.hosting.co.kr | 121.254.170.12 | 새 Vercel 두 A / 새 Vercel CNAME |
  | ns2.hosting.co.kr | 43.201.141.93 | 구 기본 두 A / onnuriway.com |
  | ns4.hosting.co.kr | 43.201.141.93 | 구 기본 두 A / onnuriway.com |

- Node Resolver의 서버 IP 직접 지정 및 PowerShell `-NoRecursion -DnsOnly -NoHostsFile`
  조회에서 일치하게 재현. SOA serial은 모두 4지만 내용은 불일치한다.
  따라서 단순 Vercel 캐시라고만 단정할 수 없고 HostingKR 권한 DNS 동기화가 남아 있다.
- 각 서버 apex AAAA 없음, 제한 CAA 없음. 네임서버 변경이나 중복 레코드 재저장은 하지 않는다.
- Vercel DNS 검사 `invalid_configuration`과 이전 IP 응답이 계속됨. 자동 HTTPS 인증서
  미발급. CLI 수동 발급 요청도 한 번 실패(`Response Error`)하여 반복 발급은 하지 않았다.
- 새 도메인은 실제 Chrome에서 `ERR_CONNECTION_CLOSED`, TLS 검증을 유지한 HTTPS
  요청에서도 handshake 실패. 새 Vercel IP를 지정한 TLS 검사도 실패하여 로컬 캐시만의
  문제는 아니다. 인증서 검증을 무시하거나 우회하지 않았다.
- 기존 `https://onnuriway.vercel.app`은 HTTPS 200 OK로 유지 확인.
- 새 도메인의 로그인·지도·PWA 실제 설치 검증은 HTTPS 개통 후 수행해야 하므로 **미완료**.
  DNS/인증서 전파가 끝나기 전에는 직원들에게 새 설치본 전환을 안내하지 않는다.

## 공식 참고

- [Vercel 외부 DNS 연결](https://vercel.com/docs/domains/set-up-custom-domain)
- [카카오 JavaScript SDK 도메인](https://developers.kakao.com/docs/ko/app-setting/app)
- [Firebase App Check](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)
- [Firebase 로그인 상태의 origin 범위](https://firebase.google.com/docs/auth/web/auth-state-persistence)
- [PWA 식별자](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id)
