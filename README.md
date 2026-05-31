# 리눅스 서버 운영 미션 수행 문서

## 1. 과제 개요

이 과제는 리눅스 서버 환경에서 기본 보안, 계정/그룹/권한 관리, 실행 환경 구성, 그리고 관제 자동화를 한 흐름으로 구성하는 실습이다.

핵심 목표는 다음과 같다.

- SSH 포트를 20022로 변경하고 Root 원격 로그인을 차단한다.
- UFW를 사용해 필요한 포트만 허용한다.
- `agent-admin`, `agent-dev`, `agent-test` 계정과 `agent-common`, `agent-core` 그룹을 구성한다.
- `upload_files`, `api_keys`, `/var/log/agent-app` 디렉토리에 최소 권한 정책을 적용한다.
- `agent-admin` 기준 실행 환경 변수를 고정하고 API 키 파일을 생성한다.
- `monitor.sh`로 시스템 상태를 수집하고 로그에 남기며, cron으로 주기 실행되도록 한다.

구성 스크립트는 [`bin/setup.sh`](bin/setup.sh)에서 관리한다.

## 2. 수행 과정

### 2-1. 기본 보안 및 네트워크 설정

먼저 SSH 설정 파일(`/etc/ssh/sshd_config`)에서 포트를 `20022`로 변경하고 `PermitRootLogin no`를 적용한다. 이후 `sshd -t`로 설정 문법을 검사한 뒤 SSH 서비스를 재시작한다.

방화벽은 UFW를 사용한다. 기본 정책은 인바운드 차단, 아웃바운드 허용으로 두고 `20022/tcp`, `15034/tcp`만 예외적으로 허용한다.

```bash
ensure_sshd_runtime_dir() { # SSHD가 런타임에 필요한 디렉토리를 생성하는 함수
  sudo mkdir -p /run/sshd
  sudo chmod 755 /run/sshd
}

ensure_sshd_hostkeys() {
  if ls /etc/ssh/ssh_host_* >/dev/null 2>&1; then # SSH 호스트 키가 이미 존재하는 경우
    return 0
  fi

  sudo ssh-keygen -A # SSH 호스트 키가 없는 경우 자동으로 생성
}

ensure_sshd_setting() {
  local key="$1"
  local value="$2"

  if grep -qE "^[[:space:]]*#?[[:space:]]*${key}[[:space:]]+" "$SSH_CONFIG"; then
    sudo sed -i.bak -E "s|^[[:space:]]*#?[[:space:]]*${key}[[:space:]]+.*|${key} ${value}|" "$SSH_CONFIG"
  else
  # 설정이 없으면 파일 끝에 추가
    echo "${key} ${value}" | sudo tee -a "$SSH_CONFIG" >/dev/null
  fi
}

ensure_sshd_runtime_dir
ensure_sshd_hostkeys
ensure_sshd_setting Port "$SSH_PORT"
ensure_sshd_setting PermitRootLogin no

sudo sshd -t # SSH 설정 파일의 문법이 올바른지 테스트
sudo systemctl restart ssh # SSH 서비스를 재시작하여 설정 반영
sudo systemctl enable ssh # 시스템 부팅 시 SSH 서비스가 자동으로 시작되도록 설정

sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow "${SSH_PORT}/tcp"
sudo ufw allow "${APP_PORT}/tcp"
sudo ufw --force enable # UFW를 강제로 활성화하여 설정을 즉시 적용 (사용자 확인 프롬프트 없이)
```

- SSH 포트가 `20022`인지 확인
- Root 원격 로그인이 차단되었는지 확인
- UFW가 활성화되어 있고 `20022/tcp`, `15034/tcp`만 허용되는지 확인

```bash
sudo grep -E "^(Port|PermitRootLogin)" /etc/ssh/sshd_config
sudo ss -tulnp | grep sshd
sudo ufw status verbose
```

![SSH 및 방화벽 설정 확인 예시](./assets/1_1.png)
![UFW 상태 확인 예시](./assets/1_2.png)

### 2-2. 계정, 그룹, 권한 체계 구성

운영 목적에 맞게 계정을 분리했다.

- `agent-admin`: 운영/관리 및 cron 실행 계정
- `agent-dev`: 개발/운영 및 `monitor.sh` 작성 계정
- `agent-test`: 테스트 계정

그룹은 다음처럼 나눴다.

- `agent-common`: 공용 접근이 필요한 계정용 그룹
- `agent-core`: 핵심 운영 데이터 접근용 그룹

디렉토리는 `AGENT_HOME` 기준으로 구성했다.

- `/home/agent-admin/agent-app`
- `/home/agent-admin/agent-app/upload_files`
- `/home/agent-admin/agent-app/api_keys`
- `/home/agent-admin/agent-app/bin`
- `/var/log/agent-app`

권한 정책은 다음과 같이 적용했다.

- `upload_files`: `agent-common` 그룹이 읽기/쓰기 가능
- `api_keys`: `agent-core` 그룹만 읽기/쓰기 가능
- `/var/log/agent-app`: `agent-core` 그룹만 읽기/쓰기 가능

ACL은 하위 파일에도 동일 정책이 이어지도록 default ACL을 추가하는 방식으로 설정했다.

```bash
log_step "2-1" "그룹을 생성합니다"
ensure_group agent-common
ensure_group agent-core

log_step "2-2" "사용자 계정을 생성합니다"
ensure_user agent-admin "agent-core,agent-common"
ensure_user agent-dev "agent-core,agent-common"
ensure_user agent-test "agent-common"

log_step "2-3" "디렉토리 구조 생성 및 소유권/기본 권한 설정"
ensure_dir "$AGENT_HOME"
ensure_dir "$UPLOAD_DIR"
ensure_dir "$API_KEY_DIR"
ensure_dir "$BIN_DIR"
ensure_dir "$LOG_DIR"

# 1. 앱 홈: 관리자만 모든 권한, common은 읽기/진입만 (750)
set_owner_mode "agent-admin:agent-common" 750 "$AGENT_HOME"
# 2. 업로드: common 그룹 누구나 파일 업로드 가능 (770)
set_owner_mode "agent-admin:agent-common" 770 "$UPLOAD_DIR"
# 3. API 키 (디렉토리인 경우): core 그룹 ONLY (770)
set_owner_mode "agent-admin:agent-core" 770 "$API_KEY_DIR"
# 4. 바이너리: dev가 관리, core가 실행 가능 (750)
set_owner_mode "agent-dev:agent-core" 750 "$BIN_DIR"
# 5. 로그: core 그룹 ONLY 읽고 쓰기 가능 (770)
set_owner_mode "agent-admin:agent-core" 770 "$LOG_DIR"
log_ok "디렉토리 생성 및 소유권/기본 권한 셋팅 완료"

log_step "2-4" "하위 파일들을 위한 ACL 상속(-d) 권한 설정"
if command -v setfacl >/dev/null 2>&1; then
  sudo setfacl -d -m g:agent-common:rwx "$UPLOAD_DIR"
  sudo setfacl -d -m g:agent-core:rwx "$API_KEY_DIR"
  sudo setfacl -d -m g:agent-core:rwx "$LOG_DIR"
  log_ok "ACL 상속(Default) 권한 설정 완료"
else
  log_ok "setfacl 명령어가 없어 ACL 상속 설정은 건너뜁니다."
fi

log_step "2-5" "최종 권한 상태 검증"
sudo ls -ld "$AGENT_HOME" "$UPLOAD_DIR" "$API_KEY_DIR" "$BIN_DIR" "$LOG_DIR"
if command -v setfacl >/dev/null 2>&1; then
  sudo getfacl "$UPLOAD_DIR" "$API_KEY_DIR" "$LOG_DIR"
fi


```



- `agent-admin`, `agent-dev`, `agent-test` 계정이 생성되었는지 확인
- `agent-common`, `agent-core` 그룹이 존재하는지 확인
- 디렉토리 권한과 ACL이 의도한 대로 적용되었는지 확인

```bash
id agent-admin && id agent-dev && id agent-test
```



### 2-3. 애플리케이션 실행 환경 구성

환경 변수는 `/etc/profile.d/agent_env.sh`에 저장해 시스템 전역으로 적용되도록 했다.

설정한 값은 다음과 같다.

```bash
export AGENT_HOME="/home/agent-admin/agent-app"
export AGENT_PORT=15034
export AGENT_UPLOAD_DIR="$AGENT_HOME/upload_files"
export AGENT_KEY_PATH="$AGENT_HOME/api_keys"
export AGENT_LOG_DIR="/var/log/agent-app"
```

또한 `agent-admin` 계정의 셸에서도 이 파일을 읽도록 해 새 셸에서 바로 환경변수가 반영되게 했다.

```bash
source /etc/profile.d/agent_env.sh
```

`setup.sh`를 한 후에 환경변수 설정이 즉시 반영되도록 위 명령어를 실행한다.

## 3. 확인하는 부분

이 과제에서 제출 시 중요하게 봐야 할 확인 항목은 아래와 같다.


### 3-2. 계정 및 권한

- `agent-admin`, `agent-dev`, `agent-test` 계정이 생성되었는지 확인
- `agent-common`, `agent-core` 그룹이 존재하는지 확인
- 디렉토리 권한과 ACL이 의도한 대로 적용되었는지 확인

```bash
id agent-admin
id agent-dev
id agent-test
```

![계정 확인 예시](./assets/2_2_1.png)

### 3-3. 환경 변수

- `AGENT_HOME`, `AGENT_PORT`, `AGENT_UPLOAD_DIR`, `AGENT_KEY_PATH`, `AGENT_LOG_DIR`가 올바르게 들어갔는지 확인
- 새 로그인 셸 또는 현재 셸에서 환경 변수가 즉시 읽히는지 확인

```bash
echo "$AGENT_HOME"
echo "$AGENT_PORT"
echo "$AGENT_UPLOAD_DIR"
echo "$AGENT_KEY_PATH"
echo "$AGENT_LOG_DIR"
```

### 3-4. 애플리케이션과 관제

- 제공된 Python 앱이 Boot Sequence 5단계를 모두 `[OK]`로 통과하는지 확인
- 마지막에 `Agent READY`가 출력되는지 확인
- `monitor.sh`가 프로세스/포트/리소스를 수집하고 로그를 남기는지 확인
- `cron`으로 매분 실행되어 `monitor.log`가 누적되는지 확인

## 4. 대표 확인 명령어

```bash
sudo grep -E "^(Port|PermitRootLogin)" /etc/ssh/sshd_config
sudo ss -tulnp | grep sshd
sudo ufw status verbose

id agent-admin
id agent-dev
id agent-test
getent group agent-common
getent group agent-core

ls -ld /home/agent-admin/agent-app /home/agent-admin/agent-app/upload_files /home/agent-admin/agent-app/api_keys /home/agent-admin/agent-app/bin /var/log/agent-app
getfacl /home/agent-admin/agent-app/upload_files
getfacl /home/agent-admin/agent-app/api_keys
getfacl /var/log/agent-app

echo "$AGENT_HOME"
echo "$AGENT_PORT"
cat /home/agent-admin/agent-app/api_keys/t_secret.key
```
