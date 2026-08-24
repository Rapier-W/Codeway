<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Tabbar, TabbarItem } from 'vant'

const route = useRoute()
const router = useRouter()
const active = computed(() => {
  if (route.path.startsWith('/my-trips')) return 'my-trips'
  if (route.path.startsWith('/profile')) return 'profile'
  return 'trips'
})
const navigate = (name: string) => router.push({ name })
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div class="app-shell">
    <header class="topbar"><span class="brand-mark">同路行</span><span class="brand-subtitle">一起出发，顺路同行</span></header>
    <main id="main-content" class="content-column"><router-view /></main>
    <Tabbar v-if="route.path !== '/login'" :model-value="active" safe-area-inset-bottom @change="navigate">
      <TabbarItem name="trips" icon="search">发现</TabbarItem>
      <TabbarItem name="trip-create" icon="plus" @click="router.push('/trips/create')">发布</TabbarItem>
      <TabbarItem name="my-trips" icon="orders">出行</TabbarItem>
      <TabbarItem name="profile" icon="user-o">我的</TabbarItem>
    </Tabbar>
  </div>
</template>
