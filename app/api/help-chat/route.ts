import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { check, clientIp } from '@/lib/rate-limit'
import { listHelpArticles, getHelpArticle } from '@/lib/help'

// AI help-chat endpoint backed by Google's Gemini free tier.
//
// Pattern: RAG (retrieval-augmented generation) with a tiny corpus.
// Our help articles total a few thousand tokens, well under any
// LLM's context window, so we just bundle ALL of them into the
// system prompt every call. No embedding store needed at this scale.
//
// Free tier limits (gemini-2.0-flash, as of early 2026):
//   - 1500 requests/day
//   - 1M tokens/day
//   - 15 requests/min
// gemini-2.5-flash was the first attempt but its free tier is much
// tighter and gave 429s on first call from some regions. 2.0-flash
// has the generous free tier we need at beta scale.
// Per-user rate limit below caps each photographer at 30 questions
// per hour so a single account can't drain the daily budget.
//
// Auth: requires a Supabase Bearer token. Same gate as the help
// pages themselves — anonymous visitors don't see the chat input
// (the help page client-redirects them away), and even if they
// hit this endpoint directly we 401.

export const maxDuration = 30

interface ChatTurn {
  role:    'user' | 'model'
  content: string
}

const GEMINI_MODEL  = 'gemini-2.0-flash'
const GEMINI_API    = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const MAX_QUESTION_LENGTH = 600
const MAX_HISTORY_TURNS   = 6   // last N messages (user + model combined)

export async function POST(request: Request) {
  // 1. Auth — Bearer token required.
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: u } = await admin.auth.getUser(token)
  const user = u?.user
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // 2. Rate limit per user (30 questions/hour).
  // IP is also rate-limited as a backup so even multi-account
  // shenanigans don't bypass the cap.
  const ip = clientIp(request.headers)
  const userRl = check(`help-chat:user:${user.id}`, { windowMs: 60 * 60 * 1000, max: 30 })
  if (!userRl.ok) {
    return NextResponse.json({ error: 'rate_limited', message: "You've asked a lot of questions in the last hour — please give it a moment before asking again." }, { status: 429 })
  }
  const ipRl = check(`help-chat:ip:${ip}`, { windowMs: 60 * 60 * 1000, max: 60 })
  if (!ipRl.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  // 3. Gemini API key check — if missing, give the photographer a
  // friendly error instead of a 500 so they can still use the
  // categorized article list below.
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'unavailable', message: 'AI chat is temporarily unavailable. Please browse the articles below or contact support.' }, { status: 503 })
  }

  // 4. Validate body.
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION_LENGTH) : ''
  if (!question) return NextResponse.json({ error: 'empty_question' }, { status: 400 })

  const rawHistory = Array.isArray(body.history) ? body.history : []
  const history: ChatTurn[] = rawHistory
    .filter((t: any) => t && (t.role === 'user' || t.role === 'model') && typeof t.content === 'string')
    .slice(-MAX_HISTORY_TURNS)
    .map((t: any) => ({ role: t.role, content: t.content.slice(0, 2000) }))

  // 5. Build the prompt. Bundle every published help article into the
  // system instruction so the model has the full corpus available.
  const articles = listHelpArticles()
  const fullArticles = articles
    .map(meta => getHelpArticle(meta.slug))
    .filter((a): a is NonNullable<typeof a> => !!a)

  const corpus = fullArticles
    .map(a => `## ${a.title}\nCategory: ${a.category}\nSlug: ${a.slug}\nSummary: ${a.summary}\n\n${a.body}`)
    .join('\n\n---\n\n')

  const systemInstruction = `You are the in-app help assistant for LocateShoot, a SaaS for photographers. Your job is to answer photographer questions using ONLY the help-center articles provided below.

Rules:
- Stay grounded in the articles. If the answer isn't in them, say "I don't have that in the help center yet — try the in-app Feedback button to ask the LocateShoot team directly." Do not invent features, prices, or functionality.
- Be concise. Photographers are busy. Aim for 2-4 sentences for simple questions; longer for procedural answers.
- Use plain language, no emoji, no marketing fluff.
- When you reference an article, mention its title in plain text (the UI will surface a separate "Sources" link list, so you don't need to include URLs).
- If the question is off-topic for LocateShoot (general photography advice, weather, etc.), politely redirect: "I can help with how LocateShoot works. For [topic] you'll want to check elsewhere."
- Never claim to be a human or a different AI. If asked, say "I'm the LocateShoot help assistant powered by AI."

Help-center articles:

${corpus}`

  // 6. Build the Gemini request.
  const contents = [
    ...history.map(t => ({ role: t.role, parts: [{ text: t.content }] })),
    { role: 'user' as const, parts: [{ text: question }] },
  ]

  let geminiResponse: Response
  try {
    geminiResponse = await fetch(`${GEMINI_API}?key=${encodeURIComponent(apiKey)}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: {
          temperature:     0.3,
          maxOutputTokens: 700,
        },
      }),
    })
  } catch (e: any) {
    console.error('help-chat: fetch threw', e?.message ?? e)
    return NextResponse.json({ error: 'upstream_error', message: 'Sorry, the chat is having trouble right now. Please try again in a minute or browse the articles below.' }, { status: 502 })
  }

  if (!geminiResponse.ok) {
    const errText = await geminiResponse.text().catch(() => '')
    // Full body in Vercel logs so we can debug "free tier doesn't
    // include this model in your region" / "API key not enabled" /
    // "billing required" errors that all surface as 4xx with
    // distinct messages from Google.
    console.error('help-chat: gemini error', {
      model:    GEMINI_MODEL,
      status:   geminiResponse.status,
      body:     errText.slice(0, 1200),
      hasKey:   !!apiKey,
      keyLen:   apiKey.length,
    })
    // 429 from Gemini → bubble up as rate-limited so the UI can be
    // appropriately apologetic. Other errors get a generic message.
    if (geminiResponse.status === 429) {
      return NextResponse.json({ error: 'upstream_rate_limited', message: 'The help assistant is at its limit for the moment. Try again in a minute.' }, { status: 429 })
    }
    return NextResponse.json({ error: 'upstream_error', message: 'Sorry, the chat is having trouble right now.' }, { status: 502 })
  }

  const data = await geminiResponse.json().catch(() => null)
  const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof answer !== 'string' || !answer.trim()) {
    return NextResponse.json({ error: 'empty_answer', message: "The assistant didn't return an answer. Try rephrasing the question." }, { status: 502 })
  }

  // 7. Cite which articles the model mentioned by simple title-match.
  // More robust than asking the model to format URLs reliably; the
  // article list comes from the same source we sent to the model.
  const lowerAnswer = answer.toLowerCase()
  const cited = fullArticles
    .filter(a => lowerAnswer.includes(a.title.toLowerCase()))
    .slice(0, 4)
    .map(a => ({ slug: a.slug, title: a.title, category: a.category }))

  return NextResponse.json({
    answer: answer.trim(),
    sources: cited,
  })
}
