/**
 * 마크다운 리포트를 A4 PDF 로 뽑는다.
 *
 *   bun run scripts/md2pdf.ts docs/reports/2026-u15-rpe-maturity.md
 *
 * PDF 는 저장소에 두지 않는다(.gitignore). 900KB~1.2MB 바이너리가 리포트를 고칠
 * 때마다 통째로 다시 커밋되기 때문이다. 필요할 때 이 스크립트로 다시 뽑는다.
 *
 * 렌더링은 헤드리스 크롬의 인쇄 엔진을 쓴다 — html2canvas 류와 달리 글자가
 * 이미지가 아니라 글자로 남고, 표를 쪽 경계에서 끊지 않는 CSS 가 그대로 먹는다.
 */
import { marked } from 'marked';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(existsSync);

const src = process.argv[2];
if (!src) { console.error('사용법: bun run scripts/md2pdf.ts <리포트.md> [출력.pdf]'); process.exit(1); }
if (!CHROME) { console.error('크롬을 찾지 못했습니다. 설치 경로를 CHROME 목록에 추가하세요.'); process.exit(1); }
const out = process.argv[3] ?? src.replace(/\.md$/, '.pdf');

// 닫는 ** 뒤에 한글이 오면 CommonMark 가 강조로 보지 않는다(**요일**이었다 → 그대로 출력).
const md = readFileSync(src, 'utf8').replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

// GFM 은 물결 하나도 취소선으로 본다. 이 문서는 ~ 를 범위 기호로 쓰므로(5,362~8,129)
// 되돌린다 — <del>A</del>B 는 원래 ~A~B 였다.
const body = (marked.parse(md, { async: false, gfm: true }) as string).replace(/<\/?del>/g, '~');

const css = `
@page { size: A4; margin: 11mm 12mm 13mm; }
:root { --ink:#1b2026; --sub:#5a6673; --line:#d8dee5; --soft:#f1f4f7; --brand:#a42843; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin:0; color:var(--ink);
  font-family:"Pretendard","Apple SD Gothic Neo",-apple-system,sans-serif;
  font-size:9.6pt; line-height:1.55; word-break:keep-all; overflow-wrap:anywhere; }
/* 제목이 쪽 끝에 홀로 남지 않게 한다 */
h1,h2,h3,h4 { line-height:1.3; break-after:avoid; page-break-after:avoid; }
h1 { font-size:17pt; margin:0 0 2mm; letter-spacing:-.02em; }
h2 { font-size:12.5pt; margin:7mm 0 2.5mm; padding-bottom:1.4mm;
     border-bottom:1.6px solid var(--ink); letter-spacing:-.01em; }
h2:first-of-type { margin-top:4mm; }
h3 { font-size:10.6pt; margin:4.5mm 0 1.6mm; color:var(--brand); }
h4 { font-size:9.8pt; margin:3mm 0 1.2mm; }
p { margin:0 0 2.2mm; }
strong { font-weight:650; }
hr { border:0; border-top:1px solid var(--line); margin:5mm 0; }
ul,ol { margin:0 0 2.4mm; padding-left:4.6mm; }
li { margin-bottom:1mm; }
li::marker { color:var(--sub); }
/* 표는 쪽 경계에서 끊지 않는다 */
table { width:100%; border-collapse:collapse; margin:2mm 0 3.4mm; font-size:8.6pt;
        break-inside:avoid; page-break-inside:avoid; }
thead { display:table-header-group; }
tr { break-inside:avoid; page-break-inside:avoid; }
th,td { border:1px solid var(--line); padding:1.3mm 1.8mm; text-align:right; vertical-align:top; }
th { background:var(--soft); font-weight:650; text-align:center; font-size:8.2pt; color:var(--ink); }
td:first-child, th:first-child { text-align:left; }
tbody tr:nth-child(even) td { background:#fafbfc; }
td br { line-height:1.3; }
blockquote { margin:2.4mm 0 3mm; padding:2mm 3mm; border-left:2.5px solid var(--brand);
             background:var(--soft); color:var(--sub); font-size:8.8pt; break-inside:avoid; }
blockquote p { margin:0 0 1.2mm; }
blockquote p:last-child { margin:0; }
code { font-family:"SF Mono",ui-monospace,monospace; font-size:8.4pt;
       background:var(--soft); padding:.4mm 1mm; border-radius:2px; }
em { color:var(--sub); font-style:normal; font-size:8.8pt; }
`;

const html = join(tmpdir(), `md2pdf-${process.pid}.html`);
writeFileSync(html, `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>${src}</title><style>${css}</style></head><body>${body}</body></html>`);

execFileSync(CHROME, ['--headless', '--disable-gpu', '--no-pdf-header-footer',
  `--print-to-pdf=${out}`, `file://${html}`], { stdio: 'ignore' });
console.log(`${out} 생성 완료`);
