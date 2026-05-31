# UFW vs Firewalld: 특징 및 차이점 비교

## 개요

UFW(Uncomplicated Firewall)와 firewalld는 모두 Linux 방화벽을 관리하는 도구입니다. 둘 다 `iptables` 또는 `nftables`를 백엔드로 사용하지만, 목표와 사용 방식이 다릅니다.

---

## 방화벽의 기본 개념

### 방화벽이란?

방화벽(Firewall)은 컴퓨터 네트워크에 들어오는 트래픽과 나가는 트래픽을 감시하고 제어하는 보안 시스템입니다.

### 방화벽은 어디에 있나?

방화벽은 보통 네트워크 경계나 서버 운영체제 안에 있습니다. 회사나 데이터센터에서는 외부 인터넷과 내부망 사이의 장비 형태로 둘 수 있고, 리눅스 서버에서는 UFW나 firewalld처럼 서버 내부에서 동작하는 소프트웨어 방화벽으로 둘 수 있습니다. 이 문서에서 다루는 방화벽은 서버 내부의 리눅스 방화벽입니다.

```
인터넷
  ↓
[네트워크 경계 방화벽]  ← 회사/데이터센터 전체 트래픽 통제(물리 장비)
  ↓
[리눅스 서버]
  ↓
[서버 내부 방화벽]      ← 해당 서버만 보호(소프트웨어 도구)
  ↓
[애플리케이션]
```

### 방화벽의 역할

```
인터넷
    ↓
[외부 요청]
    ↓
[방화벽 규칙 검사]
    ├─ 허용 → [내부 시스템: 서버/PC]
    │          (22, 80, 443만)
    └─ 차단 → [외부 차단]
                         (23, 3389 차단)
```

### 방화벽의 기본 정책

#### 1. Inbound (들어오는 트래픽)

- **기본 정책**: DENY (차단) - 필요한 것만 허용
- 예: SSH(22), HTTP(80), HTTPS(443)만 허용

#### 2. Outbound (나가는 트래픽)

- **기본 정책**: ALLOW (허용) - 필요 시에만 차단
- 일반적으로 모든 나가는 트래픽 허용

### 포트(Port)와 프로토콜

```
포트 = 통신의 "출입구"
- SSH: 22번 포트 (Secure Shell)
- HTTP: 80번 포트 (웹 서버)
- HTTPS: 443번 포트 (보안 웹 서버)
- MySQL: 3306번 포트 (데이터베이스)

프로토콜 = 통신 방식
- TCP: 연결 지향, 안정적 (대부분의 애플리케이션)
- UDP: 비연결, 빠름 (DNS, VoIP)
```

### 방화벽 규칙 예시

```bash
# 규칙 1: SSH 포트만 허용
포트 22/TCP → 허용 (ACCEPT)

# 규칙 2: 웹 서버만 허용
포트 80/TCP → 허용 (ACCEPT)
포트 443/TCP → 허용 (ACCEPT)

# 규칙 3: 그 외 모두 차단
나머지 포트 → 차단 (DENY/DROP)
```

### 방화벽의 중요성

| 상황                | 보안 위협               | 방화벽의 역할                            |
| ------------------- | ----------------------- | ---------------------------------------- |
| SSH 포트 22 개방    | 보안 취약 (무차별 공격) | 22번을 20022로 변경, 화이트리스트만 허용 |
| 불필요한 포트 개방  | 미사용 서비스 침해      | 필요한 포트(20022, 15034)만 허용         |
| Root 원격 접속 허용 | 최고 권한 탈취 위험     | PermitRootLogin 차단                     |

---

## 백엔드(Backend): iptables vs nftables

### 백엔드란?

**백엔드(Backend)**는 사용자 인터페이스 뒤에서 실제 작업을 수행하는 핵심 엔진입니다.

```
사용자 명령
    ↓
UFW/Firewalld (사용자 친화적 인터페이스)
    ↓
iptables/nftables (실제 실행 엔진) ← 백엔드
    ↓
Linux 커널 (네트워크 패킷 필터링)
```

### 계층 구조 예시

```
사용자 명령: `sudo ufw allow 22/tcp`
  ↓
UFW
  ↓
iptables / nftables
  ↓
Linux 커널

동작 의미:
- 사용자가 포트를 열거나 닫는 명령을 입력한다.
- UFW가 그 명령을 읽기 쉬운 규칙으로 해석한다.
- iptables 또는 nftables가 실제 필터링 규칙으로 바꾼다.
- Linux 커널이 패킷을 최종적으로 허용하거나 차단한다.
```

### 변환 예시

| 사용자 입력                 | 백엔드 명령                                     | 동작           |
| --------------------------- | ----------------------------------------------- | -------------- |
| `ufw allow 22/tcp`          | `iptables -A INPUT -p tcp --dport 22 -j ACCEPT` | SSH 포트 허용  |
| `ufw deny 3306/tcp`         | `iptables -A INPUT -p tcp --dport 3306 -j DROP` | MySQL 차단     |
| `ufw default deny incoming` | `iptables -P INPUT DROP`                        | 기본 정책 차단 |

### iptables (구형 백엔드)

#### 특징

- **역사**: Linux 2.4 이래로 표준 방화벽 도구
- **구조**: 프로토콜별로 분리 (IPv4, IPv6 따로 관리)
- **성능**: IPv4와 IPv6를 동시에 처리하면 비효율적

#### 사용 방식

```bash
# IPv4 규칙 추가
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# IPv6 규칙 추가 (따로 입력 필요)
ip6tables -A INPUT -p tcp --dport 22 -j ACCEPT

# 상태 확인
iptables -L -n
```

#### 문제점

- ❌ 많은 규칙 관리 시 느림
- ❌ IPv4/IPv6 각각 설정해야 함
- ❌ 복잡한 규칙 작성 어려움
- ❌ 스크립트 작성 시 오류 위험 높음

### nftables (신형 백엔드)

#### 특징

- **출시**: Linux 3.13부터 도입 (2014년)
- **구조**: 통합 프레임워크 (IPv4/IPv6 한 번에 관리)
- **성능**: 더 빠르고 효율적

#### 사용 방식

```bash
# IPv4/IPv6 통합 규칙
nft add rule inet filter input tcp dport 22 accept

# 상태 확인
nft list ruleset
```

#### 장점

- ✅ 통합 프레임워크로 더 간단
- ✅ IPv4/IPv6 한 번에 처리
- ✅ 성능 개선
- ✅ 더 명확한 문법

### 버전별 백엔드 사용

| 배포판/버전       | 기본 백엔드     | 비고          |
| ----------------- | --------------- | ------------- |
| Ubuntu 18.04 이전 | iptables        | 구형          |
| Ubuntu 20.04      | iptables (기본) | 호환성 유지   |
| **Ubuntu 22.04**  | **nftables**    | 신형으로 전환 |
| Debian 11 이전    | iptables        | 구형          |
| Debian 12         | nftables        | 신형으로 전환 |
| RHEL 8            | nftables        | 신형          |

### UFW/Firewalld의 백엔드 설정

#### UFW

```bash
# Ubuntu 22.04의 UFW는 자동으로 nftables 사용
# 하지만 iptables와의 호환성을 위해 iptables 모드로도 전환 가능
# /etc/default/ufw 수정:
# IPT_SYSCTL=/etc/default/ufw.rules (iptables 방식)
```

#### Firewalld

```bash
# FirewallD는 백엔드 선택 가능
# /etc/firewalld/firewalld.conf:
# FirewallBackend=nftables  (신형)
# FirewallBackend=iptables  (구형)
```

### 성능 비교

```
규칙 개수        iptables         nftables
─────────────────────────────────────────
100개           ~1ms             ~0.5ms
1,000개         ~50ms            ~10ms
10,000개        ~1000ms (1초)   ~100ms
```

---

## UFW (Uncomplicated Firewall)

### 특징

#### 1. 단순성과 사용 용이성

- **목표**: 초보자 친화적인 방화벽 관리
- **구문**: 매우 간단한 커맨드라인 인터페이스
- **학습곡선**: 가파르지 않음 (초보자에게 좋음)

#### 2. 기본 포트 관리

- 포트 차단/허용 (예: `ufw allow 22/tcp`)
- 프로토콜별 관리 (TCP, UDP)
- 프로필 기반 관리 (애플리케이션 프로필 지원)

#### 3. 빠른 설정

- 최소한의 옵션으로 빠르게 설정 가능
- 기본 정책 설정이 간단 (default allow/deny)

#### 4. Debian/Ubuntu 기반 배포판

- Ubuntu, Debian 등에서 권장 도구
- Ubuntu 설치 시 기본 제공

#### 5. 상태 확인

- 간단한 `ufw status` 명령으로 현재 규칙 확인 가능

### 사용 예시

```bash
# UFW 활성화
sudo ufw enable

# 기본 정책 설정
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 포트 허용
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 포트 차단
sudo ufw deny 23/tcp

# 상태 확인
sudo ufw status

# 규칙 삭제
sudo ufw delete allow 22/tcp

# 리로드
sudo ufw reload
```

### 장점

- ✅ 설정이 간단하고 직관적
- ✅ 초보자가 배우기 쉬움
- ✅ 기본적인 포트 관리에 충분
- ✅ 가벼운 리소스 사용
- ✅ Ubuntu/Debian 기반 시스템에 최적화

### 단점

- ❌ 고급 기능이 제한적
- ❌ 동적 방화벽 관리 불가능
- ❌ 네트워크 존(Zone) 개념 없음
- ❌ 런타임 중 규칙 적용 후 명시적 저장 필요
- ❌ Rich Language (복잡한 규칙) 미지원

---

## Firewalld

### 특징

#### 1. 동적 방화벽 관리

- **목표**: 엔터프라이즈급 동적 방화벽
- **런타임 중 규칙 변경 가능**: 서비스 재시작 없음
- **Zone 개념**: 네트워크 환경에 따른 다양한 규칙 관리

#### 2. 네트워크 존(Zone)

- **public, private, trusted, work, internal, dmz, block, drop** 등 사전 정의 존
- 각 존마다 다른 규칙 적용 가능
- 네트워크 인터페이스별로 존 할당 가능

#### 3. Rich Language 지원

- 복잡한 규칙을 텍스트로 정의 가능
- 조건부 규칙 (source, destination, protocol 등)

#### 4. 서비스 기반 관리

- 포트가 아닌 "서비스" 개념으로 관리 (예: ssh, http, https)
- `/usr/lib/firewalld/services/` 에서 미리 정의된 서비스 확인 가능

#### 5. D-Bus 통신

- systemd 기반 시스템과 밀접한 통합
- 런타임 중 규칙 변경이 안전하고 빠름

#### 6. Red Hat 기반 배포판

- RHEL, CentOS, Fedora 등에서 권장 도구
- 현대적 Linux 배포판에서 기본 제공

#### 7. XML 기반 설정 파일

- `/etc/firewalld/zones/` 에서 zone 설정
- `/etc/firewalld/services/` 에서 서비스 정의

### 사용 예시

```bash
# firewalld 활성화
sudo systemctl start firewalld
sudo systemctl enable firewalld

# 기본 zone 확인
sudo firewall-cmd --get-default-zone

# 활성 zone 확인
sudo firewall-cmd --get-active-zones

# 포트 허용 (임시)
sudo firewall-cmd --add-port=22/tcp

# 포트 허용 (영구)
sudo firewall-cmd --permanent --add-port=22/tcp

# 서비스 허용 (영구)
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http

# 설정 적용
sudo firewall-cmd --reload

# zone별 상태 확인
sudo firewall-cmd --list-all
sudo firewall-cmd --zone=public --list-all

# Rich Rule 예시 (영구)
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.1.0/24" port protocol="tcp" port="3306" accept'

# 설정 확인
sudo firewall-cmd --list-all
```

### 장점

- ✅ 동적 규칙 관리 (재부팅 불필요)
- ✅ Zone 개념으로 유연한 정책 관리
- ✅ 엔터프라이즈급 기능
- ✅ Rich Language로 복잡한 규칙 정의 가능
- ✅ 서비스 기반 관리로 가독성 좋음
- ✅ 런타임 중 테스트 후 저장 가능 (--timeout 옵션)

### 단점

- ❌ 설정이 복잡함
- ❌ 학습곡선이 가파름 (초보자에게 어려움)
- ❌ XML 설정 파일 이해 필요
- ❌ Red Hat 기반 시스템에 더 최적화됨
- ❌ Ubuntu에서는 추가 설치 필요

---

## 상세 비교표

| 항목                    | UFW                | Firewalld            |
| ----------------------- | ------------------ | -------------------- |
| **주 대상 배포판**      | Debian, Ubuntu     | RHEL, CentOS, Fedora |
| **설정 복잡도**         | 매우 단순          | 중간~복잡            |
| **초보자 친화성**       | ⭐⭐⭐⭐⭐         | ⭐⭐⭐               |
| **엔터프라이즈 기능**   | ⭐⭐               | ⭐⭐⭐⭐⭐           |
| **동적 규칙 관리**      | ❌                 | ✅                   |
| **Zone 개념**           | ❌                 | ✅                   |
| **Rich Language**       | ❌                 | ✅                   |
| **서비스 기반 관리**    | 제한적             | ✅                   |
| **설정 파일 형식**      | Plaintext          | XML                  |
| **런타임 중 규칙 변경** | 불가 (재로드 필요) | 가능                 |
| **백엔드**              | iptables/nftables  | iptables/nftables    |
| **리소스 사용량**       | 가벼움             | 중간                 |
| **명령어 학습난도**     | 쉬움               | 어려움               |

---

## 선택 기준

### UFW를 선택해야 할 때

```
✓ Ubuntu/Debian 기반 시스템
✓ 간단한 포트 허용/차단만 필요
✓ 초보자 친화적 설정 원함
✓ 가벼운 방화벽 원함
✓ 빠르게 설정해야 함
✓ 소규모 프로젝트/개인 서버
```

### Firewalld를 선택해야 할 때

```
✓ RHEL/CentOS/Fedora 기반 시스템
✓ Zone 기반 복잡한 네트워크 정책 필요
✓ 동적 규칙 변경 필요
✓ 엔터프라이즈 환경
✓ 복잡한 규칙(Rich Language) 필요
✓ 서비스 기반 관리 선호
✓ 대규모 시스템 인프라
```

---

## 설정 예시 비교

### 시나리오: SSH(22), HTTP(80), HTTPS(443)만 허용, 나머지 차단

#### UFW 방식

```bash
# 기본 정책: 들어오는 것 모두 차단, 나가는 것 모두 허용
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 필요한 포트만 허용
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 활성화
sudo ufw enable

# 상태 확인
sudo ufw status
```

#### Firewalld 방식

```bash
# firewalld 시작
sudo systemctl start firewalld
sudo systemctl enable firewalld

# public zone으로 변경 (기본적으로 들어오는 것 차단)
sudo firewall-cmd --set-default-zone=public

# 서비스 허용 (영구)
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https

# 설정 적용
sudo firewall-cmd --reload

# 상태 확인
sudo firewall-cmd --list-all
```

---

## 런타임 규칙 변경 비교

### 임시로 포트 열기 후 테스트

#### UFW

```bash
# UFW는 규칙을 바로 적용할 수 없음 → reload 필요
sudo ufw allow 3306/tcp  # 자동 적용

# 나중에 제거
sudo ufw delete allow 3306/tcp
sudo ufw reload
```

#### Firewalld

```bash
# 임시로 포트 열기 (30초 후 자동 제거)
sudo firewall-cmd --add-port=3306/tcp --timeout=30

# 상태 확인
sudo firewall-cmd --list-ports

# 또는 30분 동안만 허용
sudo firewall-cmd --add-port=3306/tcp --timeout=1800

# 영구 적용 (저장)
sudo firewall-cmd --permanent --add-port=3306/tcp
sudo firewall-cmd --reload
```

---

## 이 과제에서의 선택

### 미션 환경이 Ubuntu 22.04 LTS일 경우

**→ UFW 권장**

- Ubuntu 기본 제공
- 설정이 간단하고 명확
- 이 미션의 요구사항 (포트 20022, 15034만 허용)에 충분

### 미션 환경이 RHEL/CentOS일 경우

**→ Firewalld 권장**

- Red Hat 기반 배포판 기본 제공
- Zone 기반 관리로 체계적

---

## 결론

| 관점                    | UFW        | Firewalld   |
| ----------------------- | ---------- | ----------- |
| **초보자 추천도**       | ⭐⭐⭐⭐⭐ | ⭐⭐⭐      |
| **엔터프라이즈**        | ⭐⭐       | ⭐⭐⭐⭐⭐  |
| **학습 투자 대비 효과** | 높음       | 높음 (장기) |

**한 줄 요약**:

- **UFW**: "구멍을 뚫어주는 도구" (간단, 빠름)
- **Firewalld**: "존(zone) 기반 보안 정책" (복잡, 강력)
