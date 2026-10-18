# Wine hot-loop WASM 가속기: 읽기 전용 정합성 검토

## v2 후속 상태 기록 — 2026-10-18

**아래 F1–F5는 최초 v1 스냅샷의 정적 검토 이력이다. 특히 F2/F3을 현재 v2의 미해결 결함으로 읽지 말 것.** 이번 업데이트는 메인 에이전트가 전달한 실측 결과와 이 작업자가 새 소스·WAT·후보 파일을 **읽기 전용 재확인**한 사실을 구분한다.

| 구분 | v2 현재 판단과 근거 |
|---|---|
| **F2 — 이전 catch의 부분 참조 상태 계속 실행** | **v2 코드에서 수정 확인.** 새 `install.js:114–120`은 오류 시 초기 CPU **1,392바이트**와 목적지 RAM **4,096바이트**를 복원하고 original table slot을 복구한 뒤 오류를 **재전파(`throw error`)**한다. 이전 `n>0`일 때 1 반환하는 경로가 없어졌다. 메인은 검증 실패 시 runtime 중단한다고 보고했다. 이 작업자는 실패를 주입하거나 브라우저에서 독립 재시험하지 않았다. |
| **F3 — bulk의 중간 scheduler quota 무시** | **v2 소스와 생성 WAT에 budget guard 반영 확인.** `generate.mjs:64–71`, `loops.wat:38–45`가 `yield` offset 596, `blockInstructionCount` offset 592, `contextTimeRemaining` 주소 319060을 확인하고 `N×ops < quota−used`가 되도록 N을 제한한다. 따라서 원본 마지막 **한 decoded block만** quota 경계를 넘을 수 있도록 설계됐다. 이전 `99997→100009` 반례를 **현재 v2의 미해결 문제로 주장하지 않는다**. 게스트 시간·스레드 패리티 최종 판정은 별도 검증 범위에 따른다. |
| **v2 후보 파일 동일성 [독립 확인]** | `lab/performance-hot-loops-v2/runtime/cpu-loops.wasm`과 `lab/hot-loops/loops.wasm`은 모두 SHA-256 `c18f09a77406970beb453786e2cd2175fbfd03c83dc2db6decc6506b00f59c12`(3,068바이트). v2 패키지 `src/loop-accelerator.js`와 현재 `install.js`는 모두 `597b70fb6240dedb02d1fbadcff059850417c070126bb5ae35e468d32fa0d465`. 현재 `loops.wat` SHA-256은 `95b18dd9c9677706c7a104ac965b7eda898547297e3fcd95b4d7327508be3c49`. v2 manifest에 같은 WASM/JS 해시가 있다. 이는 **복제 후보 파일 동일성**의 증거다. source→WAT→WASM compile provenance의 완전한 자동 증명은 아직 별개이다. |
| **차등검증 80건 [메인 보고]** | v2 fresh build 후보에서 **80개 case 모두 CPU 1,392B 및 목적지 RAM 4,096B exact compare PASS**. 이 작업자는 해당 테스트/브라우저를 실행하지도 원시 로그를 독립 대조하지도 않았다. `CPU_BYTES=1392`와 full-size 비교 코드는 `install.js:15,75,82–93`에서 직접 확인했다. **80건 PASS는 그 입력들의 동등성 증거**이고 전체 guest semantics의 완전한 증명이라는 주장은 아니다. |
| **F1 — production `verify=false` 정책** | 매 방문마다 느린 self-test를 수행해야 한다는 요구가 아니다. **핀된 아티팩트의 독립 실행 단위 테스트/CI와 runtime ABI·opcode·page guard**가 실제 배포 게이트로 시행되고 결과가 보존된다면 production `verify=false`는 합리적인 선택이다. 옛 F1은 **검증 없는 후보 활성화 위험**을 지적한 것으로 해석한다. 해당 CI·게이트는 이번 작업자가 실행/검증하지 않았다. |
| **F4 — 컴파일 provenance** | v2 패키지와 현재 WASM/JS 해시 일치는 확인했다. `candidate.mjs` 자체는 아직 생성 source↔WAT↔WASM과 original assets 해시 체인을 강제하지 않는다. 메인이 compile provenance 도입을 진행할 예정이라고 보고했으며, **이미 완료됐다고 기록하지 않는다**. |
| **F5 — 조건부 범위 검사** | `generate.mjs:49`/`loops.wat:23`의 `i32.add(host,len)` 32비트 wrap 검사는 새 소스에도 존재한다. 유효 MMU에서 실제 도달할 증거는 없는 **조건부 방어 지적**으로 남긴다. |
| **추가 오라클 [진행 중]** | worker5가 캡처한 original `DecodedOp`를 원본 WASM에 재생하는 **offline CPU oracle** 개발 중이라는 메인 보고가 있다. 실행 결과 또는 PASS 완료로 간주하지 않는다. |

이후의 v1 코드·라인 번호·CPU 712B 표기는 **과거 스냅샷 재현 설명**이며 현재 상태 판단에는 위 v2 표를 우선한다.

2026-10-18. 범위는 `lab/hot-loops/generate.mjs`, `install.js`, `candidate.mjs`의 **3개 byte-exact Wine 루프(palette, copy, alpha)** 및 BoxedWine 26R1 공식 C++이다. 원본 `Mystic.exe` SHA-256은 `285d1bb736b36ebba95e88334223f5a6851f788926961155b4e1a74f7f63296f`(914,944바이트). 이 검토에서는 **원본 EXE/64개 자료, 후보, WAT/WASM, 테스트를 수정하거나 후보/프로파일/브라우저를 실행하지 않았다**. 이후 언급하는 반례는 소스 수준 판단이며 실제 게임 A/B의 FAIL 수치를 주장하지 않는다.

## 검사한 버전을 구별해야 함

| 파일 | 읽기 전용 SHA-256 및 내용 |
|---|---|
| 최초 `generate.mjs` | `0e6c78d5eb755e5c3c8bb4cedbe9b82658cf21810ff022217c77b5719c4f9765`, **3커널, quantum guard 없음** |
| `loops.wat` | `6c50c5bac2cb107e8ebeb269945fcc6eb2b2b495a66a51ae93b14040e10b3fb9`, 3커널+마지막 `original` 1회, `$budget` 없음, 최종 수정 08:23:56 UTC |
| `loops.wasm` | `4e3416f2a6ecf6c37b09283cc4b5966e8257da12cb2f6a8efaf02573270e7fe0`, 1,664바이트, 08:23:56 UTC |
| 이후 `generate.mjs` | `dc14726d35cdaf63a641b70dc2fe3d9221c73a1cb3be2d3434f599b133fbef9c`, 08:36:31 UTC에 **5커널(mix/filter)·`$budget` 추가**, 당시 출력 `loops.wat/wasm`은 구버전 |
| `install.js` | `95e6c1dd247705ad1edc15b8b9354a6aeff756fb7e62f47f6712bf2396426a47` |
| `candidate.mjs` | `38936a7816ebe7c6b4ee32bb8019411dbb4b30c6206c235e3bec05d7a8cdd24b` |

**초기 v1 검토 당시** 복제 후보 패키지의 WASM SHA는 검사하지 않았다. **v2에서는 위 상태표처럼 후보의 WASM/JS와 로컬 빌드 산출물이 바이트 해시로 일치함을 확인했다.** 동시 수정 중인 소스·보호장치를 과거 v1 A/B에 소급 적용하면 안 된다. 신규 mix/filter 2개는 초기 3루프 정적 리뷰 범위 밖이었다.

## v1 당시 확인된 문제 — v2 후속 상태는 위 표 우선

### F1 — 차등검증을 통과하지 않아도 가속기가 전면 활성화됨 [High]

`candidate.mjs:43–45`: `verify:!!globalThis.MYSTIC_VERIFY_LOOPS`. 별도 활성화가 없으면 `install.js:103–107`이 **감사 0회 상태에서도** `table.set(runSlot,fast.run)`으로 즉시 전면 적용한다. 가속 성능 실험용 구성으로는 가능하나 **원본 동등성 PASS의 근거는 아님**.

`verify=true`에서 `install.js:18–28` 샘플링 래퍼는 **CPU.run 호출 8,192회마다 1회** `verifyCase`를 호출한다. `install.js:56–64,89–94`는 각 커널의 *성공한 샘플 16건*을 채우면 `audit.complete=true`로 전면 전환한다. **같은 주소·같은 페이지·비슷한 레지스터의 16건도 통과**하며, 다른 `n`/MMU/alias/경계/flags 조합을 다뤘다는 보장은 없다. 따라서 `audit.complete`는 48개 표본 통과일 뿐 완전 검증 증명이 아니다. 반대로 `verify=true`이며 아직 16×3 미달인 A/B는 **대부분 원본 interpreter가 실행**되므로 후보 성능 비교에서 분리해야 한다. 비교 기준을 완화해 이 문턱을 낮추지 말 것.

### F2 — 검증 예외를 삼키고 부분 참조 상태에서 게임을 계속할 수 있음 [High]

`install.js:70–101`은 `fast.accelerate(cpu)`→마지막 `original(cpu)`→fast 상태 기록→CPU 712B와 destination 한 물리 4KB 복원→`original(cpu)`을 `n+1`회 독립 재생한다.

`:81`의 `reference left loop before all iterations` assert 또는 중간 `original(cpu)`가 throw해도 `:97–101`의 catch는 **`n>0`이면 무조건 `return 1`**한다. sampler `:20–23`는 true이면 정상 `original(cpu)` 호출을 건너뛴다. 따라서 참조 replay가 중도 종료했을 때는 **n+1 완료도 1회 원본 완료도 아닌 부분 반복 상태**에서 그대로 진행할 수 있다. 게스트 예외도 정상 `kscheduler.cpp:138–144` 처리로 재전파하지 않는다.

첫 CPU 712B와 첫 목적지 4KB만 복원하고 `getNextOp()` decoded-cache 및 다른 부작용을 완전히 되돌린다는 보장도 없다. 정상 reference가 n+1회 끝난 뒤 diff만 발견한 경로와 **재생 도중 실패 경로**는 구별해야 한다. 검증 실패는 해당 실행을 **FAIL 중단/로그 보존**해야 하며 자동 이어진 A/B를 정상 게임 PASS로 처리하면 안 된다.

### F3 — 기존 3루프 WASM은 원본 스케줄러의 중간 quantum 경계를 건너뜀 [High]

BoxedWine `normalCPU.cpp:35–45,214–230`의 `START_OP`는 guest 명령마다 `blockInstructionCount`를 올린다. `kscheduler.cpp:131–146`는 **`cpu->run()` 호출마다** `blockInstructionCount < contextTimeRemaining && !yield`를 검사한다.

기존 `loops.wat`의 `$count`는 bulk 1회에 `n×6` 또는 `n×7`을 더하고 곧바로 마지막 원본 1회를 실행한다. 예를 들어 `contextTimeRemaining=100000`, `blockInstructionCount=99997`, copy의 남은 2 dword(`n=1`)에서 순차 원본은 첫 반복의 6 instruction 후 `100003`에 스케줄러로 돌아간다. 기존 fast는 첫 1회를 생략 실행하고 count=`100003`인 채 **마지막 1회를 또 실행**해 count=`100009`로 돌아간다. 최종 CPU/페이지가 n+1 시점에서 일치해도 게스트 스레드·타이머가 실행되는 시점이 달라진다. 최대 batch는 6×256=1,536 또는 7×256=1,792 instructions.

최신 `generate.mjs:61–71`의 새 `$budget`는 `cpu.yield` offset596, `blockInstructionCount` offset592, `contextTimeRemaining` 주소319060을 사용해 `n≤(remaining−used−1)/ops`로 제한한다. **양자 초과 반례를 소스 차원에서 막는 합당한 수정**이다. 그러나 08:23:56 UTC의 실행용 `loops.wasm`에 추가됐다는 증거가 없으므로 **후보 재빌드/바이너리 검증 전에는 해결 완료라고 판단할 수 없다**. runtime별 static data ABI 주소319060이 그대로인지도 확인해야 한다.

### F4 — 최신 생성기와 실제 배포 WASM의 일치성 보증이 없음 [High]

`candidate.mjs:31`은 현재 존재하는 `loops.wasm`을 복사할 뿐, `generate.mjs` 실행, WAT 컴파일, 소스↔WASM 동일성 검증을 하지 않는다. `candidate.mjs:49`의 `cpuLoopWasmSha256`은 **복사한 파일 그 자체**의 해시다. 실제로 최신 `generate.mjs`(5커널, budget 포함)와 기존 `loops.wat`(3커널, budget 없음)이 동시에 존재했다. 따라서 소스 diff만 검토한 상태에서 실행 후보가 그 보호를 갖췄다고 주장할 수 없다.

`candidate.mjs:48`의 `originalGameFilesChanged:0`도 **상수 선언**이다. `copyTree`가 baseline bytes를 복제한다는 것은 맞지만 baseline이 진짜 원본 `Mystic.exe`+64개 자료 SHA와 같았음을 여기서 독립 검증하지 않는다. 다른 빌드/검증기가 이미 확인한 경우에는 그 로그를 연결해야 한다. A/B에서는 **generator SHA + generated WAT SHA + 실제 후보 WASM SHA + compiler/version + game manifest 원본 hashes**를 한 묶음으로 고정할 것.

### F5 — `$ptr`의 32비트 물리 포인터 overflow 검사 [조건부 코드 결함]

`generate.mjs:42–50`/구 `loops.wat:14–22`의 `i32.gt_u(i32.add(host,len),memory.size << 16)`은 32-bit 덧셈이 wrap된다. `host=0xffffff00`, `len=0x400`이라면 결과가 `0x300`이 되어 실제 범위를 넘는 포인터가 **검사를 통과할 수 있다**. 이런 잘못된 MMU entry를 실행 중 정상 BoxedWine이 생성했다는 증거는 **없다**. 따라서 실제 게임 실패로 단정할 수 없으나 “모든 범위 초과는 원본 softfault로 fallback” 계약을 코드상 보증하지는 못한다. `host <= memBytes && len <= memBytes-host`와 같은 subtract 기준 bounds 검사로 예방 가능하다.

## 정상 종료에 대해 실제로 확인한 사항

| 커널/정확한 x86 bytes | 원본 1회 동작 | 가속 정상경로에서 보존한 값 |
|---|---|---|
| `palette`: `83c2040fb60c068b8c8de8fbffff894afc83c0013947087fe7` (25B) | 7 op: `EDX+=4; ECX=byte[ESI+EAX]; ECX=dword[EBP+4*ECX−1048]; [EDX−4]=ECX; EAX++; cmp [EDI+8],EAX; jg -25` | signed limit-index-1, 256 상한, 다음 마지막 iteration에 필요한 src byte/dst dword preflight, EAX/EDX/ECX와 count 보존. dst가 limit 물리 주소와 겹치면 fallback |
| `copy`: `8b0a890883c20483c00439f275f2` (14B) | 6 op: `ECX=[EDX]; [EAX]=ECX; EDX+=4; EAX+=4; cmp EDX,ESI; jne -14` | unsigned `ESI>EDX`/4바이트 배수, src/dst 전체 다음 iteration 포함한 동일 4KB 페이지, ECX 최종값·count 보존. 각 dword를 **순서대로** load→store하므로 forward overlap 물리 alias 동작은 보존 |
| `alpha`: `8b7b44093c8283c0018b8ddcfbffff39c17fed` (19B) | 6 op: `EDI=[EBX+68]; [EDX+4*EAX] OR=EDI; EAX++; ECX=[EBP−1060]; cmp ECX,EAX; jg -19` | signed limit-index-1, dst READ+WRITE, 다음 iteration 위한 4KB 공간, mask·limit 목적지 **물리 중첩 시 fallback**, EAX/ECX/EDI와 count 보존 |

`soft_mmu.h:24–39`의 MMU는 bit0=RAM read, bit1=RAM write, high20=page index이고 `soft_ram.h:46–47`은 `ramPageGet(page)=page<<12`이다. `kmemory.cpp:806–818,858–874`의 fast read/write 조건과 세 가속 루프의 기본 mapping/preflight 설계가 일치한다. `CPU.big==1`(offset1384), CS/SS/DS base zero(48/56/64), 정확한 x86 bytes, slow/non-RAM fallback, 256 iteration 제한도 코드상 확인했다. 따라서 **무조건적인 alias/byte decode 오류를 꾸며내지 않는다**.

**Flags의 범위:** `cpu.h:194–210,217–225,299–310`에서 확인한 26R1 구조상 `install.js`의 첫 712-byte CPU 비교에는 EFLAGS와 lazy flag 필드(`src/dst/result/type`), EIP, `nextOp`가 포함된다. **“샘플에서 flags 자체를 전혀 비교하지 않는다”는 주장은 성립하지 않는다.** 각 루프가 마지막 원본 iteration에서 CMP/conditional branch를 **정상 완료**하면 최종 flags 및 EIP/nextOp는 원래 interpreter가 만든다. 다만 fast N개의 **중간 flags**는 계산하지 않는다. 외부 관찰 없이 정상 완료하는 경우에는 문제되지 않지만, 중간 예외·일정 quantum 경계·버전 변경·sample 미커버리지까지 보장하지 않는다.

## 메인 단독 PASS/FAIL 판정 조건

1. **무결성:** 실제 실행 후보의 generator/WAT/WASM/compiler/manifest hashes 및 원본 EXE SHA+64개 original assets 독립 일치. 선언된 `originalGameFilesChanged=0`만으로 PASS 불가.
2. **차등 상태:** 동일 초기 상태에서 원본 N+1 vs fast N+original1의 **CPU flags/EIP/nextOp/게스트 목적지 물리 4KB exact** 및 가능한 모든 side effect 검증. `n=1,2,256`, 4KB 경계(4088/4092), signed limit, MMU softfault, src/dst overlap, limit/mask 물리 alias를 각각 검사. **CPU 712B+4KB만 비교한 경우 검증 범위가 그만큼임을 명시**한다.
3. **스케줄/예외:** `remaining-used`가 1, ops-1, ops, ops+1인 조건 및 `yield`에서 guest thread 양보 지점이 같아야 하며, 검증 중 예외/참조 이탈은 중간 상태 계속 실행 없이 FAIL로 남긴다.
4. **실제 체감:** 기존 메인 측정의 **변경된 게임 이미지 FPS**·p95 gap·CPU·guest timeGetTime tick·입력·원본 palette/PCM/MIDI·Stage parity를 함께 비교. rAF/Canvas present 수치는 실제 FPS 대리값이 아니다.

**실행 여부:** 정적 코드·BoxedWine 원문 읽기와 파일 해시 확인만 실시. 새 WASM 생성/컴파일, 메인 candidate/test/profile/브라우저 실행, 30–60FPS 실측은 수행하지 않았다.
