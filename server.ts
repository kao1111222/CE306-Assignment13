import "dotenv/config";
import app from "./app.js";
import { prisma } from "./lib/prisma.js";
import { startDueReminderScheduler } from "./lib/reminders.js";

const PORT = Number(process.env.PORT) || 3001;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
const stopDueReminders = startDueReminderScheduler();

async function shutdown() {
  stopDueReminders();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
