import { createRouter, createWebHistory } from 'vue-router'
import AppShell from '../layouts/AppShell.vue'
import LoginView from '../views/LoginView.vue'
import TripsView from '../views/TripsView.vue'
import TripCreateView from '../views/TripCreateView.vue'
import TripDetailView from '../views/TripDetailView.vue'
import { useSessionStore } from '../stores/session'

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
    { path: '/my-trips', component: Placeholder('我的出行'), name: 'my-trips' },
    { path: '/profile', component: Placeholder('我的'), name: 'profile' },
  ],
})

router.beforeEach((to) => {
  if (!to.meta.requiresAuth || useSessionStore().user) return true
  const path = `${to.path}${to.query && Object.keys(to.query).length ? `?${new URLSearchParams(to.query as Record<string, string>).toString()}` : ''}`
  const redirect = path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : '/trips'
  return { name: 'login', query: { redirect } }
})
