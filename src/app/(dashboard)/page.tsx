import { redirect } from 'next/navigation'

// Default dashboard route redirects to resume page
export default function DashboardHome() {
  redirect('/resume')
}
