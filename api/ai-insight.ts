// Vercel Serverless Function — Physical 탭 레이더 차트의 "차트 해석"·"운동 처방" 문구를
// Anthropic API로 생성한다. API 키는 서버에서만 사용하고 클라이언트에 노출하지 않는다.
export const config = { runtime: 'edge' };

interface AxisScore {
  key: string;
  ko: string;
  en: string;
  score: number | null;
  teamAvg: number | null;
}

interface RequestBody {
  playerName: string;
  axes: AxisScore[];
  imbalance: { label: string; percent: number } | null;
  maturityStage: string | null;
  height: number | null;
  weight: number | null;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), { status: 500 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  const { playerName, axes, imbalance, maturityStage, height, weight } = body;

  const axesText = axes
    .map(a => `- ${a.ko}(${a.en}): ${a.score ?? '없음'}점 (팀 평균 ${a.teamAvg ?? '없음'}점)`)
    .join('\n');

  const prompt = `당신은 유소년 축구팀의 스포츠 사이언스 담당자를 돕는 어시스턴트입니다.
아래 선수의 피지컬 프로필 데이터를 보고, 반드시 아래 JSON 형식으로만 답하세요. 다른 설명 없이 JSON만 출력하세요.

선수: ${playerName}
현재 키: ${height ?? '없음'}cm, 몸무게: ${weight ?? '없음'}kg
신체 성숙 단계: ${maturityStage ?? '기록 없음'}
5개 항목 점수(0~100, 팀 평균 대비):
${axesText}
좌우 불균형: ${imbalance ? `${imbalance.label} ${imbalance.percent.toFixed(1)}%` : '특이사항 없음'}

JSON 형식:
{
  "interpretation": "5개 항목 중 강점과 약점을 팀 평균과 비교해 설명하는 2~3문장 (한국어, 존댓말)",
  "prescriptionTitle": "가장 보완이 필요한 항목 기준 처방 제목 (예: '밸런스 (Balance) 보완')",
  "prescriptionText": "성숙 단계·키/몸무게·좌우 불균형을 고려한 구체적 운동 처방 코멘트 1~2문장 (한국어, 존댓말)"
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: `Anthropic API error: ${errText}` }), { status: 502 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'AI 응답을 파싱할 수 없습니다.' }), { status: 502 });
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return new Response(JSON.stringify(parsed), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), { status: 500 });
  }
}
