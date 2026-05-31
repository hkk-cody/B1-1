# OrbStack SSH 접속 구조와 설정 정리

이 문서는 "Mac 호스트에서는 SSH 접속이 되는데, VM 안에는 왜 `sshd_config`가 없느냐"는 질문에 대한 설명과, 원하는 SSH 보안 설정을 적용하는 방법을 정리한 것이다.

## 1. 왜 VM 안에 `sshd_config`가 없나

OrbStack은 일반적인 VM처럼 우분투 내부에서 `openssh-server`를 직접 돌리는 구조가 아니다. 대신 OrbStack 프로그램 자체가 Mac 호스트 레벨에서 내장 SSH 서버를 운영하고, 사용자의 접속 요청을 받아 VM 셸로 연결해 준다.

즉, `ssh ubuntu@orb` 같은 접속은 VM 내부의 `sshd`가 아니라 OrbStack 백엔드가 처리한다. 그래서 우분투 내부를 확인해도 `/etc/ssh/sshd_config`가 없을 수 있다.

### 이 구조의 특징

- SSH 접속은 OrbStack이 중간에서 처리한다.
- 내장 SSH 서버는 보통 고정된 포트와 키 기반 인증을 사용한다.
- 패스워드 로그인은 기본적으로 허용되지 않는다.
- VM 내부 설정 파일을 수정해도 OrbStack의 기본 SSH 접속 방식에는 직접 반영되지 않는다.

## 2. 원하는 보안 설정을 적용하려면

OrbStack의 기본 SSH 통로는 세부 설정을 마음대로 바꾸기 어렵다. 따라서 `20022` 포트 사용, Root 로그인 차단 같은 정책을 확실히 적용하려면 우분투 내부에 별도의 OpenSSH 서버를 직접 설치해야 한다.

### 2-1. OpenSSH 서버 설치

```bash
sudo apt update && sudo apt install -y openssh-server
```

설치가 끝나면 `/etc/ssh/sshd_config`가 생성된다.

### 2-2. 설정 변경

`/etc/ssh/sshd_config`에서 다음 항목을 반영한다.

- `Port 20022`
- `PermitRootLogin no`

### 2-3. 서비스 적용

```bash
sudo systemctl daemon-reload
sudo systemctl restart ssh
sudo systemctl enable ssh
```

## 3. 접속 방식 구분

설정 이후에는 두 가지 방식이 공존할 수 있다.

### OrbStack 기본 접속

- 포트 변경이 어렵다.
- Root 차단은 OrbStack 기본 동작에 의해 이미 제한될 수 있다.

예시:

```bash
ssh 사용자명@orb
```

### 내가 직접 만든 SSH 서버 접속

- `20022` 포트를 사용한다.
- `sshd_config`에 반영한 보안 정책이 적용된다.

예시:

```bash
ssh -p 20022 사용자명@localhost
```

## 4. 확인 포인트

- `/etc/ssh/sshd_config`에 `Port 20022`가 반영되어 있는지 확인한다.
- `/etc/ssh/sshd_config`에 `PermitRootLogin no`가 반영되어 있는지 확인한다.
- `ss -tulnp | grep sshd`로 `sshd`가 실제로 `20022` 포트를 듣는지 확인한다.
- `ssh -p 20022 root@localhost` 시도가 실패하는지 확인한다.

## 5. 결론

OrbStack 환경에서는 Mac 호스트 쪽 내장 SSH 서버가 접속을 중계하므로, VM 내부에 `sshd_config`가 없을 수 있다. 원하는 포트와 Root 차단 정책을 확실히 제어하려면, 우분투 내부에 OpenSSH 서버를 별도로 설치해 직접 관리하는 방식이 가장 안전하다.
