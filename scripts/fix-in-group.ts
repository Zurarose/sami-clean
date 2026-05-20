import "dotenv/config";
import { prisma } from "../lib/prisma";

/**
 * One-time fix: mark all registered users as active in the group.
 * Use if people only ran /start in DM before the group flow was clear.
 */
async function main() {
  const result = await prisma.telegramUser.updateMany({
    data: { inGroup: true },
  });
  console.log(`Marked ${result.count} user(s) as inGroup=true`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
