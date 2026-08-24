<script setup lang="ts">
defineProps<{ loading?: boolean; error?: Error | null; empty?: boolean; emptyText?: string }>()
const emit = defineEmits<{ retry: [] }>()
</script>
<template>
  <div v-if="loading" class="async-state" role="status">正在加载行程…</div>
  <div v-else-if="error" class="async-state state-error" role="alert"><p>{{ error.message }}</p><button class="secondary-button" @click="emit('retry')">重新加载</button></div>
  <div v-else-if="empty" class="async-state"><p>{{ emptyText || '暂时没有合适的行程' }}</p><RouterLink class="primary-button" to="/trips/create">发布行程</RouterLink></div>
</template>
