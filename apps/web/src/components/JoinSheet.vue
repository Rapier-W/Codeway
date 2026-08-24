<script setup lang="ts">
import { ref } from 'vue'
const props = defineProps<{ open: boolean; busy?: boolean; error?: string }>()
const emit = defineEmits<{ close: []; submit: [count: 1 | 2] }>()
const count = ref<1 | 2>(1)
</script>
<template><div v-if="props.open" class="sheet-backdrop" @click.self="emit('close')"><section class="sheet" role="dialog" aria-label="申请加入"><h2>申请加入</h2><p>选择你需要的席位数，发单人接受后才会占用席位。</p><div class="choice-row"><button :class="{ selected: count === 1 }" @click="count = 1">1 个席位</button><button :class="{ selected: count === 2 }" @click="count = 2">2 个席位</button></div><p v-if="error" class="form-error" role="alert">{{ error }}</p><button class="primary-button" :disabled="busy" @click="emit('submit', count)">{{ busy ? '提交中…' : '提交申请' }}</button></section></div></template>
