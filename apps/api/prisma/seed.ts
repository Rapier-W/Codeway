import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 基线种子：仅保证脚本可重复执行，不写入任何敏感数据。
  await prisma.$connect();
  console.log('seed: database reachable, baseline seed is a no-op');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
