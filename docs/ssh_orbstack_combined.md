# OrbStack과 우분투 SSH 설정 (통합 안내)

이 문서는 OrbStack 기반 VM에서의 SSH 동작 차이와, 우분투 내부에서 `OpenSSH`를 설치·설정하여 포트 및 Root 로그인 정책을 확실히 적용하는 절차를 하나로 정리한다.

## 요약

- OrbStack은 Mac 호스트 레벨에서 자체 내장 SSH 중계(백엔드)를 제공할 수 있다. 이 경우 VM 내부에 `sshd_config`가 없을 수 있다.
- OrbStack 기본 통로는 포트 변경이나 세부 `sshd_config` 조정이 어렵다. 따라서 `Port 20022`와 `PermitRootLogin no` 같은 정책을 확실히 적용하려면 VM 내부에 `openssh-server`를 설치하고 직접 관리해야 한다.

## OrbStack의 SSH 구조 (왜 `sshd_config`가 없나)

- OrbStack은 VM 내부의 `sshd`가 아닌, 호스트 쪽(OrbStack 백엔드)에서 키 기반 SSH를 받아 VM 셸로 연결해 준다.
- 결과적으로 우분투 내부 파일 시스템에 `/etc/ssh/sshd_config`가 없거나, 존재해도 OrbStack 기본 접속에는 영향을 주지 않을 수 있다.

### 특징

- OrbStack 내장 SSH는 고정 포트(예: 32222)와 키 기반 인증을 사용하는 경우가 많다.
- 패스워드 로그인은 기본적으로 비활성화되어 있을 수 있다.

## 우분투 내부에 OpenSSH 설치 및 설정 (권장)

1. OpenSSH 설치

```bash
sudo apt update
sudo apt install -y openssh-server
```

2. 설정 파일 수정 (`/etc/ssh/sshd_config`)

- 파일 내에서 다음 항목을 주석 해제하거나 없으면 새로 추가한다.

- `Port 20022`
- `PermitRootLogin no`

- 예: `Port`와 `PermitRootLogin`이 `#`으로 주석 처리되어 있으면 `#`을 제거하거나 직접 추가하세요.

자동화 예시 (기존 `Port` 항목을 덮어쓰기 또는 추가):

```bash
sudo sed -i.bak -E 's/^#?\s*Port\s+.*/Port 20022/' /etc/ssh/sshd_config || echo 'Port 20022' | sudo tee -a /etc/ssh/sshd_config
sudo sed -i.bak -E 's/^#?\s*PermitRootLogin\s+.*/PermitRootLogin no/' /etc/ssh/sshd_config || echo 'PermitRootLogin no' | sudo tee -a /etc/ssh/sshd_config
```

3. 구성 검사 및 서비스 재시작

```bash
sudo sshd -t
sudo systemctl daemon-reload
sudo systemctl restart ssh
sudo systemctl enable ssh
```

4. 방화벽에서 포트 허용

- UFW 사용 시:

```bash
sudo ufw allow 20022/tcp
sudo ufw enable
sudo ufw status
```

- firewalld 사용 시:

```bash
sudo firewall-cmd --permanent --add-port=20022/tcp
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

## 접속 방식 구분 및 테스트

- OrbStack 기본 접속 (중계):

```bash
ssh 사용자명@orb
```

- 직접 설치한 내부 OpenSSH 접속 (새 포트 적용):

```bash
ssh -p 20022 사용자명@localhost
```

검증 명령들:

```bash
ss -tulnp | grep sshd    # sshd가 20022 포트를 듣는지 확인
ssh -p 20022 root@localhost   # root 로그인 차단 확인 (실패해야 정상)
sudo sshd -t            # 설정 문법 검사
```

## 제출/검증 체크리스트 (미션용)

- `/etc/ssh/sshd_config`에 `Port 20022`가 설정되어 있는지 확인한다.
- `/etc/ssh/sshd_config`에 `PermitRootLogin no`가 설정되어 있는지 확인한다.
- `ss -tulnp | grep sshd` 출력에서 `20022` 리스닝 확인.
- 선택한 방화벽(UFW 또는 firewalld)에 `20022/tcp` 허용 여부 확인.
- `ssh -p 20022 root@localhost` 실행 시 root 로그인 차단 확인.

## 참고: 편집 중 발생하는 에러 관련 빠른 팁

- Vim에서 `E45: 'readonly' option is set`가 뜨면 파일이 읽기전용이거나 `vim -R`로 열렸을 가능성이 있다. 저장하려면 `:w!` 또는 권한 문제일 경우 아래처럼 `sudo tee`를 사용한다:

```bash
# Vim 내부에서
:w !sudo tee % >/dev/null
```

또는 파일 권한을 변경:

```bash
sudo chown $(whoami):$(whoami) /etc/ssh/sshd_config
sudo chmod u+w /etc/ssh/sshd_config
```

## 결론

OrbStack 환경에서는 호스트(OrbStack)가 SSH를 중계하기 때문에 VM 내부의 `sshd_config`가 없거나 적용되지 않을 수 있다. 운영·검증 목적상 포트 변경과 Root 차단을 확실히 하려면 우분투 내부에 `openssh-server`를 설치해 직접 설정하고, 위의 설정·검증 절차를 따라 적용하면 된다.

---
