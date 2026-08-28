import { createRouter, createWebHistory } from 'vue-router'
import AppShell from '../layouts/AppShell.vue'
import LoginView from '../views/LoginView.vue'
import TripsView from '../views/TripsView.vue'
import TripCreateView from '../views/TripCreateView.vue'
import TripDetailView from '../views/TripDetailView.vue'
import ChatView from '../views/ChatView.vue'; import MyTripsView from '../views/MyTripsView.vue'; import RideView from '../views/RideView.vue'; import OrderView from '../views/OrderView.vue'; import ReviewView from '../views/ReviewView.vue'
import { useSessionStore } from '../stores/session'
import SosView from '../views/SosView.vue'; import ProfileView from '../views/ProfileView.vue'; import FarePlanView from '../views/FarePlanView.vue'; import DisclaimerView from '../views/DisclaimerView.vue'

const Placeholder = (title: string) => ({ template: `<main class="page"><h1>${title}</h1><p>功能正在接入中。</p></main>` })

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/trips' },
    { path: '/', component: AppShell, children: [] },
    { path: '/login', component: LoginView, name: 'login' },
    { path: '/trips', component: TripsView, name: 'trips' },
    { path: '/trips/create', component: TripCreateView, name: 'trip-create', meta: { requiresAuth: true } },
    { path: '/trips/:id', component: TripDetailView, name: 'trip-detail', meta: { requiresAuth: true } },
    { path: '/my-trips', component: MyTripsView, name: 'my-trips', meta:{ requiresAuth:true } },
    { path: '/trips/:id/chat', component: ChatView, name: 'chat', meta:{ requiresAuth:true } },
    { path: '/trips/:id/ride', component: RideView, name: 'ride', meta:{ requiresAuth:true } },
    { path: '/orders/:id', component: OrderView, name: 'order', meta:{ requiresAuth:true } },
    { path: '/trips/:id/fare-plan', component: FarePlanView, name: 'fare-plan', meta:{ requiresAuth:true } },
    { path: '/orders/:id/review', component: ReviewView, name: 'review', meta:{ requiresAuth:true } },
    { path: '/profile', component: ProfileView, name: 'profile' },
    { path: '/disclaimer', component: DisclaimerView, name: 'disclaimer' },
    { path: '/sos', component: SosView, name: 'sos', meta: { requiresAuth: true } },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (import.meta.env.VITE_API_MODE === 'http' && !session.user) await session.restore()
  if (!to.meta.requiresAuth || session.user) return true
  const path = `${to.path}${to.query && Object.keys(to.query).length ? `?${new URLSearchParams(to.query as Record<string, string>).toString()}` : ''}`
  const redirect = path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : '/trips'
  return { name: 'login', query: { redirect } }
})
