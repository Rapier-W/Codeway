import { createRouter, createWebHistory } from 'vue-router'
import AppShell from '../layouts/AppShell.vue'
import LoginView from '../views/LoginView.vue'
import TripsView from '../views/TripsView.vue'
import TripCreateView from '../views/TripCreateView.vue'
import TripDetailView from '../views/TripDetailView.vue'

const Placeholder = (title: string) => ({ template: `<main class="page"><h1>${title}</h1><p>功能正在接入中。</p></main>` })

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/trips' },
    { path: '/', component: AppShell, children: [] },
    { path: '/login', component: LoginView, name: 'login' },
    { path: '/trips', component: TripsView, name: 'trips' },
    { path: '/trips/create', component: TripCreateView, name: 'trip-create' },
    { path: '/trips/:id', component: TripDetailView, name: 'trip-detail' },
    { path: '/my-trips', component: Placeholder('我的出行'), name: 'my-trips' },
    { path: '/profile', component: Placeholder('我的'), name: 'profile' },
  ],
})
