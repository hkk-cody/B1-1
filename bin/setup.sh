#!/usr/bin/env bash
set -euo pipefail # 안전한 스크립트 실행을 위한 옵션 설정

# ----- 설정 값 -----
SSH_CONFIG="/etc/ssh/sshd_config"
SSH_PORT="20022"
APP_PORT="15034"
AGENT_HOME="/home/agent-admin/agent-app"
UPLOAD_DIR="$AGENT_HOME/upload_files"
API_KEY_DIR="$AGENT_HOME/api_keys"
BIN_DIR="$AGENT_HOME/bin"
LOG_DIR="/var/log/agent-app"

# ----- 공통 로그 함수 -----
log_step() {
  printf '\n[%s] %s\n' "$1" "$2"
}

log_ok() {
  printf '[OK] %s\n' "$1"
}

# ----- 패키지 / 계정 / 디렉토리 준비 함수 -----
require_apt() {
  if ! command -v apt-get >/dev/null 2>&1; then # apt-get이 시스템에 존재하는지 확인
    echo "apt-get을 찾을 수 없습니다. Ubuntu/Debian 계열에서 실행해 주세요." >&2
    exit 1
  fi
}

install_if_missing() {
  local package_name="$1"

  if dpkg -s "$package_name" >/dev/null 2>&1; then # 패키지가 이미 설치되어 있는지 확인
    echo "$package_name가 이미 설치되어 있습니다."
  else
    echo "$package_name가 설치되어 있지 않습니다. 설치를 진행합니다."
    sudo apt-get update
    sudo apt-get install -y "$package_name"
    echo "$package_name 설치가 완료되었습니다."
  fi
}

ensure_group() { # 그룹을 생성하는 함수
  local group_name="$1" # 그룹이 이미 존재하는지 확인하고, 없으면 생성

  if getent group "$group_name" >/dev/null 2>&1; then # 그룹이 이미 존재하는 경우
    log_ok "그룹 $group_name 은(는) 이미 존재합니다."
  else
    sudo groupadd "$group_name" # 그룹이 존재하지 않으면 생성
    log_ok "그룹 $group_name 생성 완료"
  fi
}

ensure_user() { # 사용자 계정을 생성하고, 필요한 그룹에 추가하는 함수
  local user_name="$1" # 사용자 이름
  local group_list="$2" # 사용자에게 추가할 그룹 목록 (쉼표로 구분된 문자열)
  local shell="${3:-}" # 사용자 쉘 (선택적, 기본값은 /bin/bash)

  if id "$user_name" >/dev/null 2>&1; then # 사용자가 이미 존재하는지 확인
    sudo usermod -aG "$group_list" "$user_name" # 사용자가 이미 존재하면 그룹에 추가
    log_ok "사용자 $user_name 에 그룹 $group_list 추가 완료"
  else
    sudo useradd -m -G "$group_list" -s "${shell:-/bin/bash}" "$user_name" # 사용자가 존재하지 않으면 생성
    log_ok "사용자 $user_name 생성 완료"
  fi
}

ensure_dir() { # 디렉토리를 생성하는 함수
  local dir_path="$1"
  sudo mkdir -p "$dir_path" # 디렉토리가 이미 존재하면 아무 작업도 하지 않고, 없으면 생성
}

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

set_owner_mode() { # 파일/디렉토리의 소유자와 권한을 설정하는 함수
  local owner_group="$1"
  local mode="$2"
  local target_path="$3"

  sudo chown "$owner_group" "$target_path" # 소유자와 그룹 설정
  sudo chmod "$mode" "$target_path" # 권한 설정
}

# ----- SSH 설정 함수 -----
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

require_apt
install_if_missing openssh-server
install_if_missing ufw
install_if_missing acl

# ----- 사전 점검 -----
if [[ ! -f "$SSH_CONFIG" ]]; then
  echo "SSH 설정 파일을 찾을 수 없습니다: $SSH_CONFIG" >&2
  exit 1
fi

# ----- Phase 1: 기본 보안 및 네트워크 설정 -----
log_step "PHASE 1" "기본 보안 및 네트워크 설정 시작"

log_step "1-1" "SSH 포트와 Root 로그인 정책을 설정합니다"
ensure_sshd_runtime_dir
ensure_sshd_hostkeys
ensure_sshd_setting Port "$SSH_PORT"
ensure_sshd_setting PermitRootLogin no

sudo sshd -t # SSH 설정 파일의 문법이 올바른지 테스트
sudo systemctl restart ssh # SSH 서비스를 재시작하여 설정 반영
sudo systemctl enable ssh # 시스템 부팅 시 SSH 서비스가 자동으로 시작되도록 설정
log_ok "SSH 설정 반영 완료"

log_step "1-1-1" "SSH 서비스가 정상적으로 실행 중인지 확인합니다"
sudo grep -E "^(Port|PermitRootLogin)" "$SSH_CONFIG" # SSH 설정이 올바르게 적용되었는지 확인
sudo ss -tulnp | grep sshd # SSH 서비스가 지정한 포트에서 실행 중인지 확인

log_step "1-2" "UFW 기본 정책과 허용 포트를 설정합니다"
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow "${SSH_PORT}/tcp"
sudo ufw allow "${APP_PORT}/tcp"
sudo ufw --force enable # UFW를 강제로 활성화하여 설정을 즉시 적용 (사용자 확인 프롬프트 없이)
log_ok "UFW 규칙 반영 완료"

log_step "1-2-1" "UFW 상태를 확인합니다"
sudo ufw status verbose # UFW가 활성화되어 있고, SSH와 애플리케이션 포트가 허용되어 있는지 확인

log_ok "PHASE 1 완료"

# ----- Phase 2: 계정 / 그룹 / 권한 체계 구성 -----
log_step "PHASE 2" "계정/그룹/권한 체계 구성 시작"

log_step "2-1" "그룹을 생성합니다"
ensure_group agent-common
ensure_group agent-core

log_step "2-2" "사용자 계정을 생성합니다"
ensure_user agent-admin "agent-core,agent-common"
ensure_user agent-dev "agent-core,agent-common"
ensure_user agent-test "agent-common"

log_step "2-2-1" "계정 생성 및 그룹 포함 상태를 확인합니다"
id agent-admin && id agent-dev && id agent-test

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
  # 소유 그룹 권한은 이미 770으로 충분하므로, 앞으로 생길 자식 파일들을 위한 대물림(-d) 규칙만 셋팅합니다.
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

log_ok "PHASE 2 완료"

# ----- Phase 3: 애플리케이션 실행 환경 구성 -----
log_step "PHASE 3" "애플리케이션 실행 환경 구성 시작"

log_step "3-1" "시스템 전역 환경변수 설정"
AGENT_PROFILE="/etc/profile.d/agent_env.sh" # 시스템 전역 환경변수 스크립트 경로
if sudo grep -q "export AGENT_HOME=" "$AGENT_PROFILE" >/dev/null 2>&1; then # 이미 환경변수가 등록되어 있는지 확인
  log_ok "환경변수 이미 등록됨: $AGENT_PROFILE"
else
  sudo tee "$AGENT_PROFILE" >/dev/null <<'EOF' # 시스템 전역 환경변수 설정
export AGENT_HOME="/home/agent-admin/agent-app"
export AGENT_PORT=15034
export AGENT_UPLOAD_DIR="$AGENT_HOME/upload_files"
export AGENT_KEY_PATH="$AGENT_HOME/api_keys"
export AGENT_LOG_DIR="/var/log/agent-app"
EOF
  sudo chmod +x /etc/profile.d/agent_env.sh # 환경변수 스크립트에 실행 권한 부여
  log_ok "환경변수 등록 완료: $AGENT_PROFILE"
fi
# source /etc/profile.d/agent_env.sh

log_step "3-2" "API 키 파일 생성 및 권한 설정"
if [[ -f "$API_KEY_DIR/secret.key" ]]; then
  log_ok "키 파일이 이미 존재합니다: $API_KEY_DIR/secret.key"
else
  echo "agent_api_key_test" | sudo tee "$API_KEY_DIR/secret.key" >/dev/null
  log_ok "키 파일 생성: $API_KEY_DIR/secret.key"
fi
set_owner_mode "agent-admin:agent-core" 640 "$API_KEY_DIR/secret.key"

log_step "3-3" "애플리케이션 바이너리를 AGENT_HOME으로 이동"
sudo chown agent-admin:agent-common agent-app-linux-arm64
sudo chmod +x ./agent-app-linux-arm64
sudo mv ./agent-app-linux-arm64 "$AGENT_HOME"
log_ok "애플리케이션 바이너리 이동 완료: $AGENT_HOME/agent-app-linux-arm64"


# ----- 최종 요약 -----
printf '\n설정 완료\n- SSH 포트: %s\n- Root 원격 로그인: no\n- UFW 허용 포트: %s/tcp, %s/tcp\n- AGENT_HOME: %s\n- upload_files: %s\n- api_keys: %s\n- log dir: %s\n' \
  "$SSH_PORT" \
  "$SSH_PORT" \
  "$APP_PORT" \
  "$AGENT_HOME" \
  "$UPLOAD_DIR" \
  "$API_KEY_DIR" \
  "$LOG_DIR"