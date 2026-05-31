# 기본 보안 및 네트워크 설정 방법

이 문서는 리눅스 서버 운영 미션에서 필요한 기본 보안 및 네트워크 설정 절차를 정리한 것이다. 목표는 SSH 포트를 20022로 변경하고, Root 원격 로그인을 차단하며, 방화벽에서 필요한 포트만 허용하는 것이다.

## 1. SSH 포트 변경

1. SSH 설정 파일을 연다.
   - 위치: `/etc/ssh/sshd_config`

2. SSH 포트를 20022로 변경한다.
   - `Port 22`를 `Port 20022`로 바꾼다.
   - 이미 `Port` 항목이 없으면 새로 추가한다.

3. Root 원격 로그인을 차단한다.
   - `PermitRootLogin yes`를 `PermitRootLogin no`로 바꾼다.

4. 설정 문법을 검사한다.
   - `sudo sshd -t`

5. SSH 서비스를 재시작한다.
   - `sudo systemctl restart ssh`
   - 또는 `sudo systemctl restart sshd`

6. 실제 리슨 포트를 확인한다.
   - `ss -tulnp | grep sshd`
   - 출력에 `20022`가 보여야 한다.

7. 접속 테스트를 수행한다.
   - `ssh -p 20022 user@localhost`
   - `ssh -p 20022 root@localhost`
   - root 로그인은 실패해야 정상이다.

## 2. 방화벽 설정

방화벽은 UFW 또는 firewalld 중 하나만 선택해 설정한다. 둘 다 동시에 쓰지 않아도 된다.

### 2-1. UFW를 사용하는 경우

1. UFW를 활성화한다.
   - `sudo ufw enable`

2. 기본 정책을 설정한다.
   - `sudo ufw default deny incoming`
   - `sudo ufw default allow outgoing`

3. 필요한 포트만 허용한다.
   - `sudo ufw allow 20022/tcp`
   - `sudo ufw allow 15034/tcp`

4. 상태를 확인한다.
   - `sudo ufw status`

### 2-2. firewalld를 사용하는 경우

1. firewalld를 시작하고 활성화한다.
   - `sudo systemctl start firewalld`
   - `sudo systemctl enable firewalld`

2. 필요한 포트만 허용한다.
   - `sudo firewall-cmd --permanent --add-port=20022/tcp`
   - `sudo firewall-cmd --permanent --add-port=15034/tcp`

3. 설정을 다시 적용한다.
   - `sudo firewall-cmd --reload`

4. 상태를 확인한다.
   - `sudo firewall-cmd --list-all`

## 3. 최종 확인 항목

- `/etc/ssh/sshd_config`에서 `Port 20022`를 확인한다.
- `/etc/ssh/sshd_config`에서 `PermitRootLogin no`를 확인한다.
- `ss -tulnp | grep sshd` 결과에서 sshd가 `20022` 포트를 듣는지 확인한다.
- 선택한 방화벽에서 `20022/tcp`와 `15034/tcp`만 허용되었는지 확인한다.
- `root` 계정의 원격 SSH 로그인이 거부되는지 확인한다.

## 4. 제출용 기록 예시

- SSH 변경 방법: `sshd_config` 수정 후 서비스 재시작
- 방화벽 선택 및 설정 방법: UFW 또는 firewalld 중 하나 선택 후 허용 포트만 등록
- 검증 명령어: `ss -tulnp`, `ufw status`, `firewall-cmd --list-all`, `ssh -p 20022 root@localhost`
