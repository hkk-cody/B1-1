# ACL 설명

이 문서는 리눅스 파일 시스템에서 사용하는 ACL(Access Control List)을 설명한다. 이 저장소에서는 특정 그룹이 공유 디렉토리에 접근할 수 있도록 `setfacl`과 `getfacl`을 함께 사용하는 흐름을 기준으로 이해하면 된다.

## 1. ACL이란?

ACL은 파일이나 디렉토리에 대해 소유자, 그룹, 기타 사용자 외에 더 세밀한 접근 권한을 추가로 지정하는 방식이다.

기본 권한은 보통 다음 세 가지로 나뉜다.

- 소유자(owner)
- 그룹(group)
- 기타 사용자(others)

ACL은 여기에 특정 사용자나 특정 그룹을 더 추가해서 접근 범위를 세분화할 수 있다.

## 2. 왜 필요한가?

기본 `chmod`만으로는 하나의 그룹에만 권한을 주는 식으로 단순하게 관리해야 한다. 그런데 실제 서버 운영에서는 같은 디렉토리를 여러 역할의 사용자에게 다르게 열어야 하는 경우가 많다.

예를 들어,

- `agent-common` 그룹은 업로드 디렉토리 쓰기 권한이 필요할 수 있다.
- `agent-core` 그룹은 API 키 디렉토리와 로그 디렉토리 접근이 필요할 수 있다.
- 다른 사용자는 같은 디렉토리를 보지 못하게 해야 한다.

이럴 때 ACL을 쓰면 소유권 구조를 크게 바꾸지 않고도 필요한 권한만 추가할 수 있다.

## 3. 기본 권한과 ACL의 관계

ACL은 기본 권한을 완전히 대체하는 것이 아니라, 그 위에 추가로 적용된다.

- `chmod`는 기본 접근 틀을 정한다.
- `setfacl`은 특정 사용자나 그룹에 대한 예외 권한을 추가한다.
- `getfacl`은 현재 적용된 ACL을 확인한다.

중요한 점은 ACL을 줘도 기본 권한이 너무 좁으면 실제 접근이 막힐 수 있다는 것이다. 반대로 기본 권한이 너무 넓으면 ACL의 의미가 약해진다. 그래서 보통 `chmod`와 `setfacl`을 함께 맞춰서 관리한다.

## 4. 자주 쓰는 명령어

### ACL 확인

```bash
getfacl /path/to/directory
```

### ACL 추가 또는 수정

```bash
sudo setfacl -m g:agent-common:rwx /home/agent-admin/agent-app/upload_files
```

위 명령은 `agent-common` 그룹에 읽기, 쓰기, 실행 권한을 추가한다.

### 디폴트 ACL 설정

```bash
sudo setfacl -d -m g:agent-common:rwx /home/agent-admin/agent-app/upload_files
```

디폴트 ACL은 디렉토리 안에 새로 만들어지는 파일과 하위 디렉토리에 자동으로 적용되는 기준 권한이다.

## 5. 미션에서의 활용 예시

이 저장소의 설정 흐름에서는 다음과 같이 ACL을 사용한다.

- `upload_files` 디렉토리에는 `agent-common` 그룹 권한을 부여한다.
- `api_keys`와 로그 디렉토리에는 `agent-core` 그룹 권한을 부여한다.
- `setfacl -d`를 사용해 새 파일에도 같은 권한이 이어지도록 한다.

예시:

```bash
sudo setfacl -m g:agent-common:rwx /home/agent-admin/agent-app/upload_files
sudo setfacl -d -m g:agent-common:rwx /home/agent-admin/agent-app/upload_files
```

## 6. 확인할 때 보는 것

ACL 설정 후에는 다음을 확인하면 된다.

```bash
ls -ld /home/agent-admin/agent-app/upload_files
getfacl /home/agent-admin/agent-app/upload_files
```

확인할 핵심은 다음과 같다.

- 그룹 권한이 의도한 대로 들어갔는지
- `default:` 항목이 새 파일에도 적용되는지
- 불필요하게 넓은 권한이 열리지 않았는지

## 7. 정리

ACL은 리눅스 권한을 더 세밀하게 관리하기 위한 기능이다. 여러 역할이 같은 디렉토리를 공유해야 하는 서버에서는 `chmod`만으로는 부족할 수 있으며, 이때 `setfacl`과 `getfacl`을 사용하면 필요한 권한만 정확하게 부여할 수 있다.
