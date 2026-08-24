import { createRouter, createWebHistory } from 'vue-router'
import AppShell from '../layouts/AppShell.vue'

const Placeholder = (title: string) => ({ template: `<main class="page"><h1>${title}</h1><p>功能正在接入中。</p></main>` })

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/trips' },
    { path: '/', component: AppShell, children: [] },
    { path: '/login', component: Placeholder('登录'), name: 'login' },
    { path: '/trips', component: Placeholder('发现行程'), name: 'trips' },
    { path: '/trips/create', component: Placeholder('发布行程'), name: 'trip-create' },
    { path: '/trips/:id', component: Placeholder('行程详情'), name: 'trip-detail' },
    { path: '/my-trips', component: Placeholder('我的出行'), name: 'my-trips' },
    { path: '/profile', component: Placeholder('我的'), name: 'profile' },
  ],
})
