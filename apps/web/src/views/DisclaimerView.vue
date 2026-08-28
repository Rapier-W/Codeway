<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <main class="page">
    <div class="eyebrow">推荐说明</div>
    <h1>行程推荐免责声明</h1>

    <section class="detail-card">
      <h2>我们如何推荐</h2>
      <p>同路行的行程推荐基于以下<strong>有限信号</strong>生成，仅用于帮助你更快发现可能顺路的同行：</p>
      <ul>
        <li><strong>时间相近</strong>：出发时间与你的常用时段接近；</li>
        <li><strong>履约较好</strong>：发单人历史成团与准时记录；</li>
        <li><strong>已验证</strong>：完成手机号等实名验证；</li>
        <li><strong>空位充足</strong>：当前仍有较多剩余席位。</li>
      </ul>
    </section>

    <section class="detail-card">
      <h2>重要免责</h2>
      <p>推荐结果<strong>不构成任何担保或承诺</strong>，也不代表平台对发单人、乘客或行程本身的背书。我们不对以下事项作出保证：</p>
      <ul>
        <li>推荐行程一定匹配成功、一定成团或一定按时出发；</li>
        <li>同行人员的身份、品行、履约能力或出行安全；</li>
        <li>任何因同行产生的财产或人身损害。</li>
      </ul>
      <p>是否加入某个行程、是否与陌生人同行，<strong>由你自行判断并承担相应风险</strong>。线下见面、拼车与费用结算请务必通过平台内置的确认、订单与争议流程完成，避免线下私下交易。</p>
    </section>

    <section class="detail-card">
      <h2>隐私与算法</h2>
      <p>推荐仅使用必要的行程与履约特征，不会向其他用户泄露你的手机号、精确位置或订单截图。算法会持续迭代，推荐结果可能随数据更新而变化，不属于合同承诺的一部分。</p>
    </section>

    <button class="secondary-button" @click="router.back()">返回</button>
  </main>
</template>

<style scoped>
h2 { font-size: 16px; margin: 12px 0 6px; }
ul { padding-left: 20px; }
li { margin: 4px 0; }
</style>
