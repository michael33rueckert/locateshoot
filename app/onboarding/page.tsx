import { redirect } from 'next/navigation'

// The standalone onboarding picker has been folded into Step 4 of the
// walkthrough at /onboarding/how-it-works. This redirect catches any
// bookmarks / cached entry points pointing at the old route.

export default function OnboardingPage() {
  redirect('/onboarding/how-it-works')
}
