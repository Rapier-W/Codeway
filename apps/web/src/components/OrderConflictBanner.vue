<script setup lang="ts">
defineProps<{ disputed: boolean }>()
</script>
<template><div v-if="disputed" class="conflict-banner" role="alert">争议处理中：结算与互评已锁定，请等待处理结果。</div></template>
