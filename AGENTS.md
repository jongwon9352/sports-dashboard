# Project Rules

## Mandatory Communication Rules

- 모든 사용자 설명과 작업 보고는 한국어로 작성한다.
- 작업 전 관련 파일과 기존 패턴을 먼저 읽고, 불필요한 리팩터링을 피한다.
- 보안 토큰, 로컬 세션 파일, 빌드 도구의 임시 산출물은 커밋하지 않는다.
- 앱의 실제 데이터 경로와 같은 백엔드를 사용한다. 화면이 Supabase를 읽으면 업로드/수정도 Supabase에 저장한다.
- TLS 인증서 검증, 인증, 권한 확인 같은 보안 기본값을 약화하지 않는다.
- 변경 후 가능한 범위에서 `npm run build`, `bun run build`, `bun run lint` 또는 해당 프로젝트의 검증 명령을 실행한다.

## Mandatory Coding Behavior Guidelines

These behavioral guidelines are mandatory. Merge them with project-specific instructions as needed.

Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

Do not assume. Do not hide confusion. Surface tradeoffs.

Before implementing:

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them; do not pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what is confusing. Ask.

### 2. Simplicity First

Write the minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No flexibility or configurability that was not requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.
- Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

Touch only what is required. Clean up only your own mess.

When editing existing code:

- Do not improve adjacent code, comments, or formatting.
- Do not refactor things that are not broken.
- Match existing style, even if you would do it differently.
- If unrelated dead code is found, mention it; do not delete it.

When your changes create orphans:

- Remove imports, variables, and functions that your changes made unused.
- Do not remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" means write tests for invalid inputs, then make them pass.
- "Fix the bug" means write a test that reproduces it, then make it pass.
- "Refactor X" means ensure tests pass before and after.

For multi-step tasks, state a brief plan:

1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]

Strong success criteria let you loop independently. Weak criteria such as "make it work" require clarification.

These guidelines are working if there are fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
