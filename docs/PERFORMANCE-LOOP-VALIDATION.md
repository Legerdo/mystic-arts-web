# BoxedWine 원본 NormalCPU WASM을 이용한 5개 hot loop 독립 검증

**2026-10-18, Windows 11 / Node 단위 실행.** 대상은 26R1 SingleThreaded BoxedWine 원본 인터프리터의 다섯 Wine DLL hot basic block과 `web/lab/hot-loops/loops.wasm`의 실험용 가속 함수다. 브라우저·게임 프로세스·서버는 실행하지 않았다. 원본 `Mystic.exe`, 64개 자산, `runtime/`, `src/`, `lab/hot-loops/`는 변경하지 않았다.

## 결과

**215/215 PASS, 실제 원본 WASM oracle 예외 0건.** `web/lab/loop-validation/oracle-differential.mjs`에서 Node의 WebAssembly 인스턴스로 원본 `NormalCPU::run`을 실행하고, 같은 캡처 초기 상태를 복원해 가속 경로와 바이트 단위로 비교했다.

| 종류 | copy | palette | alpha | mix | filter | 합계 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 정상: `accelerate(N)+original(1)` ↔ `original(N+1)` | 24 | 24 | 24 | 24 | 24 | **120 PASS** |
| 거부: `accelerate()==0`, 상태 불변 | 19 | 19 | 19 | 19 | 19 | **95 PASS** |

정상 구간의 `N`은 **2~25**, 각 비교에서 **CPU 1,392바이트 전체와 매핑한 실제 물리 RAM 페이지 8~24KiB 전체**가 일치했다. 추가로 디코드된 opcode 노드(각 24바이트), 역방향 분기 대상 포인터, MMU 매핑 엔트리, 스케줄러 quota 메모리를 비교했다. 매 원본 `NormalCPU::run` 호출 직전과 직후에 EIP·`nextOp`가 캡처된 backward branch의 시작으로 복귀하는 조건을 검사했다. 즉 아직 루프 종료 후 복잡한 `getOp`/OS 디코더 경로는 검증 범위가 아니다.

검증기는 6개 종류의 상태 바이트를 고의로 변조해 비교기가 CPU/RAM/opcode/branch/scheduler/MMU 차이를 모두 발견하는 **false-green 음성 대조군**도 통과했다. 실행 결과 `lab/loop-validation/report.json`에는 215개 사례별 입력, 난수 시드, 조건, `N`, 비교 byte 수와 실패 정보가 보존되어 있다.

## 고정 입력과 실제 실행 ABI

| 검증 대상 | SHA-256 |
| --- | --- |
| `runtime/SingleThreaded/boxedwine.wasm` | `d4148bda3955e0378de56719c716610f2e1daffd3581d0a2085970ba4df1decf` |
| `lab/hot-loops/loops.wasm` (이번 Node 실행 시작 시 메모리 스냅샷) | `c18f09a77406970beb453786e2cd2175fbfd03c83dc2db6decc6506b00f59c12` |
| `lab/hot-loops/oracle-fixtures.json` | `436129405817818cb5e0403cd77f4938d472f8a0e299a42cb75360959a41a0d9` |

원본을 `new WebAssembly.Module(originalBytes)`와 `new WebAssembly.Instance(module,imports)`로 로딩한다. **모든 원본 host 함수 import를 호출 즉시 예외를 던지는 stub**으로 설정했다. 외부 지원 함수나 런처 동작을 흉내 내서 통과시키지 않았다. 이 상태에서 다섯 decoded block의 원본 핸들러, `KMemory` RAM 빠른 경로 및 후방 분기가 전부 정상 실행했고 stub 예외가 발생하지 않았다. 다른 guest 경로나 느린 MMU 처리에 이 결과를 확대 적용하지 않는다.

Fixture는 메인 측 실제 브라우저 샘플에서 캡처한 `cpuHex`(1,392B), `eip`, `codeHex`, `nodes[{address,hex}]`(각 24B), `jumpPointer` 및 `jumpTarget`을 사용한다. 재배치한 CPU/메모리를 다음과 같이 복원했다.

| 주소 / 멤버 | 처리 |
| --- | --- |
| `CPU=0x800000` | 원본 캡처 1,392B 복사, 테스트별 guest 레지스터·XMM 입력 교체 |
| `CPU+116..151` | `reg8` 9개 포인터를 신규 CPU의 `[4,8,12,16,5,9,13,17,36]` 오프셋에 재바인딩 |
| `CPU+700` | `KMemory=0x200000` |
| `KMemory+8` | `KMemoryData=0x300000` |
| `KMemoryData+4+(guestAddress>>>12)*4` | 호스트 물리 페이지 `>=0xA00000`를 가리키는 32비트 `physicalPage|flags` 복원. 읽기 bit0=1, 쓰기 bit1=2 |
| `CPU+708`, captured nodes, `jumpPointer` | 첫 원본 decoded node 포인터, 노드 24B 전부와 이미 캐시된 backward jump target 복원 |
| `guest EIP` 페이지 | 캡처 `codeHex`의 실제 x86 바이트를 **읽기 가능, 쓰기 제한**으로 매핑 |
| `0x4de54=319060` | 테스트별 게스트 instruction quota를 설정. 정상 사례에서 정확히 N개의 fused iteration + 마지막 original iteration 허용 |

테스트는 원본 모듈의 함수 테이블 **slot 1443 `(CPU*)->void`**를 참조한다. `loops.wasm`은 같은 원본 메모리와 원본 실행 함수를 `env.memory`/`env.original`로 가져온다. 원본 WASM과 가속 WASM의 바이트열은 **실행 시작 시 한 번만 읽고** 해시를 기록하며, 이후에는 그 모듈 스냅샷만 사용한다. 메인 작업자가 다른 버전의 `loops.wasm`을 작성하는 중이어도 테스트 중간에 교체 버전을 읽어 섞지 않는다.

각 정상 testcase는 캡처 노드 및 guest code, 난수 CPU 레지스터, 필요한 guest RAM 페이지를 구성한다. `initial` 스냅샷을 얻고 다음 과정을 순차 실행한다.

1. `accelerated.accelerate(CPU)`를 호출하여 **정확히 기대한 N**을 처리했는지 검사한다. N=0이면 정상 케이스 실패다.
2. 실제 원본 `table.get(1443)(CPU)`를 한 번 실행하고 모든 CPU·RAM·노드·MMU·quota를 `fast` 스냅샷에 저장한다.
3. **초기 상태 전체를 복원**한다. 이전의 가속 결과를 원본 비교에 재사용하지 않는다.
4. 같은 원본 함수 `table.get(1443)(CPU)`를 N+1번 실행하며, **매 호출에서 backward branch 유지**를 확인한다.
5. 최초와 최종의 1,392B CPU, 전체 매핑 물리 페이지, 원본 24B nodes, jump pointer, quota, MMU entries를 bytewise 비교한다. 한 바이트라도 다르면 testcase FAIL이며 offset·양쪽 byte·초기 레지스터·시드·case ID를 기록한다.

원본 함수 호출이 예외를 던지거나 허용한 backward branch를 벗어나면 그 케이스를 FAIL로 보고한다. 일부 페이지나 레지스터의 차이를 허용하는 예외 기준은 사용하지 않는다.

## 정상 케이스 분포와 악성/경계 입력

| 루프 | 정상 입력 / 비교 의미 | 거부 테스트 |
| --- | --- | --- |
| `copy` `EIP=d0d9a3c3` | 비정렬 dword 복사, 동일/앞·뒤 중첩, **서로 다른 guest page가 동일한 물리 page를 참조**하는 alias, 페이지 말단 | guest/page 접근 불가·readonly/COW·4K 교차 |
| `palette` `d0fd18f0` | 256개 dword 팔레트, **4K 경계에서 palette table이 두 페이지로 분리되는 8사례**, index 바이트 및 읽기 전용 limit | table 비읽기, limit/destination 물리 alias, bad opcode·권한·세그먼트 |
| `alpha` `d172d224` | 원본 `EDI` 마스크의 32비트 OR와 길이 조건, 여러 마스크·목적지 초기값 | limit/mask 비읽기, read-only limit이 목적지와 물리 alias, COW·page crossing |
| `mix` `d1558204` | f32 곱셈 후 f32 누적 순서, 원본 XMM 상위 lane 유지, **signed zero 및 subnormal** 입력 포함 | NaN/Inf, MXCSR 변경, 읽기 금지 source(이 루프는 guest RAM 쓰기가 없으므로 dest read-only 자체는 정상) |
| `filter` `d155818e` | **캡처된 두 relocation 코드 즉시값 그대로** coefficient 주소 계산, phase/step 한계 7905, f32→f64→f32 연산 단계와 guest RAM store | coefficient 8바이트 접근의 4K crossing, NaN/Inf, MXCSR, permission, alias |

거부 사례 95개에서는 먼저 **변조 이전의 동일한 초기 입력이 `accelerate()==6`으로 실제 가속 가능함**을 확인하고 상태를 복원한 다음, 거부 조건 한 가지를 주입한다. 이후 `accelerate(CPU)==0`과 전체 CPU/RAM/node/MMU/quota 불변을 검사한다. 이 선행 검증은 다른 원인으로 이미 거부되는 fixture를 해당 경계 검사의 성공으로 잘못 처리하지 않도록 한다. 각 커널별로 malformed opcode, 16-bit mode, 비평탄 CS/SS/DS, unmapped/읽기 금지, read-only·COW 쓰기 금지, 교차 페이지, 부족한 quota, `yield`, 코드 page 비읽기 등을 실행했다. float 커널에는 NaN·Infinity 및 다른 MXCSR 반올림 모드도 넣었다.

**반드시 구분할 점:** 거부 테스트는 빠른 경로가 데이터를 건드리지 않고 **원본 인터프리터로 양보할 수 있음**을 확인한다. 거부 조건에서 복잡한 원본 page fault, copy-on-write, 비표준 MXCSR 처리까지 재현한 시험은 아니다. 표준 guest RAM 빠른 경로에서 통과한 정상 120건 역시 모든 OS/게임 상태의 완전한 동등성을 증명하지 않는다.

## 재현

```powershell
cd 'C:\Users\K\DevSpaceWorkspaces\미스틱 아츠(Mystic Arts)\web'
node --check lab/loop-validation/oracle-differential.mjs
node lab/loop-validation/oracle-differential.mjs
```

출력은 `lab/loop-validation/report.json`에 생성된다. 입력 WASM/fixture의 SHA, Node 환경, seed, 검증 통과/실패 건수, 테스트별 게스트 주소 및 실제 비교 크기를 검토하면 된다. 실행 코드는 sidecar/원본 module을 **파일에서 한 번씩** 읽으며 게임을 시작하지 않는다. 독립 비교를 통과하기 위한 특정 느슨한 허용치, 프레임률 수치, 렌더 present/rAF 계측이 없다.

**완료 범위:** 실행 가능한 Node 원본-WASM 오라클과 215건의 독립 differential/guard 결과. **미검증:** 현재 배포 launcher에 대한 이 oracle 모듈 연결, guest slow MMU fault/COW 예외 처리, Windows 원본과 게임의 16스테이지·저장·MIDI·타이밍 parity, 장시간 CPU/yield 인터리빙, 30–60FPS 실제 성능. 원본 게임 타이밍과 16라운드 전체를 검증한 것으로 해석하지 않는다.
