const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);
const SITE_URL = process.env.SITE_URL;

function calculatePattern(answers) {
  const scores = { A: 0, B: 0, C: 0 };
  const QUESTIONS = [
    { id: 1, options: [{ A: 4, B: 0, C: 0 }, { A: 3, B: 1, C: 0 }, { A: 1, B: 2, C: 1 }, { A: 2, B: 1, C: 1 }] },
    { id: 2, options: [{ A: 0, B: 4, C: 0 }, { A: 1, B: 3, C: 0 }, { A: 1, B: 2, C: 1 }, { A: 0, B: 1, C: 2 }] },
    { id: 3, options: [{ A: 4, B: 0, C: 0 }, { A: 2, B: 1, C: 1 }, { A: 3, B: 0, C: 1 }, { A: 2, B: 0, C: 2 }] },
    { id: 4, options: [{ A: 1, B: 1, C: 0 }, { A: 0, B: 0, C: 1 }, { A: 0, B: 0, C: 3 }, { A: 0, B: 0, C: 4 }] },
    { id: 5, options: [{ A: 0, B: 4, C: 0 }, { A: 0, B: 3, C: 1 }, { A: 1, B: 3, C: 0 }, { A: 1, B: 2, C: 2 }] },
    { id: 6, options: [{ A: 4, B: 0, C: 0 }, { A: 3, B: 0, C: 1 }, { A: 2, B: 0, C: 2 }, { A: 0, B: 0, C: 3 }] },
    { id: 7, options: [{ A: 0, B: 0, C: 2 }, { A: 0, B: 1, C: 3 }, { A: 1, B: 1, C: 2 }, { A: 0, B: 0, C: 4 }] },
    { id: 8, options: [{ A: 0, B: 4, C: 0 }, { A: 0, B: 3, C: 1 }, { A: 1, B: 4, C: 0 }, { A: 0, B: 2, C: 1 }] },
    { id: 9, options: [{ A: 0, B: 0, C: 2 }, { A: 2, B: 0, C: 2 }, { A: 1, B: 0, C: 3 }, { A: 1, B: 1, C: 4 }] }
  ];

  for (const answer of answers) {
    const qId = answer.qIndex !== undefined ? answer.qIndex + 1 : answer.questionId;
    const question = QUESTIONS.find(q => q.id === qId);
    if (!question) continue;
    const option = question.options[answer.optionIndex];
    if (!option) continue;
    scores.A += option.A || 0;
    scores.B += option.B || 0;
    scores.C += option.C || 0;
  }

  const total = scores.A + scores.B + scores.C;
  if (total === 0) return 'survivor';
  const aR = scores.A / total, bR = scores.B / total, cR = scores.C / total;
  if (aR >= 0.45 && cR < 0.35) return 'fixer';
  if (bR >= 0.45 && aR >= 0.15) return 'doubter';
  if (cR >= 0.45 && aR < 0.25) return 'walker';
  return 'survivor';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, email, answers } = req.body;

    if (!name || !email || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const pattern = calculatePattern(answers);

    const { data, error: dbError } = await supabase
      .from('quiz_results')
      .insert({ name, email, answers, pattern })
      .select('id')
      .single();

    if (dbError) {
      console.error('Supabase error:', dbError);
      return res.status(500).json({ error: 'Failed to save result' });
    }

    const resultUrl = `${SITE_URL}/results.html?id=${data.id}`;

    const { error: emailError } = await resend.emails.send({
      from: 'Sofia at Alma <onboarding@resend.dev>',
      to: email,
      subject: `${name}, your Alma result is ready`,
      html: `
        <div style="max-width:560px;margin:0 auto;font-family:Georgia,serif;background:#faf9f6;padding:40px 20px;">
          <div style="background:#1a1714;padding:24px;text-align:center;margin-bottom:32px;">
            <p style="margin:0;color:#c9b99a;font-size:13px;letter-spacing:3px;">ALMA</p>
          </div>
          <p style="font-size:16px;color:#3d3830;line-height:1.7;">Dear ${name},</p>
          <p style="font-size:16px;color:#3d3830;line-height:1.7;margin:16px 0;">Your result is ready. What you will find is not a generic summary. It is a detailed reflection of your specific pattern.</p>
          <div style="text-align:center;margin:40px 0;">
            <a href="${resultUrl}" style="background:#1a1714;color:#ffffff;text-decoration:none;padding:16px 32px;font-size:16px;font-family:Georgia,serif;">
              See your result
            </a>
          </div>
          <p style="font-size:13px;color:#8a8275;word-break:break-all;">Or copy this link: ${resultUrl}</p>
          <p style="font-size:16px;color:#3d3830;margin-top:32px;">With care,<br>Sofia</p>
        </div>
      `,
    });

    if (emailError) {
      console.error('Resend error:', emailError);
      return res.status(200).json({ success: true, warning: 'Saved but email failed' });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
