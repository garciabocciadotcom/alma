const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { calculatePattern } = require('../alma-patterns-content');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

const SITE_URL = process.env.SITE_URL; // e.g. https://alma.yourdomain.com

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, email, answers } = req.body;

    if (!name || !email || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'Missing required fields: name, email, answers' });
    }

    // 1. Calculate pattern from answers
    const pattern = calculatePattern(answers);

    // 2. Save to Supabase
    const { data, error: dbError } = await supabase
      .from('quiz_results')
      .insert({ name, email, answers, pattern })
      .select('id')
      .single();

    if (dbError) {
      console.error('Supabase error:', dbError);
      return res.status(500).json({ error: 'Failed to save result' });
    }

    const resultId = data.id;
    const resultUrl = `${SITE_URL}/results.html?id=${resultId}`;

    // 3. Send email via Resend
    const { error: emailError } = await resend.emails.send({
      from: 'Sofia at Alma <sofia@yourdomain.com>',
      to: email,
      subject: `${name}, your Alma result is ready`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin:0;padding:0;background:#faf9f7;font-family:Georgia,serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f7;padding:40px 20px;">
              <tr>
                <td align="center">
                  <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
                    <tr>
                      <td style="background:#1a1a1a;padding:32px 40px;text-align:center;">
                        <p style="margin:0;color:#c9b99a;font-size:13px;letter-spacing:3px;text-transform:uppercase;">alma</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:48px 40px;">
                        <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">Dear ${name},</p>
                        <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
                          Thank you for taking the time to go through the quiz. Your result is ready.
                        </p>
                        <p style="margin:0 0 32px;font-size:15px;color:#555;line-height:1.6;">
                          What you will find inside is not a generic summary. It is a detailed reflection of your specific pattern, written to help you feel understood, not categorized.
                        </p>
                        <table cellpadding="0" cellspacing="0" style="margin:0 auto 40px;">
                          <tr>
                            <td style="background:#1a1a1a;border-radius:6px;padding:16px 32px;text-align:center;">
                              <a href="${resultUrl}" style="color:#ffffff;text-decoration:none;font-size:15px;font-family:Georgia,serif;letter-spacing:0.5px;">
                                See your result
                              </a>
                            </td>
                          </tr>
                        </table>
                        <p style="margin:0 0 8px;font-size:14px;color:#999;line-height:1.6;">
                          If the button does not work, copy and paste this link:
                        </p>
                        <p style="margin:0 0 40px;font-size:13px;color:#bbb;word-break:break-all;">${resultUrl}</p>
                        <p style="margin:0 0 4px;font-size:15px;color:#555;">With care,</p>
                        <p style="margin:0;font-size:15px;color:#555;">Sofia</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="background:#f5f4f2;padding:24px 40px;text-align:center;">
                        <p style="margin:0;font-size:12px;color:#aaa;">
                          You received this email because you completed the Alma quiz.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    if (emailError) {
      console.error('Resend error:', emailError);
      return res.status(200).json({ success: true, warning: 'Result saved but email failed to send' });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
